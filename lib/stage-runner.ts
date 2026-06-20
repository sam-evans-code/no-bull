import { after, NextResponse } from "next/server";
import { readJob, writeJob, type JobState, type JobResults, type StageName } from "@/lib/job-store";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";
import { pendoTrackServer } from "@/lib/pendo-server";

const GENERIC_ERROR_MESSAGE = "Something went wrong running the pipeline — please try again.";

interface StageConfig {
  name: StageName;
  terminal: boolean;
  run: (job: JobState) => Promise<Partial<JobResults>>;
}

// Fires the trigger POST for `stage`, bounded with a timeout and an explicit ok-check —
// an unbounded/unchecked fetch here previously caused a fully silent stall (CLAUDE.md
// Session 8 addendum #4). Marks the job failed immediately on failure rather than waiting
// for the 150s stale-job fallback to eventually catch it. Shared by POST /api/no-bull
// (which triggers "reframe" directly) and GET /api/no-bull/[jobId] (which now drives every
// later stage transition from the poll cycle — see addendum #6 for why stages no longer
// chain to each other directly).
export async function triggerStage(jobId: string, stage: StageName, origin: string): Promise<void> {
  try {
    const response = await fetch(`${origin}/api/no-bull/run/${stage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`trigger fetch to ${stage} returned HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[no-bull] failed to trigger ${stage} for job ${jobId}:`, err);
    const latest = await readJob(jobId);
    if (latest && latest.status !== "failed" && latest.status !== "complete") {
      latest.status = "failed";
      latest.failedAt = stage;
      latest.error = GENERIC_ERROR_MESSAGE;
      await writeJob(jobId, latest);
    }
  }
}

export async function handleStageRequest(request: Request, config: StageConfig): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = (body as { jobId?: unknown })?.jobId;
  if (typeof jobId !== "string" || jobId.length === 0) {
    return NextResponse.json({ error: '"jobId" is required and must be a string' }, { status: 400 });
  }

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "complete" || job.status === "failed") {
    return NextResponse.json(job, { status: 200 });
  }

  job.status = "running";
  await writeJob(jobId, job); // stamps lastUpdatedAt = now — bounds THIS stage's own staleness window

  // Ack immediately and do the real work inside after(). This is load-bearing, not a style
  // choice: if this handler instead awaited config.run() before responding, the caller's own
  // after()-triggered fetch (one hop up) would stay open for this invocation's ENTIRE
  // runtime, transitively chaining every downstream stage's duration into every upstream
  // invocation's 60s budget — the cascading-timeout bug this structure exists to prevent.
  // See CLAUDE.md Session 8 addendum #2. Note this stage no longer triggers the *next* stage
  // itself on completion — GET /api/no-bull/[jobId]'s poll cycle does that now (addendum #6),
  // since chaining stages directly hits a hard Vercel limit on nested after()-fetches at
  // exactly the 5th hop.
  after(() => runStageWork(jobId, job, config));

  return NextResponse.json({ jobId, status: "running" }, { status: 202 });
}

async function runStageWork(jobId: string, job: JobState, config: StageConfig): Promise<void> {
  const stageStart = Date.now();
  try {
    const partial = await config.run(job);
    Object.assign(job.results, partial);
    console.log(`[no-bull/run] ${config.name} took ${Date.now() - stageStart}ms`);

    // Race guard: a concurrent stale-job poll may have already marked this job "failed"
    // while this stage was mid-flight. Don't resurrect it back to running/complete.
    const latest = await readJob(jobId);
    if (latest?.status === "failed") {
      console.warn(
        `[no-bull/run] job ${jobId} was marked failed by stale detection mid-flight — discarding ${config.name}'s result, not advancing`
      );
      return;
    }

    if (config.terminal) {
      job.status = "complete";
      await writeJob(jobId, job);
      console.log(`[no-bull/run] job ${jobId} complete`);
      const factCheck = job.results.factCheck ?? [];
      await pendoTrackServer("pipeline_completed", {
        job_id: jobId,
        total_stages_completed: Object.keys(job.results).length,
        total_pipeline_duration_ms: Date.now() - job.createdAt,
        had_narrative_corrections: (job.results.narrativeCorrections ?? []).length > 0,
        had_contradicted_claims: factCheck.some((e) => e.verdict === "CONTRADICTED"),
      });
    } else {
      // Stays "running" with the new results written. The next poll will see this stage's
      // output and trigger whatever comes next — see triggerStage above.
      await writeJob(jobId, job);
    }
  } catch (error) {
    const latest = await readJob(jobId);
    if (latest?.status === "failed") {
      return; // same race guard on the failure path
    }
    console.error(`[no-bull/run] job ${jobId} failed at ${config.name}:`, error);
    const errorType =
      error instanceof StageValidationError
        ? "validation_error"
        : error instanceof StageApiError
          ? "api_error"
          : "unexpected";
    job.status = "failed";
    job.failedAt = config.name;
    job.error =
      error instanceof StageValidationError || error instanceof StageApiError
        ? error.message
        : GENERIC_ERROR_MESSAGE;
    await writeJob(jobId, job);
    await pendoTrackServer("pipeline_stage_failed", {
      stage_name: config.name,
      error_type: errorType,
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      stage_duration_ms: Date.now() - stageStart,
      stages_completed_before: Object.keys(job.results).length,
    });
  }
}

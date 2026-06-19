import { after, NextResponse } from "next/server";
import { readJob, writeJob, type JobState, type JobResults, type StageName } from "@/lib/job-store";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

const GENERIC_ERROR_MESSAGE = "Something went wrong running the pipeline — please try again.";

interface StageConfig {
  name: StageName;
  nextPath: string | null; // null = terminal stage (fact-check)
  run: (job: JobState) => Promise<Partial<JobResults>>;
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

  // Ack immediately and do the real work (the LLM call + triggering the next stage) inside
  // after(). This is load-bearing, not a style choice: if this handler instead awaited
  // config.run() before responding, the caller's own after()-triggered fetch (one hop up
  // the chain) would stay open for this invocation's ENTIRE runtime, transitively chaining
  // every downstream stage's duration into every upstream invocation's 60s budget — the
  // cascading-timeout bug this structure exists to prevent. See CLAUDE.md Session 8 addendum.
  const origin = new URL(request.url).origin;
  after(() => runStageWork(jobId, job, config, origin));

  return NextResponse.json({ jobId, status: "running" }, { status: 202 });
}

async function runStageWork(jobId: string, job: JobState, config: StageConfig, origin: string): Promise<void> {
  try {
    const stageStart = Date.now();
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

    if (config.nextPath) {
      await writeJob(jobId, job); // still "running"
      // Awaited, but the downstream route also acks-and-defers via this same function, so
      // this only waits for its fast ack — not its real work. That's what keeps this
      // invocation's own duration from absorbing the next stage's. Bounded with a timeout
      // and an explicit ok-check: an unbounded/unchecked fetch here silently stalls the
      // whole job with no thrown exception and no log line on either side of the hop —
      // confirmed live (job stalled identically between devils-advocate and
      // fact-check-extract even after fact-check-extract's own internal calls were already
      // timeout-bounded), so the hang/bad-response is in this hop itself, not downstream.
      try {
        const response = await fetch(`${origin}${config.nextPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          throw new Error(`trigger fetch to ${config.nextPath} returned HTTP ${response.status}`);
        }
      } catch (err) {
        console.error(`[no-bull/run] failed to trigger ${config.nextPath} for job ${jobId}:`, err);
        const latestOnFailure = await readJob(jobId);
        if (latestOnFailure && latestOnFailure.status !== "failed") {
          latestOnFailure.status = "failed";
          latestOnFailure.failedAt = config.name;
          latestOnFailure.error = GENERIC_ERROR_MESSAGE;
          await writeJob(jobId, latestOnFailure);
        }
      }
    } else {
      job.status = "complete";
      await writeJob(jobId, job);
      console.log(`[no-bull/run] job ${jobId} complete`);
    }
  } catch (error) {
    const latest = await readJob(jobId);
    if (latest?.status === "failed") {
      return; // same race guard on the failure path
    }
    console.error(`[no-bull/run] job ${jobId} failed at ${config.name}:`, error);
    job.status = "failed";
    job.failedAt = config.name;
    job.error =
      error instanceof StageValidationError || error instanceof StageApiError
        ? error.message
        : GENERIC_ERROR_MESSAGE;
    await writeJob(jobId, job);
  }
}

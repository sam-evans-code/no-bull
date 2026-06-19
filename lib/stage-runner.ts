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
      return NextResponse.json(latest, { status: 200 });
    }

    if (config.nextPath) {
      await writeJob(jobId, job); // still "running"
      const origin = new URL(request.url).origin;
      after(() => {
        return fetch(`${origin}${config.nextPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        }).catch((err) =>
          console.error(`[no-bull/run] failed to trigger ${config.nextPath} for job ${jobId}:`, err)
        );
      });
    } else {
      job.status = "complete";
      await writeJob(jobId, job);
      console.log(`[no-bull/run] job ${jobId} complete`);
    }
    return NextResponse.json(job, { status: 200 });
  } catch (error) {
    const latest = await readJob(jobId);
    if (latest?.status === "failed") {
      return NextResponse.json(latest, { status: 200 }); // same race guard on the failure path
    }
    console.error(`[no-bull/run] job ${jobId} failed at ${config.name}:`, error);
    job.status = "failed";
    job.failedAt = config.name;
    job.error =
      error instanceof StageValidationError || error instanceof StageApiError
        ? error.message
        : GENERIC_ERROR_MESSAGE;
    await writeJob(jobId, job);
    return NextResponse.json(job, { status: 200 });
  }
}

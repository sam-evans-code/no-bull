import { NextResponse } from "next/server";
import { runReframe } from "@/lib/stages/reframe";
import { runStressTest } from "@/lib/stages/stress-test";
import { runDevilsAdvocate } from "@/lib/stages/devils-advocate";
import { runFactCheck } from "@/lib/stages/fact-check";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";
import { readJob, writeJob, type StageName } from "@/lib/job-store";

export const maxDuration = 60;

const GENERIC_ERROR_MESSAGE = "Something went wrong running the pipeline — please try again.";

export async function POST(request: Request) {
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
  await writeJob(jobId, job);

  let currentStage: StageName = "reframe";
  const pipelineStart = Date.now();

  try {
    let stageStart = Date.now();
    const reframedQuestion = await runReframe(job.input);
    job.results.reframedQuestion = reframedQuestion;
    await writeJob(jobId, job);
    console.log(`[no-bull/run] reframe took ${Date.now() - stageStart}ms`);

    currentStage = "stress-test";
    stageStart = Date.now();
    const { stressTest, couldBeWrong } = await runStressTest(reframedQuestion);
    job.results.stressTest = stressTest;
    job.results.couldBeWrong = couldBeWrong;
    await writeJob(jobId, job);
    console.log(`[no-bull/run] stress-test took ${Date.now() - stageStart}ms`);

    currentStage = "devils-advocate";
    stageStart = Date.now();
    const devilsAdvocateCase = await runDevilsAdvocate(reframedQuestion, stressTest);
    job.results.devilsAdvocateCase = devilsAdvocateCase;
    await writeJob(jobId, job);
    console.log(`[no-bull/run] devils-advocate took ${Date.now() - stageStart}ms`);

    // Information asymmetry: fact-check only ever sees stressTest + devilsAdvocateCase,
    // never reframedQuestion or couldBeWrong — enforced by runFactCheck's own signature.
    currentStage = "fact-check";
    stageStart = Date.now();
    const factCheck = await runFactCheck(stressTest, devilsAdvocateCase);
    job.results.factCheck = factCheck;
    await writeJob(jobId, job);
    console.log(`[no-bull/run] fact-check took ${Date.now() - stageStart}ms`);

    job.status = "complete";
    await writeJob(jobId, job);
    console.log(`[no-bull/run] job ${jobId} complete — total: ${Date.now() - pipelineStart}ms`);

    return NextResponse.json(job, { status: 200 });
  } catch (error) {
    const totalMs = Date.now() - pipelineStart;
    console.error(`[no-bull/run] job ${jobId} failed at ${currentStage} after ${totalMs}ms:`, error);

    job.status = "failed";
    job.failedAt = currentStage;
    job.error =
      error instanceof StageValidationError || error instanceof StageApiError
        ? error.message
        : GENERIC_ERROR_MESSAGE;
    await writeJob(jobId, job);

    return NextResponse.json(job, { status: 200 });
  }
}

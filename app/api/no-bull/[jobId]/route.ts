import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  readJob,
  writeJob,
  isJobStale,
  buildStaleFailure,
  getNextStageToRun,
  isStageInFlight,
} from "@/lib/job-store";
import { triggerStage } from "@/lib/stage-runner";
import { pendoTrackServer } from "@/lib/pendo-server";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (isJobStale(job)) {
    const failedJob = buildStaleFailure(job);
    await writeJob(jobId, failedJob); // durably rewritten, not just presented-as-failed
    await pendoTrackServer("stale_job_detected", {
      stale_stage_name: failedJob.failedAt ?? "unknown",
      time_since_last_update_ms: Date.now() - job.lastUpdatedAt,
      stages_completed_count: Object.keys(job.results).length,
      job_age_ms: Date.now() - job.createdAt,
    });
    return NextResponse.json(failedJob, { status: 200 });
  }

  // Stages no longer auto-chain to each other (that's exactly what hit Vercel's nested-after()
  // hop limit — see CLAUDE.md Session 8 addendum #6). Instead, each poll checks whether the
  // next stage needs kicking off and does it itself: a fresh, un-nested after() every time,
  // so no chain ever builds up.
  if (job.status === "pending" || job.status === "running") {
    const nextStage = getNextStageToRun(job.results);
    if (nextStage && !isStageInFlight(job, nextStage)) {
      job.status = "running";
      job.inFlightStage = nextStage;
      job.inFlightSince = Date.now();
      await writeJob(jobId, job);
      const origin = new URL(request.url).origin;
      after(() => triggerStage(jobId, nextStage, origin));
    }
  }

  return NextResponse.json(job, { status: 200 });
}

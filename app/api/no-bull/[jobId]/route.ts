import { NextResponse } from "next/server";
import { readJob, writeJob, isJobStale, buildStaleFailure } from "@/lib/job-store";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (isJobStale(job)) {
    const failedJob = buildStaleFailure(job);
    await writeJob(jobId, failedJob); // durably rewritten, not just presented-as-failed
    return NextResponse.json(failedJob, { status: 200 });
  }
  return NextResponse.json(job, { status: 200 });
}

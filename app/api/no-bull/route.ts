import { NextResponse } from "next/server";
import { after } from "next/server";
import { createJob, STAGE_ORDER } from "@/lib/job-store";
import { triggerStage } from "@/lib/stage-runner";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body as { input?: unknown })?.input;

  const { jobId } = await createJob(input);
  const origin = new URL(request.url).origin;

  after(() => triggerStage(jobId, STAGE_ORDER[0], origin));

  return NextResponse.json({ jobId }, { status: 202 });
}

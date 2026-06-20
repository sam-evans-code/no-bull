import { NextResponse } from "next/server";
import { after } from "next/server";
import { createJob, STAGE_ORDER } from "@/lib/job-store";
import { triggerStage } from "@/lib/stage-runner";
import { pendoTrackServer } from "@/lib/pendo-server";

const MAX_INPUT_LENGTH = 4000; // kept in sync with app/components/IdeaForm.tsx

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body as { input?: unknown })?.input;

  if (typeof input !== "string" || input.trim().length === 0) {
    return NextResponse.json({ error: "Input is required" }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json({ error: "Input is too long" }, { status: 400 });
  }

  const { jobId } = await createJob(input);
  const origin = new URL(request.url).origin;

  await pendoTrackServer("job_created", {
    job_id: jobId,
    input_length: input.length,
    input_word_count: input.trim().split(/\s+/).filter(Boolean).length,
  });

  after(() => triggerStage(jobId, STAGE_ORDER[0], origin));

  return NextResponse.json({ jobId }, { status: 202 });
}

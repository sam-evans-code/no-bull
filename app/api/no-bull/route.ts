import { NextResponse } from "next/server";
import { after } from "next/server";
import { createJob } from "@/lib/job-store";

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

  after(() => {
    return fetch(`${origin}/api/no-bull/run/reframe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch((err) => console.error(`[no-bull] failed to trigger run for job ${jobId}:`, err));
  });

  return NextResponse.json({ jobId }, { status: 202 });
}

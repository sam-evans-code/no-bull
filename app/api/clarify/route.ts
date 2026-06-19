import { NextResponse } from "next/server";
import { runClarify } from "@/lib/stages/clarify";
import { StageValidationError } from "@/lib/stage-errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body as { input?: unknown })?.input;

  try {
    const clarify = await runClarify(input);
    return NextResponse.json(clarify, { status: 200 });
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // runClarify only ever throws StageValidationError (a bad request) — every other
    // failure mode is handled inside it by failing open. This branch is defense-in-depth
    // for a future bug in clarify.ts, and still must not present Stage 0 as "down": log
    // loudly (so a real regression isn't silently invisible) but still resolve as if the
    // input were specific enough, same as every other fail-open path in this stage.
    console.error("[clarify] unexpected error:", error);
    return NextResponse.json({ isSpecificEnough: true, questions: [] }, { status: 200 });
  }
}

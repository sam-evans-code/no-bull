import { NextResponse } from "next/server";
import { runReframe } from "@/lib/stages/reframe";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body as { input?: unknown })?.input;

  try {
    const reframedQuestion = await runReframe(input);
    return NextResponse.json({ reframedQuestion }, { status: 200 });
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StageApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[reframe] unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong reframing your input — please try again." },
      { status: 502 }
    );
  }
}

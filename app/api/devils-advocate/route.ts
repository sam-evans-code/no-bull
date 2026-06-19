import { NextResponse } from "next/server";
import { runDevilsAdvocate } from "@/lib/stages/devils-advocate";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reframedQuestion = (body as { reframedQuestion?: unknown })?.reframedQuestion;
  const stressTest = (body as { stressTest?: unknown })?.stressTest;

  try {
    const devilsAdvocateCase = await runDevilsAdvocate(reframedQuestion, stressTest);
    return NextResponse.json({ devilsAdvocateCase }, { status: 200 });
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StageApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[devils-advocate] unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong building the counter-case — please try again." },
      { status: 502 }
    );
  }
}

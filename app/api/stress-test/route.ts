import { NextResponse } from "next/server";
import { runStressTest } from "@/lib/stages/stress-test";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reframedQuestion = (body as { reframedQuestion?: unknown })?.reframedQuestion;

  try {
    const { stressTest, couldBeWrong } = await runStressTest(reframedQuestion);
    return NextResponse.json({ stressTest, couldBeWrong }, { status: 200 });
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StageApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[stress-test] unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong running the stress test — please try again." },
      { status: 502 }
    );
  }
}

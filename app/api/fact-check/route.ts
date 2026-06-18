import { NextResponse } from "next/server";
import { runFactCheck } from "@/lib/stages/fact-check";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stressTest = (body as { stressTest?: unknown })?.stressTest;
  const devilsAdvocateCase = (body as { devilsAdvocateCase?: unknown })?.devilsAdvocateCase;

  try {
    const factCheck = await runFactCheck(stressTest, devilsAdvocateCase);
    return NextResponse.json({ factCheck }, { status: 200 });
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StageApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[fact-check] unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong checking the claims in this analysis — please try again." },
      { status: 502 }
    );
  }
}

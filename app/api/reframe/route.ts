import { NextRequest, NextResponse } from "next/server";
import { pendoTrackServer } from "@/lib/pendo-server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const input: string = body.input || "";

  // TODO: Call Anthropic API to reframe the input as a neutral question (Session 3)
  const reframedQuestion = input;
  const wasAlreadyNeutral = true;

  // Pendo Track: prompt_reframed — fires after Stage 1 (Prompt Reframe) completes
  await pendoTrackServer("prompt_reframed", {
    was_already_neutral: wasAlreadyNeutral,
    original_input_length: input.length,
    reframed_output_length: reframedQuestion.length,
    length_change_ratio: Number(
      (reframedQuestion.length / Math.max(input.length, 1)).toFixed(2)
    ),
  });

  return NextResponse.json({
    reframedQuestion,
    wasAlreadyNeutral,
  });
}

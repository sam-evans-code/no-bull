import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

const STRESS_TEST_TOOL: Anthropic.Tool = {
  name: "submit_stress_test",
  description:
    "Submit the structured stress test analysis. You must reason through counterHypotheses, baseRates, and falsePremiseCheck before writing conclusion — conclusion must be informed by, and consistent with, what you wrote in the earlier fields.",
  input_schema: {
    type: "object",
    properties: {
      counterHypotheses: { type: "array", items: { type: "string" } },
      baseRates: { type: "string" },
      falsePremiseCheck: { type: "string" },
      conclusion: { type: "string" },
    },
    required: ["counterHypotheses", "baseRates", "falsePremiseCheck", "conclusion"],
  },
};

const COUNTER_EVIDENCE_TOOL: Anthropic.Tool = {
  name: "submit_counter_evidence",
  description:
    "Submit the itemized list of specific ways the stress test analysis could be wrong.",
  input_schema: {
    type: "object",
    properties: {
      counterEvidence: {
        type: "array",
        items: { type: "string" },
        description:
          "At least 4 specific, self-contained items. Each must name a concrete weakness — under-weighted evidence, a dismissed alternative interpretation, a misapplied base rate, or an unverified assumption. Generic hedges do not count.",
      },
    },
    required: ["counterEvidence"],
  },
};

const STRESS_TEST_SYSTEM_PROMPT = `You are a rigorous analyst stress-testing a question. You must call the submit_stress_test tool to respond. Fill in its fields in this exact order, treating each as a mandatory step that must be completed before the next:

1. counterHypotheses — generate at least 2 genuinely distinct competing hypotheses for why the premise might not hold.
2. baseRates — reason explicitly about base rates / reference classes relevant to this question.
3. falsePremiseCheck — check the question itself for false or shaky assumed premises.
4. conclusion — only now, write the bottom-line analysis, and make sure it is actually consistent with what you wrote above rather than a generic take.

Do not skip ahead to a conclusion before completing the earlier fields.`;

const COUNTER_EVIDENCE_FOLLOWUP = `Before treating the analysis above as final, list every specific way it could be wrong. Required: at least 4 distinct items. Each item must name a specific weakness — a piece of evidence that was under-weighted, an alternative interpretation that was dismissed too quickly, a base rate that was misapplied, or an assumption that hasn't been verified. A generic acknowledgment such as "this analysis could be wrong" or "more research is needed" does not count as an item and must not appear. Call the submit_counter_evidence tool to respond.`;

const STAGE3_ERROR_MESSAGE =
  "Something went wrong checking for blind spots — please try again.";

// This stage runs as its own after()-deferred invocation (see lib/stage-runner.ts) and
// never sees the live stage2Message — only stressTest's already-validated fields, read
// back from the job store. Reconstructing this tool_use turn from those fields is exactly
// equivalent to the literal turn stage 2 produced, since tool_choice forced that exact shape.
const RECONSTRUCTED_TOOL_USE_ID = "stress_test_result";

export interface StressTestInput {
  counterHypotheses: string[];
  baseRates: string;
  falsePremiseCheck: string;
  conclusion: string;
}

export interface CounterEvidenceInput {
  counterEvidence: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown, minLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minLength &&
    value.every((item) => isNonEmptyString(item))
  );
}

function extractToolUse(
  message: Anthropic.Message,
  expectedToolName: string
): Anthropic.ToolUseBlock | null {
  if (message.stop_reason !== "tool_use") return null;
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === expectedToolName
  );
  return block ?? null;
}

function validateStressTestInput(input: unknown): StressTestInput | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  if (
    isStringArray(candidate.counterHypotheses, 2) &&
    isNonEmptyString(candidate.baseRates) &&
    isNonEmptyString(candidate.falsePremiseCheck) &&
    isNonEmptyString(candidate.conclusion)
  ) {
    return candidate as unknown as StressTestInput;
  }
  return null;
}

function validateCounterEvidenceInput(input: unknown): CounterEvidenceInput | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  if (isStringArray(candidate.counterEvidence, 4)) {
    return candidate as unknown as CounterEvidenceInput;
  }
  return null;
}

export async function runCouldBeWrong(
  reframedQuestion: unknown,
  stressTestRaw: unknown
): Promise<CounterEvidenceInput> {
  if (typeof reframedQuestion !== "string" || reframedQuestion.trim().length === 0) {
    throw new StageValidationError(
      '"reframedQuestion" is required and must be a non-empty string'
    );
  }

  const stressTest = validateStressTestInput(stressTestRaw);
  if (!stressTest) {
    throw new StageValidationError(
      '"stressTest" is required and must include counterHypotheses (array of at least 2 strings), baseRates, falsePremiseCheck, and conclusion (all non-empty strings)'
    );
  }

  const anthropic = getAnthropicClient();
  const trimmedQuestion = reframedQuestion.trim();

  let stage3Message: Anthropic.Message;
  try {
    stage3Message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: STRESS_TEST_SYSTEM_PROMPT,
      tools: [STRESS_TEST_TOOL, COUNTER_EVIDENCE_TOOL],
      tool_choice: { type: "tool", name: COUNTER_EVIDENCE_TOOL.name },
      messages: [
        { role: "user", content: trimmedQuestion },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: RECONSTRUCTED_TOOL_USE_ID,
              name: STRESS_TEST_TOOL.name,
              input: stressTest,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: RECONSTRUCTED_TOOL_USE_ID,
              content: "Stress test recorded.",
            },
            { type: "text", text: COUNTER_EVIDENCE_FOLLOWUP },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("[could-be-wrong] Anthropic call failed:", error);
    throw new StageApiError(STAGE3_ERROR_MESSAGE);
  }

  console.log(
    `[could-be-wrong] tokens — input: ${stage3Message.usage.input_tokens}, output: ${stage3Message.usage.output_tokens}`
  );

  const stage3ToolUse = extractToolUse(stage3Message, COUNTER_EVIDENCE_TOOL.name);
  const couldBeWrong = stage3ToolUse ? validateCounterEvidenceInput(stage3ToolUse.input) : null;

  if (!stage3ToolUse || !couldBeWrong) {
    console.error(
      "[could-be-wrong] Anthropic returned an unusable tool call:",
      JSON.stringify(stage3Message.content)
    );
    throw new StageApiError(STAGE3_ERROR_MESSAGE);
  }

  return couldBeWrong;
}

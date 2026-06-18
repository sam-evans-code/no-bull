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
      counterHypotheses: {
        type: "array",
        items: { type: "string" },
        description:
          "At least 2 distinct, substantive competing hypotheses or explanations for why the premise might not hold. Each must be genuinely different from the others, not a rephrasing.",
      },
      baseRates: {
        type: "string",
        description:
          "Explicit base-rate or reference-class reasoning: how do similar decisions/situations typically play out, and how does that bear on this case? Write as flowing prose sentences, not a bullet list or JSON array.",
      },
      falsePremiseCheck: {
        type: "string",
        description:
          "Name any false or shaky premises assumed by the question. If none are found, state explicitly that none were found and why. Write as flowing prose sentences, not a bullet list or JSON array.",
      },
      conclusion: {
        type: "string",
        description:
          "The bottom-line analysis. Write this only after, and consistent with, counterHypotheses, baseRates, and falsePremiseCheck above.",
      },
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

const STAGE2_ERROR_MESSAGE =
  "Something went wrong running the stress test — please try again.";
const STAGE3_ERROR_MESSAGE =
  "Something went wrong checking for blind spots — please try again.";

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

export async function runStressTest(
  reframedQuestion: unknown
): Promise<{ stressTest: StressTestInput; couldBeWrong: CounterEvidenceInput }> {
  if (typeof reframedQuestion !== "string") {
    throw new StageValidationError('"reframedQuestion" is required and must be a string');
  }

  if (reframedQuestion.trim().length === 0) {
    throw new StageValidationError('"reframedQuestion" must not be empty');
  }

  const anthropic = getAnthropicClient();
  const trimmedQuestion = reframedQuestion.trim();

  let stage2Message: Anthropic.Message;
  try {
    stage2Message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: STRESS_TEST_SYSTEM_PROMPT,
      tools: [STRESS_TEST_TOOL],
      tool_choice: { type: "tool", name: STRESS_TEST_TOOL.name },
      messages: [{ role: "user", content: trimmedQuestion }],
    });
  } catch (error) {
    console.error("[stress-test] Stage 2 Anthropic call failed:", error);
    throw new StageApiError(STAGE2_ERROR_MESSAGE);
  }

  console.log(
    `[stress-test] stage2 tokens — input: ${stage2Message.usage.input_tokens}, output: ${stage2Message.usage.output_tokens}`
  );

  const stage2ToolUse = extractToolUse(stage2Message, STRESS_TEST_TOOL.name);
  const stressTest = stage2ToolUse ? validateStressTestInput(stage2ToolUse.input) : null;

  if (!stage2ToolUse || !stressTest) {
    console.error(
      "[stress-test] Stage 2 returned an unusable tool call:",
      JSON.stringify(stage2Message.content)
    );
    throw new StageApiError(STAGE2_ERROR_MESSAGE);
  }

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
        { role: "assistant", content: stage2Message.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: stage2ToolUse.id,
              content: "Stress test recorded.",
            },
            { type: "text", text: COUNTER_EVIDENCE_FOLLOWUP },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("[stress-test] Stage 3 Anthropic call failed:", error);
    throw new StageApiError(STAGE3_ERROR_MESSAGE);
  }

  console.log(
    `[stress-test] stage3 tokens — input: ${stage3Message.usage.input_tokens}, output: ${stage3Message.usage.output_tokens}`
  );

  const stage3ToolUse = extractToolUse(stage3Message, COUNTER_EVIDENCE_TOOL.name);
  const couldBeWrong = stage3ToolUse ? validateCounterEvidenceInput(stage3ToolUse.input) : null;

  if (!stage3ToolUse || !couldBeWrong) {
    console.error(
      "[stress-test] Stage 3 returned an unusable tool call:",
      JSON.stringify(stage3Message.content)
    );
    throw new StageApiError(STAGE3_ERROR_MESSAGE);
  }

  return { stressTest, couldBeWrong };
}

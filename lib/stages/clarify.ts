import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";
import { StageValidationError } from "@/lib/stage-errors";
import { pendoTrackServer } from "@/lib/pendo-server";

const MAX_QUESTIONS = 3;

const CLARIFY_TOOL: Anthropic.Tool = {
  name: "submit_clarify_check",
  description:
    "Submit whether the input is specific enough to stress-test as-is, and any targeted clarifying questions needed to fill the gaps.",
  input_schema: {
    type: "object",
    properties: {
      isSpecificEnough: {
        type: "boolean",
        description:
          "True if a reasonably informed outsider could stress-test this input without needing to ask 'compared to what?', 'for whom?', or 'what's actually at stake?'. False if it's missing most of: a concrete action/choice, enough context to judge tradeoffs, or enough at stake to know why it matters.",
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description:
          "If isSpecificEnough is true, this must be an empty array. If false, 1 to 3 short, targeted questions — one per actual gap found, not a fixed template. Never ask more questions than there are real gaps.",
      },
    },
    required: ["isSpecificEnough", "questions"],
  },
};

const SYSTEM_PROMPT = `You are a specificity-check tool for a decision stress-testing product. You will be given a raw idea, decision, or assumption a user wants stress-tested. Your only job is to judge whether it has enough specificity to be stress-tested well, and if not, generate only the clarifying questions needed to close the actual gaps — calling the submit_clarify_check tool with the result.

Apply this rubric flexibly across any decision domain (pricing, roadmap, hiring, build-vs-buy, market entry, etc.) — do not apply a fixed per-domain checklist. Input is specific enough if a reasonably informed outsider could stress-test it without needing to ask "compared to what?", "for whom?", or "what's actually at stake?" — i.e. it names:
- a concrete action or choice being considered,
- enough context to judge the tradeoffs (who's affected, what alternatives exist, relevant constraints),
- enough at stake to know why the decision matters.

Missing one minor dimension is fine — set isSpecificEnough to true. Missing most of these is not — set isSpecificEnough to false.

If isSpecificEnough is true, questions must be an empty array.

If isSpecificEnough is false, generate only as many questions as there are real gaps — 1, 2, or 3, never more, never padded to a fixed count. Each question must target a specific missing dimension, not be generic ("can you provide more detail?"). Keep each question short and concrete.`;

export interface ClarifyResult {
  isSpecificEnough: boolean;
  questions: string[];
}

// Returned for any failure past the input-validation boundary (Anthropic API error,
// timeout, or unusable tool output) — never thrown. This is the mechanism that makes
// "Stage 0 must never hard-gate the pipeline" (CLAUDE.md Section 3) true by construction:
// runClarify's return type has no failure variant once input validation passes, so a
// caller cannot observe a "Stage 0 failed" state distinct from "proceed unchanged."
const FAIL_OPEN_RESULT: ClarifyResult = { isSpecificEnough: true, questions: [] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isQuestionsArray(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
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

function validateClarifyResult(input: unknown): ClarifyResult | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;

  if (typeof candidate.isSpecificEnough !== "boolean") return null;
  if (!isQuestionsArray(candidate.questions, MAX_QUESTIONS)) return null;

  const { isSpecificEnough, questions } = candidate as {
    isSpecificEnough: boolean;
    questions: string[];
  };

  // Enforce the schema's own stated contract as a hard invariant, not just a prompt
  // instruction: specific input must come back with zero questions, non-specific input
  // must come back with at least one — otherwise the result is unusable.
  if (isSpecificEnough && questions.length > 0) return null;
  if (!isSpecificEnough && questions.length === 0) return null;

  return { isSpecificEnough, questions };
}

export async function runClarify(input: unknown): Promise<ClarifyResult> {
  if (typeof input !== "string") {
    throw new StageValidationError('"input" is required and must be a string');
  }

  if (input.trim().length === 0) {
    throw new StageValidationError('"input" must not be empty');
  }

  const startTime = Date.now();
  const anthropic = getAnthropicClient();
  const trimmedInput = input.trim();

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [CLARIFY_TOOL],
        tool_choice: { type: "tool", name: CLARIFY_TOOL.name },
        messages: [{ role: "user", content: trimmedInput }],
      },
      // maxRetries: 0 because the SDK retries timeouts by default, which would silently
      // double this call's worst-case wait — same convention as fact-check.ts's OpenAI
      // calls (addenda #4/#5) and narrative-correction.ts's Anthropic calls.
      { timeout: 25_000, maxRetries: 0 }
    );
  } catch (error) {
    console.error("[clarify] Anthropic call failed — failing open:", error);
    await pendoTrackServer("clarify_check_completed", {
      is_specific_enough: true,
      question_count: 0,
      was_fail_open: true,
      duration_ms: Date.now() - startTime,
      input_length: trimmedInput.length,
    });
    return FAIL_OPEN_RESULT;
  }

  console.log(
    `[clarify] tokens — input: ${message.usage.input_tokens}, output: ${message.usage.output_tokens}`
  );

  const toolUse = extractToolUse(message, CLARIFY_TOOL.name);
  const result = toolUse ? validateClarifyResult(toolUse.input) : null;

  if (!toolUse || !result) {
    console.error(
      "[clarify] Anthropic returned an unusable tool call — failing open:",
      JSON.stringify(message.content)
    );
    await pendoTrackServer("clarify_check_completed", {
      is_specific_enough: true,
      question_count: 0,
      was_fail_open: true,
      duration_ms: Date.now() - startTime,
      input_length: trimmedInput.length,
    });
    return FAIL_OPEN_RESULT;
  }

  await pendoTrackServer("clarify_check_completed", {
    is_specific_enough: result.isSpecificEnough,
    question_count: result.questions.length,
    was_fail_open: false,
    duration_ms: Date.now() - startTime,
    input_length: trimmedInput.length,
  });

  return result;
}

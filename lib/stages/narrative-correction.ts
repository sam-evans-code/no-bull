import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getAnthropicClient } from "@/lib/anthropic";
import { getOpenAIClient } from "@/lib/openai";
import { StageApiError } from "@/lib/stage-errors";
import {
  STRESS_TEST_TOOL,
  STRESS_TEST_SYSTEM_PROMPT,
  type StressTestInput,
} from "@/lib/stages/stress-test";
import {
  DEVILS_ADVOCATE_TOOL,
  DEVILS_ADVOCATE_SYSTEM_PROMPT,
  buildDevilsAdvocateUserPrompt,
  type DevilsAdvocateCase,
} from "@/lib/stages/devils-advocate";
import type { FactCheckEntry } from "@/lib/stages/fact-check";
import type { JobState } from "@/lib/job-store";

const ERROR_MESSAGE = "Something went wrong revising the analysis after fact-checking — please try again.";

// Same reasoning as could-be-wrong.ts's RECONSTRUCTED_TOOL_USE_ID: this stage runs as its
// own after()-deferred invocation and never sees the live tool_use turn that originally
// produced stressTest/devilsAdvocateCase — only their already-validated fields, read back
// from the job store. Reconstructing the turn from those fields is equivalent to the
// literal turn the original stage produced, since tool_choice forced that exact shape.
const RECONSTRUCTED_TOOL_USE_ID = "stress_test_result";
const RECONSTRUCTED_TOOL_CALL_ID = "devils_advocate_result";

export type NarrativeCorrectionStage = "stress-test" | "devils-advocate";

export type NarrativeCorrection =
  | { stage: "stress-test"; triggeringClaims: string[]; revised: StressTestInput }
  | { stage: "devils-advocate"; triggeringClaims: string[]; revised: DevilsAdvocateCase };

function extractAnthropicToolUse(
  message: Anthropic.Message,
  expectedToolName: string
): Anthropic.ToolUseBlock | null {
  if (message.stop_reason !== "tool_use") return null;
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === expectedToolName
  );
  return block ?? null;
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

function validateDevilsAdvocateCase(input: unknown): DevilsAdvocateCase | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  if (isStringArray(candidate.keyArguments, 3) && isNonEmptyString(candidate.conclusion)) {
    return candidate as unknown as DevilsAdvocateCase;
  }
  return null;
}

// Shared instruction language for both providers — explicit about not relying on, restating,
// or implicitly leaning on the disproven claim, not just "here's a correction, FYI."
function buildContradictionNotice(claims: FactCheckEntry[]): string {
  const claimLines = claims
    .map((c) => `- "${c.claim}"`)
    .join("\n");
  return `The following claim(s) from your analysis above were checked against real-world sources and found to be FALSE:
${claimLines}

Revise your analysis so it no longer relies on, restates, or is supported by any of these claims. Do not repeat the false claim(s), even to refute them — reason as if they were never available to you. Keep everything else about your original analysis intact except where it was directly built on a now-disproven claim.`;
}

async function reviseStressTest(
  stressTest: StressTestInput,
  reframedQuestion: string,
  contradictedClaims: FactCheckEntry[]
): Promise<StressTestInput> {
  const anthropic = getAnthropicClient();

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: STRESS_TEST_SYSTEM_PROMPT,
        tools: [STRESS_TEST_TOOL],
        tool_choice: { type: "tool", name: STRESS_TEST_TOOL.name },
        messages: [
          { role: "user", content: reframedQuestion },
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
              { type: "text", text: buildContradictionNotice(contradictedClaims) },
            ],
          },
        ],
      },
      { timeout: 25_000, maxRetries: 0 }
    );
  } catch (error) {
    console.error("[narrative-correction] stress-test revision call failed:", error);
    throw new StageApiError(ERROR_MESSAGE);
  }

  console.log(
    `[narrative-correction] stress-test revision tokens — input: ${message.usage.input_tokens}, output: ${message.usage.output_tokens}`
  );

  const toolUse = extractAnthropicToolUse(message, STRESS_TEST_TOOL.name);
  const revised = toolUse ? validateStressTestInput(toolUse.input) : null;

  if (!toolUse || !revised) {
    console.error(
      "[narrative-correction] Anthropic returned an unusable revision tool call:",
      JSON.stringify(message.content)
    );
    throw new StageApiError(ERROR_MESSAGE);
  }

  return revised;
}

async function reviseDevilsAdvocate(
  devilsAdvocateCase: DevilsAdvocateCase,
  reframedQuestion: string,
  stressTest: StressTestInput,
  contradictedClaims: FactCheckEntry[]
): Promise<DevilsAdvocateCase> {
  const openai = getOpenAIClient();

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create(
      {
        model: "gpt-5.4",
        messages: [
          { role: "system", content: DEVILS_ADVOCATE_SYSTEM_PROMPT },
          { role: "user", content: buildDevilsAdvocateUserPrompt(reframedQuestion, stressTest) },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: RECONSTRUCTED_TOOL_CALL_ID,
                type: "function",
                function: {
                  name: DEVILS_ADVOCATE_TOOL.function.name,
                  arguments: JSON.stringify(devilsAdvocateCase),
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: RECONSTRUCTED_TOOL_CALL_ID,
            content: "Devil's advocate case recorded.",
          },
          { role: "user", content: buildContradictionNotice(contradictedClaims) },
        ],
        tools: [DEVILS_ADVOCATE_TOOL],
        tool_choice: { type: "function", function: { name: DEVILS_ADVOCATE_TOOL.function.name } },
      },
      { timeout: 25_000, maxRetries: 0 }
    );
  } catch (error) {
    console.error("[narrative-correction] devils-advocate revision call failed:", error);
    throw new StageApiError(ERROR_MESSAGE);
  }

  if (completion.usage) {
    console.log(
      `[narrative-correction] devils-advocate revision tokens — input: ${completion.usage.prompt_tokens}, output: ${completion.usage.completion_tokens}`
    );
  }

  const toolCall = completion.choices[0]?.message?.tool_calls?.find(
    (call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      call.type === "function" && call.function.name === DEVILS_ADVOCATE_TOOL.function.name
  );

  let parsedArgs: unknown;
  try {
    parsedArgs = toolCall ? JSON.parse(toolCall.function.arguments) : null;
  } catch {
    parsedArgs = null;
  }

  const revised = validateDevilsAdvocateCase(parsedArgs);

  if (!revised) {
    console.error(
      "[narrative-correction] OpenAI returned an unusable revision tool call:",
      JSON.stringify(completion.choices[0]?.message)
    );
    throw new StageApiError(ERROR_MESSAGE);
  }

  return revised;
}

export async function runNarrativeCorrection(
  job: JobState
): Promise<{ narrativeCorrections: NarrativeCorrection[] }> {
  const factCheck = job.results.factCheck ?? [];
  const contradicted = factCheck.filter((entry) => entry.verdict === "CONTRADICTED");

  if (contradicted.length === 0) {
    return { narrativeCorrections: [] };
  }

  const reframedQuestion = job.results.reframedQuestion;
  const stressTest = job.results.stressTest;
  const devilsAdvocateCase = job.results.devilsAdvocateCase;

  if (!reframedQuestion || !stressTest || !devilsAdvocateCase) {
    console.error(
      "[narrative-correction] job is missing prior stage results needed to revise — this should be unreachable"
    );
    throw new StageApiError(ERROR_MESSAGE);
  }

  const contradictedByStage = {
    "stress-test": contradicted.filter((e) => e.originStage === "stress-test"),
    "devils-advocate": contradicted.filter((e) => e.originStage === "devils-advocate"),
  };

  const corrections: NarrativeCorrection[] = [];

  if (contradictedByStage["stress-test"].length > 0) {
    const claims = contradictedByStage["stress-test"];
    const revised = await reviseStressTest(stressTest, reframedQuestion, claims);
    corrections.push({
      stage: "stress-test",
      triggeringClaims: claims.map((c) => c.claim),
      revised,
    });
  }

  if (contradictedByStage["devils-advocate"].length > 0) {
    const claims = contradictedByStage["devils-advocate"];
    const revised = await reviseDevilsAdvocate(devilsAdvocateCase, reframedQuestion, stressTest, claims);
    corrections.push({
      stage: "devils-advocate",
      triggeringClaims: claims.map((c) => c.claim),
      revised,
    });
  }

  return { narrativeCorrections: corrections };
}

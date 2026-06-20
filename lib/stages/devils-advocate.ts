import OpenAI from "openai";
import { getOpenAIClient } from "@/lib/openai";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

export const DEVILS_ADVOCATE_TOOL: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "submit_devils_advocate_case",
    description:
      "Submit the strongest evidence-based case against the idea, as a skeptical board member would argue it.",
    parameters: {
      type: "object",
      properties: {
        keyArguments: {
          type: "array",
          items: { type: "string" },
          description:
            "At least 3 distinct, evidence-style arguments against the idea. Each must be self-contained and name a concrete mechanism, risk, market dynamic, or historical analog — not a rephrasing of the stress-test findings it was given. Format each item as a single bold summary sentence wrapped in **double asterisks**, followed by up to one sentence of supporting detail. Keep each argument to at most 2 sentences total.",
        },
        conclusion: {
          type: "string",
          description: "1-2 sentence bottom-line: why the case against this idea is strong.",
        },
        keyPoints: {
          type: "array",
          items: { type: "string" },
          description:
            "2-4 bullet points distilling this case's most important takeaways. Keep each item to 1-2 sentences. No bold formatting — this field is already the short version.",
        },
      },
      required: ["keyArguments", "conclusion", "keyPoints"],
      additionalProperties: false,
    },
  },
};

export const DEVILS_ADVOCATE_SYSTEM_PROMPT = `You are a skeptical board member reviewing this decision. Your only job is to build the strongest possible case AGAINST it, using evidence-style reasoning — concrete mechanisms, risks, market dynamics, base rates, or historical analogs — not hedging, vague qualifiers, or restated weaknesses.

You will be shown another analyst's stress-test findings; do not simply restate or summarize them — your case must introduce reasoning they didn't cover, argued as a genuine adversarial position, not a balanced second opinion. Do not soften claims with "might" or "could potentially" where a direct claim is warranted — if something is genuinely uncertain, say so plainly rather than hedging by default.

Format each item in keyArguments as a bold one-sentence summary (wrapped in **double asterisks**) followed by up to one sentence of supporting detail. After keyArguments and conclusion, fill in keyPoints: 2-4 plain, non-bold bullet points (each 1-2 sentences) distilling the case into its most important takeaways.

Be concise: state each argument in as few sentences as the mechanism requires. Do not pad with hedges, throat-clearing, or restated stress-test content — every sentence must introduce new reasoning.`;

const ERROR_MESSAGE = "Something went wrong building the counter-case — please try again.";

export interface StressTestInput {
  counterHypotheses: string[];
  baseRates: string;
  falsePremiseCheck: string;
  conclusion: string;
  keyPoints: string[];
}

export interface DevilsAdvocateCase {
  keyArguments: string[];
  conclusion: string;
  keyPoints: string[];
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
    isNonEmptyString(candidate.conclusion) &&
    isStringArray(candidate.keyPoints, 2)
  ) {
    return candidate as unknown as StressTestInput;
  }
  return null;
}

function validateDevilsAdvocateCase(input: unknown): DevilsAdvocateCase | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as Record<string, unknown>;
  if (
    isStringArray(candidate.keyArguments, 3) &&
    isNonEmptyString(candidate.conclusion) &&
    isStringArray(candidate.keyPoints, 2)
  ) {
    return candidate as unknown as DevilsAdvocateCase;
  }
  return null;
}

export function buildDevilsAdvocateUserPrompt(
  reframedQuestion: string,
  stressTest: StressTestInput
): string {
  return `The question under review:
${reframedQuestion}

Another analyst's stress-test findings:
- Counter-hypotheses considered: ${stressTest.counterHypotheses.join(" | ")}
- Base-rate reasoning: ${stressTest.baseRates}
- False-premise check: ${stressTest.falsePremiseCheck}
- Conclusion reached: ${stressTest.conclusion}

Build the strongest case against this idea/decision.`;
}

export async function runDevilsAdvocate(
  reframedQuestion: unknown,
  stressTestRaw: unknown
): Promise<DevilsAdvocateCase> {
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

  const openai = getOpenAIClient();

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: [
        { role: "system", content: DEVILS_ADVOCATE_SYSTEM_PROMPT },
        { role: "user", content: buildDevilsAdvocateUserPrompt(reframedQuestion.trim(), stressTest) },
      ],
      tools: [DEVILS_ADVOCATE_TOOL],
      tool_choice: { type: "function", function: { name: DEVILS_ADVOCATE_TOOL.function.name } },
    });
  } catch (error) {
    console.error("[devils-advocate] OpenAI call failed:", error);
    throw new StageApiError(ERROR_MESSAGE);
  }

  if (completion.usage) {
    console.log(
      `[devils-advocate] tokens — input: ${completion.usage.prompt_tokens}, output: ${completion.usage.completion_tokens}`
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

  const devilsAdvocateCase = validateDevilsAdvocateCase(parsedArgs);

  if (!devilsAdvocateCase) {
    console.error(
      "[devils-advocate] OpenAI returned an unusable tool call:",
      JSON.stringify(completion.choices[0]?.message)
    );
    throw new StageApiError(ERROR_MESSAGE);
  }

  return devilsAdvocateCase;
}

import { getAnthropicClient } from "@/lib/anthropic";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";

const SYSTEM_PROMPT = `You are a prompt-reframing tool. Your only job is to rewrite the user's
input into a single neutral, stance-free question. You do not answer the
question, evaluate the idea, or add commentary — output only the
reframed question itself.

Apply these steps in order:

1. DETECT: Determine whether the input is already phrased as a neutral
   question with no embedded stance or leading framing. If it already is,
   output it back with only minimal cleanup (fix grammar/phrasing, do not
   change its meaning).

2. STRIP STANCE: If the input contains a stated opinion, leading framing,
   or a rhetorical "right?"/"don't you think?" tag, remove the stated
   opinion and the rhetorical tag entirely. Do not preserve the user's
   conclusion anywhere in the output.

3. REMOVE PERSONAL FRAMING: Rewrite away from first/second-person framing
   ("I think", "should I", "do you think") toward a pronoun-less question
   about the underlying decision or claim itself.

4. PREFER AUXILIARY-VERB, TRADEOFF FRAMING: Lead with an auxiliary-verb
   construction ("What are...", "How does...", "What would...") rather
   than a yes/no-inviting construction ("Is X good?", "Should we do X?").
   Specifically prefer "What are the tradeoffs of X?" framing over
   "Is X a good idea?" framing.

Output ONLY the reframed question as a single sentence. No preamble,
no explanation, no quotation marks, no "Reframed question:" label.`;

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reframing your input — please try again.";

export async function runReframe(input: unknown): Promise<string> {
  if (typeof input !== "string") {
    throw new StageValidationError('"input" is required and must be a string');
  }

  if (input.trim().length === 0) {
    throw new StageValidationError('"input" must not be empty');
  }

  const anthropic = getAnthropicClient();

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: input.trim() }],
    });
  } catch (error) {
    console.error("[reframe] Anthropic call failed:", error);
    throw new StageApiError(GENERIC_ERROR_MESSAGE);
  }

  console.log(
    `[reframe] tokens — input: ${message.usage.input_tokens}, output: ${message.usage.output_tokens}`
  );

  const firstBlock = message.content[0];
  const reframedQuestion = firstBlock?.type === "text" ? firstBlock.text.trim() : "";

  if (!reframedQuestion) {
    console.error("[reframe] Anthropic returned empty/unusable output");
    throw new StageApiError(GENERIC_ERROR_MESSAGE);
  }

  return reframedQuestion;
}

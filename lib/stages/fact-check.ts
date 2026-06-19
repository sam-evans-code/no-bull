import OpenAI from "openai";
import { getOpenAIClient } from "@/lib/openai";
import { StageApiError, StageValidationError } from "@/lib/stage-errors";
import { pendoTrackServer } from "@/lib/pendo-server";

const EXTRACTION_MODEL = "gpt-5.4-nano";
const RESEARCH_MODEL = "gpt-5.4-mini";
const CLASSIFICATION_MODEL = "gpt-5.4-nano";

// Keep Stage 5 well under Vercel's 60s maxDuration ceiling — see CLAUDE.md Session 7 log.
const MAX_CLAIMS = 3;

const ERROR_MESSAGE =
  "Something went wrong checking the claims in this analysis — please try again.";

export interface StressTestInput {
  counterHypotheses: string[];
  baseRates: string;
  falsePremiseCheck: string;
  conclusion: string;
}

export interface DevilsAdvocateCase {
  keyArguments: string[];
  conclusion: string;
}

type Verdict = "ENTAILED" | "CONTRADICTED" | "UNVERIFIABLE";

export interface FactCheckEntry {
  claim: string;
  verdict: Verdict;
  source: string | null;
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

function isStringArrayAllowEmpty(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
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
  if (isStringArray(candidate.keyArguments, 1) && isNonEmptyString(candidate.conclusion)) {
    return candidate as unknown as DevilsAdvocateCase;
  }
  return null;
}

function buildClaimSourceText(
  stressTest: StressTestInput,
  devilsAdvocateCase: DevilsAdvocateCase
): string {
  return `Counter-hypotheses: ${stressTest.counterHypotheses.join(" | ")}
Base rates: ${stressTest.baseRates}
False-premise check: ${stressTest.falsePremiseCheck}
Stress-test conclusion: ${stressTest.conclusion}
Devil's-advocate key arguments: ${devilsAdvocateCase.keyArguments.join(" | ")}
Devil's-advocate conclusion: ${devilsAdvocateCase.conclusion}`;
}

const EXTRACT_CLAIMS_TOOL: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "submit_extracted_claims",
    description:
      "Submit the list of atomic, independently verifiable factual claims found in the text. Exclude any subjective, strategic, predictive, or opinion-based statements — only include claims that state a checkable fact (a statistic, a named event, a regulatory fact, a competitor's documented action, a historical figure). An empty list is a valid and expected result if the text contains no checkable factual claims.",
    parameters: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: { type: "string" },
          description:
            "Zero or more atomic factual claims, each a single self-contained proposition restating only what the source text asserts (no added detail, no paraphrasing beyond minimal grammatical cleanup). Do not include subjective judgments (e.g. 'this is a good pricing strategy'), predictions, or strategic recommendations — those must be omitted entirely, not included with a caveat.",
        },
      },
      required: ["claims"],
      additionalProperties: false,
    },
  },
};

const EXTRACT_CLAIMS_SYSTEM_PROMPT = `You are a claim-extraction tool. You will be given analysis text. Your only job is to extract atomic, independently fact-checkable claims from it — calling the submit_extracted_claims tool with the result.

A claim is checkable only if it asserts something verifiable against external reality (a statistic, a market size figure, a named competitor's documented action, a regulatory requirement, a historical event or date). A claim is NOT checkable if it is a subjective judgment, a strategic opinion, a recommendation, or a prediction about the future — exclude these entirely, do not include them with a caveat or hedge.

One proposition per claim. Do not paraphrase beyond minimal grammatical cleanup needed to make the claim stand alone. It is correct and expected to return zero claims if the text contains no checkable factual claims.`;

const CLASSIFY_CLAIM_TOOL: OpenAI.Chat.Completions.ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "submit_claim_verdict",
    description:
      "Submit the verdict for whether the research findings support, contradict, or fail to resolve the factual claim.",
    parameters: {
      type: "object",
      properties: {
        verdict: {
          type: "string",
          enum: ["ENTAILED", "CONTRADICTED", "UNVERIFIABLE"],
          description:
            "ENTAILED if the research findings clearly support the claim as stated. CONTRADICTED if the research findings clearly contradict or disprove the claim as stated. UNVERIFIABLE if the research findings are inconclusive, ambiguous, or insufficient to determine either way.",
        },
        source: {
          type: ["string", "null"],
          description:
            "A single source URL backing the verdict, ONLY if the research findings explicitly mention one and no structured citation was already available. If unsure or no specific URL was given in the research findings, return null — do not guess or reconstruct a URL from memory.",
        },
      },
      required: ["verdict", "source"],
      additionalProperties: false,
    },
  },
};

const CLASSIFY_CLAIM_SYSTEM_PROMPT = `You are a fact-check classifier. You will be given a factual claim and research findings about it. Classify the claim as ENTAILED, CONTRADICTED, or UNVERIFIABLE based only on the research findings provided, then call submit_claim_verdict.`;

function isVerdict(value: unknown): value is Verdict {
  return value === "ENTAILED" || value === "CONTRADICTED" || value === "UNVERIFIABLE";
}

async function extractClaims(
  openai: OpenAI,
  stressTest: StressTestInput,
  devilsAdvocateCase: DevilsAdvocateCase
): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: EXTRACT_CLAIMS_SYSTEM_PROMPT },
      { role: "user", content: buildClaimSourceText(stressTest, devilsAdvocateCase) },
    ],
    tools: [EXTRACT_CLAIMS_TOOL],
    tool_choice: { type: "function", function: { name: EXTRACT_CLAIMS_TOOL.function.name } },
  });

  if (completion.usage) {
    console.log(
      `[fact-check] extraction tokens — input: ${completion.usage.prompt_tokens}, output: ${completion.usage.completion_tokens}`
    );
  }

  const toolCall = completion.choices[0]?.message?.tool_calls?.find(
    (call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      call.type === "function" && call.function.name === EXTRACT_CLAIMS_TOOL.function.name
  );

  let parsedArgs: unknown;
  try {
    parsedArgs = toolCall ? JSON.parse(toolCall.function.arguments) : null;
  } catch {
    parsedArgs = null;
  }

  const claims =
    parsedArgs && typeof parsedArgs === "object"
      ? (parsedArgs as Record<string, unknown>).claims
      : null;

  if (!isStringArrayAllowEmpty(claims)) {
    console.error(
      "[fact-check] OpenAI returned an unusable extraction tool call:",
      JSON.stringify(completion.choices[0]?.message)
    );
    throw new Error("extraction failed");
  }

  return claims;
}

function extractFirstUrlCitation(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      const citation = part.annotations.find((annotation) => annotation.type === "url_citation");
      if (citation && citation.type === "url_citation") return citation.url;
    }
  }
  return null;
}

async function researchClaim(
  openai: OpenAI,
  claim: string
): Promise<{ text: string; source: string | null }> {
  const response = await openai.responses.create(
    {
      model: RESEARCH_MODEL,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      input: `Research this specific factual claim using web search and report what you find, citing your sources: "${claim}"

State plainly whether the claim appears to be true, false, or whether you could not find enough information to determine this. Do not discuss anything other than this claim.`,
    },
    // maxRetries: 0 because the SDK retries timeouts by default, which would silently
    // double this call's worst-case wait — defeating the point of bounding it at all.
    { timeout: 25_000, maxRetries: 0 }
  );

  // Responses API usage uses input_tokens/output_tokens, NOT prompt_tokens/completion_tokens
  // like Chat Completions below — different shape from the same provider, easy to mix up.
  if (response.usage) {
    console.log(
      `[fact-check] claim research tokens — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`
    );
  }

  return {
    text: response.output_text,
    source: extractFirstUrlCitation(response),
  };
}

async function classifyClaim(
  openai: OpenAI,
  claim: string,
  researchText: string
): Promise<{ verdict: Verdict; source: string | null }> {
  const completion = await openai.chat.completions.create(
    {
      model: CLASSIFICATION_MODEL,
      messages: [
        { role: "system", content: CLASSIFY_CLAIM_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Claim being checked: "${claim}"

Research findings:
${researchText}`,
        },
      ],
      tools: [CLASSIFY_CLAIM_TOOL],
      tool_choice: { type: "function", function: { name: CLASSIFY_CLAIM_TOOL.function.name } },
    },
    { timeout: 10_000, maxRetries: 0 }
  );

  if (completion.usage) {
    console.log(
      `[fact-check] claim classification tokens — input: ${completion.usage.prompt_tokens}, output: ${completion.usage.completion_tokens}`
    );
  }

  const toolCall = completion.choices[0]?.message?.tool_calls?.find(
    (call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      call.type === "function" && call.function.name === CLASSIFY_CLAIM_TOOL.function.name
  );

  let parsedArgs: unknown;
  try {
    parsedArgs = toolCall ? JSON.parse(toolCall.function.arguments) : null;
  } catch {
    parsedArgs = null;
  }

  if (typeof parsedArgs !== "object" || parsedArgs === null) {
    console.error(
      "[fact-check] OpenAI returned an unusable classification tool call:",
      JSON.stringify(completion.choices[0]?.message)
    );
    throw new Error("classification failed");
  }

  const candidate = parsedArgs as Record<string, unknown>;
  if (!isVerdict(candidate.verdict)) {
    console.error(
      "[fact-check] OpenAI returned an invalid verdict:",
      JSON.stringify(completion.choices[0]?.message)
    );
    throw new Error("classification failed");
  }

  const source = typeof candidate.source === "string" ? candidate.source : null;

  return { verdict: candidate.verdict, source };
}

async function verifyClaim(openai: OpenAI, claim: string): Promise<FactCheckEntry> {
  const research = await researchClaim(openai, claim);
  const classification = await classifyClaim(openai, claim, research.text);
  return {
    claim,
    verdict: classification.verdict,
    source: research.source ?? classification.source,
  };
}

export async function runFactCheckExtract(
  stressTestRaw: unknown,
  devilsAdvocateCaseRaw: unknown
): Promise<{ claims: string[] }> {
  const stressTest = validateStressTestInput(stressTestRaw);
  if (!stressTest) {
    throw new StageValidationError(
      '"stressTest" is required and must include counterHypotheses (array of at least 2 strings), baseRates, falsePremiseCheck, and conclusion (all non-empty strings)'
    );
  }

  const devilsAdvocateCase = validateDevilsAdvocateCase(devilsAdvocateCaseRaw);
  if (!devilsAdvocateCase) {
    throw new StageValidationError(
      '"devilsAdvocateCase" is required and must include keyArguments (array of at least 1 string) and conclusion (a non-empty string)'
    );
  }

  const startTime = Date.now();
  const openai = getOpenAIClient();

  let claims: string[];
  try {
    claims = await extractClaims(openai, stressTest, devilsAdvocateCase);
  } catch (error) {
    console.error("[fact-check-extract] extraction call failed:", error);
    throw new StageApiError(ERROR_MESSAGE);
  }

  const cappedClaims = claims.length > MAX_CLAIMS ? claims.slice(0, MAX_CLAIMS) : claims;
  if (claims.length > MAX_CLAIMS) {
    console.log(`[fact-check-extract] extracted ${claims.length} claims, capping to ${MAX_CLAIMS}`);
  }

  await pendoTrackServer("fact_check_claims_extracted", {
    total_claims_extracted: claims.length,
    capped_to: cappedClaims.length,
    duration_ms: Date.now() - startTime,
  });

  return { claims: cappedClaims };
}

export async function runFactCheck(claimsRaw: unknown): Promise<FactCheckEntry[]> {
  if (!isStringArrayAllowEmpty(claimsRaw)) {
    throw new StageValidationError('"claims" is required and must be an array of strings');
  }
  const claims = claimsRaw;

  const startTime = Date.now();
  const openai = getOpenAIClient();

  if (claims.length === 0) {
    await pendoTrackServer("fact_check_completed", {
      total_claims_extracted: 0,
      supported_count: 0,
      contradicted_count: 0,
      unverifiable_count: 0,
      sources_found_count: 0,
      duration_ms: Date.now() - startTime,
    });
    return [];
  }

  const settled = await Promise.allSettled(claims.map((claim) => verifyClaim(openai, claim)));

  const entries = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`[fact-check] verification failed for claim "${claims[index]}":`, result.reason);
    return { claim: claims[index], verdict: "UNVERIFIABLE" as Verdict, source: null };
  });

  await pendoTrackServer("fact_check_completed", {
    total_claims_extracted: claims.length,
    supported_count: entries.filter((e) => e.verdict === "ENTAILED").length,
    contradicted_count: entries.filter((e) => e.verdict === "CONTRADICTED").length,
    unverifiable_count: entries.filter((e) => e.verdict === "UNVERIFIABLE").length,
    sources_found_count: entries.filter((e) => e.source !== null).length,
    duration_ms: Date.now() - startTime,
  });

  return entries;
}

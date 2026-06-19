import type { JobResults, JobState, StageName } from "@/lib/types/job";
import { STAGE_ORDER } from "@/lib/types/job";

// A single forced-tool-choice call — don't make the user wait anywhere near the
// server's own 25s timeout (lib/stages/clarify.ts) before giving up and proceeding.
const CLARIFY_CLIENT_TIMEOUT_MS = 6000;

export interface ClarifyCheck {
  isSpecificEnough: boolean;
  questions: string[];
}

// Fail-open client-side, mirroring runClarify's own fail-open contract server-side:
// any network error, non-2xx, timeout, or malformed body collapses to "proceed as
// if specific enough" rather than surfacing a distinct "clarify failed" state.
export async function checkClarify(input: string): Promise<ClarifyCheck> {
  const FAIL_OPEN: ClarifyCheck = { isSpecificEnough: true, questions: [] };
  try {
    const response = await fetch("/api/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(CLARIFY_CLIENT_TIMEOUT_MS),
    });
    if (!response.ok) return FAIL_OPEN;
    const data = (await response.json()) as Partial<ClarifyCheck>;
    if (typeof data.isSpecificEnough !== "boolean" || !Array.isArray(data.questions)) {
      return FAIL_OPEN;
    }
    return { isSpecificEnough: data.isSpecificEnough, questions: data.questions };
  } catch {
    return FAIL_OPEN;
  }
}

export async function submitIdea(input: string): Promise<{ jobId: string }> {
  const response = await fetch("/api/no-bull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (response.status !== 202) {
    throw new Error("Couldn't start a new run — please try again.");
  }

  return response.json() as Promise<{ jobId: string }>;
}

export type PollResult =
  | { kind: "ok"; job: JobState }
  | { kind: "not-found" }
  | { kind: "error" };

export async function pollJob(jobId: string): Promise<PollResult> {
  let response: Response;
  try {
    response = await fetch(`/api/no-bull/${jobId}`);
  } catch {
    return { kind: "error" };
  }

  if (response.status === 404) {
    return { kind: "not-found" };
  }
  if (!response.ok) {
    return { kind: "error" };
  }

  const job = (await response.json()) as JobState;
  return { kind: "ok", job };
}

// Mirrors lib/job-store.ts's server-side inferInFlightStage — keep in sync.
export function inferInFlightStage(results: JobResults): StageName {
  if (!results.reframedQuestion) return STAGE_ORDER[0];
  if (!results.stressTest) return STAGE_ORDER[1];
  if (!results.couldBeWrong) return STAGE_ORDER[2];
  if (!results.devilsAdvocateCase) return STAGE_ORDER[3];
  if (!results.factCheckClaims) return STAGE_ORDER[4];
  if (!results.factCheck) return STAGE_ORDER[5];
  return STAGE_ORDER[6];
}

import type { JobResults, JobState, StageName } from "@/lib/types/job";
import { STAGE_ORDER } from "@/lib/types/job";

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
  return STAGE_ORDER[4];
}

import { kv } from "@vercel/kv";
import type { StressTestInput } from "@/lib/stages/stress-test";
import type { CounterEvidenceInput } from "@/lib/stages/could-be-wrong";
import type { DevilsAdvocateCase } from "@/lib/stages/devils-advocate";
import type { ExtractedClaim, FactCheckEntry } from "@/lib/stages/fact-check";
import type { NarrativeCorrection } from "@/lib/stages/narrative-correction";

export type StageName =
  | "reframe"
  | "stress-test"
  | "could-be-wrong"
  | "devils-advocate"
  | "fact-check-extract"
  | "fact-check"
  | "narrative-correction";
export type JobStatus = "pending" | "running" | "complete" | "failed";

export interface JobResults {
  reframedQuestion?: string;
  stressTest?: StressTestInput;
  couldBeWrong?: CounterEvidenceInput;
  devilsAdvocateCase?: DevilsAdvocateCase;
  // Output of fact-check-extract, input to fact-check. Can legitimately be `[]` (no
  // checkable claims found) — that's still "done", and `!results.factCheckClaims` below
  // already treats an empty array as truthy/present, which is correct; don't "fix" it.
  factCheckClaims?: ExtractedClaim[];
  factCheck?: FactCheckEntry[];
  // Output of narrative-correction. Can legitimately be `[]` (no claim came back
  // CONTRADICTED, so nothing needed rewriting) — same "empty array still counts as done"
  // convention as factCheckClaims above.
  narrativeCorrections?: NarrativeCorrection[];
}

export interface JobState {
  status: JobStatus;
  createdAt: number;
  lastUpdatedAt: number;
  input: unknown;
  failedAt?: StageName;
  error?: string;
  results: JobResults;
  // Which stage currently has a trigger fetch in flight, and when it was issued. Lets the
  // poller (GET /api/no-bull/[jobId]) avoid re-triggering a stage that's already running —
  // without this, every ~2.5s poll during a slow stage would fire a duplicate, paid LLM call.
  // See CLAUDE.md Session 8 addendum #6 for why advancement moved here instead of each stage
  // auto-chaining to the next via a nested fetch.
  inFlightStage?: StageName;
  inFlightSince?: number;
}

const JOB_TTL_SECONDS = 3600;

// ~3x the slowest measured single stage (stress-test stage 2, ~38-73s — see CLAUDE.md
// Session 8 addendum #2/#3). The fact-check-extract/fact-check split (extract is fast;
// verify is now capped by a per-claim research timeout) keeps that stage family well
// under this threshold too, so it doesn't drive this number.
const STALE_THRESHOLD_MS = 150_000;

export const STAGE_ORDER: StageName[] = [
  "reframe",
  "stress-test",
  "could-be-wrong",
  "devils-advocate",
  "fact-check-extract",
  "fact-check",
  "narrative-correction",
];

// Same comparison basis as STALE_THRESHOLD_MS's "slowest measured single stage" note, but
// scoped to one stage rather than the whole job: long enough that a legitimately slow stage
// (stress-test has measured 47-73s) isn't re-triggered mid-flight, short enough to recover
// well before the overall 150s stale-job threshold would otherwise have to catch it.
const IN_FLIGHT_GRACE_MS = 100_000;

function jobKey(jobId: string): string {
  return `job:${jobId}`;
}

export async function createJob(input: unknown): Promise<{ jobId: string; job: JobState }> {
  const jobId = crypto.randomUUID();
  const now = Date.now();
  const job: JobState = {
    status: "pending",
    createdAt: now,
    lastUpdatedAt: now,
    input,
    results: {},
    // The caller (POST /api/no-bull) triggers "reframe" itself right after creating the job.
    // Marking it in-flight here too means a poll that lands before that trigger has actually
    // fired won't also try to kick it off.
    inFlightStage: STAGE_ORDER[0],
    inFlightSince: now,
  };
  await kv.set(jobKey(jobId), job, { ex: JOB_TTL_SECONDS });
  return { jobId, job };
}

// The next stage that needs to run, or null if the pipeline is fully done. Distinct from
// inferInFlightStage below: this is used to decide what to trigger next, not to label a
// failure, so it must be able to say "nothing left."
export function getNextStageToRun(results: JobResults): StageName | null {
  if (!results.reframedQuestion) return "reframe";
  if (!results.stressTest) return "stress-test";
  if (!results.couldBeWrong) return "could-be-wrong";
  if (!results.devilsAdvocateCase) return "devils-advocate";
  if (!results.factCheckClaims) return "fact-check-extract";
  if (!results.factCheck) return "fact-check";
  if (!results.narrativeCorrections) return "narrative-correction";
  return null;
}

// True if `stage` already has a trigger in flight recently enough that the poller shouldn't
// fire a duplicate. Exported so the poll route can use the exact same grace window as
// createJob's initial marker without duplicating the threshold.
export function isStageInFlight(job: JobState, stage: StageName): boolean {
  return job.inFlightStage === stage && Date.now() - (job.inFlightSince ?? 0) < IN_FLIGHT_GRACE_MS;
}

export async function readJob(jobId: string): Promise<JobState | null> {
  const job = await kv.get<JobState>(jobKey(jobId));
  return job ?? null;
}

export async function writeJob(jobId: string, job: JobState): Promise<void> {
  job.lastUpdatedAt = Date.now();
  await kv.set(jobKey(jobId), job, { ex: JOB_TTL_SECONDS });
}

export function isJobStale(job: JobState): boolean {
  return job.status === "running" && Date.now() - job.lastUpdatedAt > STALE_THRESHOLD_MS;
}

function inferInFlightStage(results: JobResults): StageName {
  // Only called on a job already known to be running/stale, so a null here (fully done)
  // shouldn't happen — fall back to the last stage rather than throw.
  return getNextStageToRun(results) ?? STAGE_ORDER[STAGE_ORDER.length - 1];
}

export function buildStaleFailure(job: JobState): JobState {
  return {
    ...job,
    status: "failed",
    failedAt: inferInFlightStage(job.results),
    error:
      "This run stalled with no progress for too long and is being treated as failed.",
  };
}

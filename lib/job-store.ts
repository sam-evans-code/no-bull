import { kv } from "@vercel/kv";
import type { StressTestInput } from "@/lib/stages/stress-test";
import type { CounterEvidenceInput } from "@/lib/stages/could-be-wrong";
import type { DevilsAdvocateCase } from "@/lib/stages/devils-advocate";
import type { FactCheckEntry } from "@/lib/stages/fact-check";

export type StageName =
  | "reframe"
  | "stress-test"
  | "could-be-wrong"
  | "devils-advocate"
  | "fact-check";
export type JobStatus = "pending" | "running" | "complete" | "failed";

export interface JobResults {
  reframedQuestion?: string;
  stressTest?: StressTestInput;
  couldBeWrong?: CounterEvidenceInput;
  devilsAdvocateCase?: DevilsAdvocateCase;
  factCheck?: FactCheckEntry[];
}

export interface JobState {
  status: JobStatus;
  createdAt: number;
  lastUpdatedAt: number;
  input: unknown;
  failedAt?: StageName;
  error?: string;
  results: JobResults;
}

const JOB_TTL_SECONDS = 3600;

// ~3x the slowest measured single stage (stress-test stage 2, ~38s, after the
// stress-test/could-be-wrong split — see CLAUDE.md Session 8 addendum #2 follow-up).
const STALE_THRESHOLD_MS = 150_000;

const STAGE_ORDER: StageName[] = [
  "reframe",
  "stress-test",
  "could-be-wrong",
  "devils-advocate",
  "fact-check",
];

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
  };
  await kv.set(jobKey(jobId), job, { ex: JOB_TTL_SECONDS });
  return { jobId, job };
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
  if (!results.reframedQuestion) return STAGE_ORDER[0];
  if (!results.stressTest) return STAGE_ORDER[1];
  if (!results.couldBeWrong) return STAGE_ORDER[2];
  if (!results.devilsAdvocateCase) return STAGE_ORDER[3];
  return STAGE_ORDER[4];
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

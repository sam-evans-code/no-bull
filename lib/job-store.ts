import { kv } from "@vercel/kv";
import type { StressTestInput, CounterEvidenceInput } from "@/lib/stages/stress-test";
import type { DevilsAdvocateCase } from "@/lib/stages/devils-advocate";
import type { FactCheckEntry } from "@/lib/stages/fact-check";

export type StageName = "reframe" | "stress-test" | "devils-advocate" | "fact-check";
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
  input: unknown;
  failedAt?: StageName;
  error?: string;
  results: JobResults;
}

const JOB_TTL_SECONDS = 3600;

function jobKey(jobId: string): string {
  return `job:${jobId}`;
}

export async function createJob(input: unknown): Promise<{ jobId: string; job: JobState }> {
  const jobId = crypto.randomUUID();
  const job: JobState = {
    status: "pending",
    createdAt: Date.now(),
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
  await kv.set(jobKey(jobId), job, { ex: JOB_TTL_SECONDS });
}

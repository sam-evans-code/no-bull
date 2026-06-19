// Hand-mirrored from lib/job-store.ts and lib/stages/*.ts — those are server-only
// modules (pull in @vercel/kv, next/server's `after`) and can't be imported into
// a client bundle. If the backend shape changes, update both.

export type StageName =
  | "reframe"
  | "stress-test"
  | "could-be-wrong"
  | "devils-advocate"
  | "fact-check";
export type JobStatus = "pending" | "running" | "complete" | "failed";
export type Verdict = "ENTAILED" | "CONTRADICTED" | "UNVERIFIABLE";

export interface StressTestResult {
  counterHypotheses: string[];
  baseRates: string;
  falsePremiseCheck: string;
  conclusion: string;
}

export interface CounterEvidenceResult {
  counterEvidence: string[];
}

export interface DevilsAdvocateResult {
  keyArguments: string[];
  conclusion: string;
}

export interface FactCheckEntry {
  claim: string;
  verdict: Verdict;
  source: string | null;
}

export interface JobResults {
  reframedQuestion?: string;
  stressTest?: StressTestResult;
  couldBeWrong?: CounterEvidenceResult;
  devilsAdvocateCase?: DevilsAdvocateResult;
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

export const STAGE_LABELS: Record<StageName, string> = {
  reframe: "Reframing your question",
  "stress-test": "Stress-testing the idea",
  "could-be-wrong": "Checking for blind spots",
  "devils-advocate": "Building the counter-case",
  "fact-check": "Fact-checking claims",
};

export const STAGE_ORDER: StageName[] = [
  "reframe",
  "stress-test",
  "could-be-wrong",
  "devils-advocate",
  "fact-check",
];

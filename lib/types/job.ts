// Hand-mirrored from lib/job-store.ts and lib/stages/*.ts — those are server-only
// modules (pull in @vercel/kv, next/server's `after`) and can't be imported into
// a client bundle. If the backend shape changes, update both.

export type StageName =
  | "reframe"
  | "stress-test"
  | "could-be-wrong"
  | "devils-advocate"
  | "fact-check-extract"
  | "fact-check"
  | "narrative-correction";
export type JobStatus = "pending" | "running" | "complete" | "failed";
export type Verdict = "ENTAILED" | "CONTRADICTED" | "UNVERIFIABLE";
export type SourceStage = "stress-test" | "devils-advocate";

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

export interface ExtractedClaim {
  claim: string;
  sourceStage: SourceStage;
  importanceScore: number;
}

export interface FactCheckEntry {
  claim: string;
  verdict: Verdict;
  source: string | null;
  originStage: SourceStage;
  importanceScore: number;
}

export type NarrativeCorrection =
  | { stage: "stress-test"; triggeringClaims: string[]; revised: StressTestResult }
  | { stage: "devils-advocate"; triggeringClaims: string[]; revised: DevilsAdvocateResult };

export interface JobResults {
  reframedQuestion?: string;
  stressTest?: StressTestResult;
  couldBeWrong?: CounterEvidenceResult;
  devilsAdvocateCase?: DevilsAdvocateResult;
  factCheckClaims?: ExtractedClaim[];
  factCheck?: FactCheckEntry[];
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
}

export const STAGE_LABELS: Record<StageName, string> = {
  reframe: "Reframing your question",
  "stress-test": "Stress-testing the idea",
  "could-be-wrong": "Checking for blind spots",
  "devils-advocate": "Building the counter-case",
  "fact-check-extract": "Extracting claims to check",
  "fact-check": "Fact-checking claims",
  "narrative-correction": "Revising sections with corrected facts",
};

export const STAGE_ORDER: StageName[] = [
  "reframe",
  "stress-test",
  "could-be-wrong",
  "devils-advocate",
  "fact-check-extract",
  "fact-check",
  "narrative-correction",
];

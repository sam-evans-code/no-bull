"use client";

import { useEffect, useReducer } from "react";
import type { JobResults, JobState, StageName } from "@/lib/types/job";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/types/job";
import { pollJob, submitIdea } from "@/lib/no-bull-client";
import { pendoTrackClient } from "@/lib/pendo-client";
import IdeaForm from "@/app/components/IdeaForm";
import ProgressIndicator from "@/app/components/ProgressIndicator";
import ResultsView from "@/app/components/ResultsView";

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

type FlowState =
  | { phase: "idle"; input: string; submitError?: string }
  | { phase: "submitting"; input: string }
  | {
      phase: "polling";
      jobId: string;
      input: string;
      results: JobResults;
      pollingStartedAt: number;
      pollFailures: number;
    }
  | { phase: "complete"; results: JobResults }
  | {
      phase: "failed";
      failedInput: string;
      error: string;
      failedAt?: StageName;
      results: JobResults;
    }
  | { phase: "expired"; failedInput: string };

type Action =
  | { type: "INPUT_CHANGE"; text: string }
  | { type: "SUBMIT_START"; input: string }
  | { type: "SUBMIT_ERROR"; message: string }
  | { type: "SUBMIT_SUCCESS"; jobId: string }
  | { type: "POLL_OK"; job: JobState }
  | { type: "POLL_NOT_FOUND" }
  | { type: "POLL_ERROR" }
  | { type: "RESET" };

const INITIAL_STATE: FlowState = { phase: "idle", input: "" };

function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case "INPUT_CHANGE":
      if (state.phase !== "idle") return state;
      return { phase: "idle", input: action.text };

    case "SUBMIT_START":
      return { phase: "submitting", input: action.input };

    case "SUBMIT_ERROR":
      if (state.phase !== "submitting") return state;
      return { phase: "idle", input: state.input, submitError: action.message };

    case "SUBMIT_SUCCESS":
      if (state.phase !== "submitting") return state;
      return {
        phase: "polling",
        jobId: action.jobId,
        input: state.input,
        results: {},
        pollingStartedAt: Date.now(),
        pollFailures: 0,
      };

    case "POLL_OK": {
      if (state.phase !== "polling") return state;
      const { job } = action;
      if (job.status === "complete") {
        return { phase: "complete", results: job.results };
      }
      if (job.status === "failed") {
        return {
          phase: "failed",
          failedInput: state.input,
          error: job.error ?? "Something went wrong — please try again.",
          failedAt: job.failedAt,
          results: job.results,
        };
      }
      return { ...state, results: job.results, pollFailures: 0 };
    }

    case "POLL_NOT_FOUND": {
      if (state.phase !== "polling") return state;
      return { phase: "expired", failedInput: state.input };
    }

    case "POLL_ERROR": {
      if (state.phase !== "polling") return state;
      const pollFailures = state.pollFailures + 1;
      if (pollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        return {
          phase: "failed",
          failedInput: state.input,
          error: "We lost connection while checking on this run — please try again.",
          results: state.results,
        };
      }
      return { ...state, pollFailures };
    }

    case "RESET":
      return { phase: "idle", input: "" };
  }
}

export default function NoBullApp() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  async function handleSubmit(text: string) {
    const submitStartedAt = Date.now();
    pendoTrackClient("idea_submitted", {
      input_length: text.length,
      input_contains_question_mark: text.includes("?"),
      input_word_count: text.trim().split(/\s+/).filter(Boolean).length,
    });

    dispatch({ type: "SUBMIT_START", input: text });
    try {
      const { jobId } = await submitIdea(text);
      dispatch({ type: "SUBMIT_SUCCESS", jobId });
    } catch {
      pendoTrackClient("analysis_failed", {
        failed_stage_name: "unknown",
        failed_stage_number: 0,
        error_type: "network_error",
        stages_completed_count: 0,
        duration_before_failure_ms: Date.now() - submitStartedAt,
      });
      dispatch({
        type: "SUBMIT_ERROR",
        message: "Couldn't start a new run — please try again.",
      });
    }
  }

  function handleReset(previousPhase: FlowState["phase"]) {
    pendoTrackClient("new_analysis_requested", {
      previous_analysis_completed: previousPhase === "complete",
    });
    dispatch({ type: "RESET" });
  }

  const pollingJobId = state.phase === "polling" ? state.jobId : null;

  useEffect(() => {
    if (!pollingJobId || state.phase !== "polling") return;
    const { input, pollingStartedAt } = state;
    let cancelled = false;
    let consecutiveFailures = 0;
    let latestStagesCompletedCount = 0;

    const id = setInterval(async () => {
      const result = await pollJob(pollingJobId);
      if (cancelled) return;
      if (result.kind === "ok") {
        consecutiveFailures = 0;
        const { job } = result;
        const stagesCompletedCount = Object.keys(job.results).length;
        latestStagesCompletedCount = stagesCompletedCount;
        if (job.status === "complete") {
          const factCheck = job.results.factCheck ?? [];
          pendoTrackClient("analysis_completed", {
            total_duration_ms: Date.now() - pollingStartedAt,
            input_length: input.length,
            was_input_reframed: job.results.reframedQuestion !== input.trim(),
            total_claims_checked: factCheck.length,
            supported_claims_count: factCheck.filter((c) => c.verdict === "ENTAILED").length,
            contradicted_claims_count: factCheck.filter((c) => c.verdict === "CONTRADICTED")
              .length,
            unverifiable_claims_count: factCheck.filter((c) => c.verdict === "UNVERIFIABLE")
              .length,
          });
        } else if (job.status === "failed") {
          pendoTrackClient("analysis_failed", {
            failed_stage_name: job.failedAt ?? "unknown",
            failed_stage_number: job.failedAt ? STAGE_ORDER.indexOf(job.failedAt) + 1 : 0,
            error_type: "pipeline_error",
            stages_completed_count: stagesCompletedCount,
            duration_before_failure_ms: Date.now() - pollingStartedAt,
          });
        }
        dispatch({ type: "POLL_OK", job });
      } else if (result.kind === "not-found") {
        dispatch({ type: "POLL_NOT_FOUND" });
      } else {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          pendoTrackClient("analysis_failed", {
            failed_stage_name: "unknown",
            failed_stage_number: 0,
            error_type: "network_error",
            stages_completed_count: latestStagesCompletedCount,
            duration_before_failure_ms: Date.now() - pollingStartedAt,
          });
        }
        dispatch({ type: "POLL_ERROR" });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // input/pollingStartedAt are fixed for the lifetime of a polling session and
    // change only alongside pollingJobId, which already restarts this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingJobId]);

  if (state.phase === "idle") {
    return (
      <IdeaForm
        input={state.input}
        onChange={(text) => dispatch({ type: "INPUT_CHANGE", text })}
        onSubmit={() => handleSubmit(state.input)}
        submitting={false}
        submitError={state.submitError}
      />
    );
  }

  if (state.phase === "submitting") {
    return (
      <IdeaForm
        input={state.input}
        onChange={() => {}}
        onSubmit={() => {}}
        submitting={true}
      />
    );
  }

  if (state.phase === "polling") {
    return (
      <div className="flex flex-col gap-6">
        <ProgressIndicator
          results={state.results}
          pollingStartedAt={state.pollingStartedAt}
        />
        <ResultsView results={state.results} />
      </div>
    );
  }

  if (state.phase === "complete") {
    return (
      <div className="flex flex-col gap-6">
        <ResultsView results={state.results} />
        <button
          type="button"
          onClick={() => handleReset(state.phase)}
          className="self-start text-sm font-medium text-zinc-600 underline"
        >
          Try another idea
        </button>
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-red-200 bg-red-50 p-5">
        <h2 className="text-base font-semibold text-zinc-900">
          Something went wrong
        </h2>
        <p className="text-sm text-zinc-700">{state.error}</p>
        {state.failedAt && (
          <p className="text-xs text-zinc-500">
            Failed at: {STAGE_LABELS[state.failedAt]}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => handleSubmit(state.failedInput)}
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => handleReset(state.phase)}
            className="text-sm font-medium text-zinc-600 underline"
          >
            Try another idea
          </button>
        </div>
      </div>
    );
  }

  // phase === "expired"
  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-5">
      <h2 className="text-base font-semibold text-zinc-900">
        This result has expired
      </h2>
      <p className="text-sm text-zinc-700">
        We couldn&rsquo;t find this run — results are only kept for an hour,
        and this one&rsquo;s gone. Your idea wasn&rsquo;t lost, though.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => handleSubmit(state.failedInput)}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => handleReset(state.phase)}
          className="text-sm font-medium text-zinc-600 underline"
        >
          Try another idea
        </button>
      </div>
    </div>
  );
}

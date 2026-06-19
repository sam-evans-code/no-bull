"use client";

import { useEffect, useReducer } from "react";
import type { JobResults, JobState, StageName } from "@/lib/types/job";
import { STAGE_LABELS } from "@/lib/types/job";
import { pollJob, submitIdea } from "@/lib/no-bull-client";
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
    dispatch({ type: "SUBMIT_START", input: text });
    try {
      const { jobId } = await submitIdea(text);
      dispatch({ type: "SUBMIT_SUCCESS", jobId });
    } catch {
      dispatch({
        type: "SUBMIT_ERROR",
        message: "Couldn't start a new run — please try again.",
      });
    }
  }

  const pollingJobId = state.phase === "polling" ? state.jobId : null;

  useEffect(() => {
    if (!pollingJobId) return;
    let cancelled = false;

    const id = setInterval(async () => {
      const result = await pollJob(pollingJobId);
      if (cancelled) return;
      if (result.kind === "ok") {
        dispatch({ type: "POLL_OK", job: result.job });
      } else if (result.kind === "not-found") {
        dispatch({ type: "POLL_NOT_FOUND" });
      } else {
        dispatch({ type: "POLL_ERROR" });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
          onClick={() => dispatch({ type: "RESET" })}
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
            onClick={() => dispatch({ type: "RESET" })}
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
          onClick={() => dispatch({ type: "RESET" })}
          className="text-sm font-medium text-zinc-600 underline"
        >
          Try another idea
        </button>
      </div>
    </div>
  );
}

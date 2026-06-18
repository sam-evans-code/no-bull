"use client";

import { useState, useCallback } from "react";

interface FactCheckClaim {
  claim: string;
  verdict: "supported" | "contradicted" | "unverifiable";
  source?: string;
}

interface AnalysisError {
  failed_stage_name?: string;
  failed_stage_number?: number;
  error_type?: string;
  stages_completed_count?: number;
  message?: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [analysisDuration, setAnalysisDuration] = useState<number | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;

    const startTime = Date.now();
    setLoading(true);
    setResults(null);
    setError(null);
    setAnalysisDuration(null);

    // Pendo Track: idea_submitted — fires when the user submits their idea for stress testing
    if (window.pendo) {
      window.pendo.track("idea_submitted", {
        input_length: input.length,
        input_contains_question_mark: input.includes("?"),
        input_word_count: input.trim().split(/\s+/).length,
      });
    }

    try {
      const response = await fetch("/api/no-bull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const duration = Date.now() - startTime;

        // Pendo Track: analysis_failed — fires when the pipeline returns an error
        if (window.pendo) {
          window.pendo.track("analysis_failed", {
            failed_stage_name: String(data.failed_stage_name || "unknown"),
            failed_stage_number: Number(data.failed_stage_number) || 0,
            error_type: String(data.error_type || "api_error"),
            stages_completed_count: Number(data.stages_completed_count) || 0,
            duration_before_failure_ms: duration,
          });
        }

        setError(data as AnalysisError);
        return;
      }

      const duration = Date.now() - startTime;
      setResults(data);
      setAnalysisDuration(duration);

      // Pendo Track: analysis_completed — fires when the full pipeline completes successfully
      const factCheck: FactCheckClaim[] = Array.isArray(data.factCheck)
        ? data.factCheck
        : [];
      if (window.pendo) {
        window.pendo.track("analysis_completed", {
          total_duration_ms: duration,
          input_length: input.length,
          was_input_reframed: Boolean(data.wasInputReframed),
          total_claims_checked: factCheck.length,
          supported_claims_count: factCheck.filter(
            (c) => c.verdict === "supported"
          ).length,
          contradicted_claims_count: factCheck.filter(
            (c) => c.verdict === "contradicted"
          ).length,
          unverifiable_claims_count: factCheck.filter(
            (c) => c.verdict === "unverifiable"
          ).length,
        });
      }
    } catch {
      const duration = Date.now() - startTime;

      // Pendo Track: analysis_failed — fires on network/unexpected errors
      if (window.pendo) {
        window.pendo.track("analysis_failed", {
          failed_stage_name: "unknown",
          failed_stage_number: 0,
          error_type: "network_error",
          stages_completed_count: 0,
          duration_before_failure_ms: duration,
        });
      }

      setError({ message: "An unexpected error occurred. Please try again." });
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleReset = useCallback(() => {
    // Pendo Track: new_analysis_requested — fires when user clicks "Try another idea"
    if (window.pendo) {
      window.pendo.track("new_analysis_requested", {
        previous_analysis_completed: results !== null,
        previous_analysis_duration_ms: analysisDuration || 0,
      });
    }

    setInput("");
    setResults(null);
    setError(null);
    setAnalysisDuration(null);
  }, [results, analysisDuration]);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50">
      <header className="w-full max-w-2xl px-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-black">
          No Bull
        </h1>
        <p className="mt-3 text-lg text-zinc-600">
          Stress-test your decisions and ideas against reality, not a yes-man.
        </p>
      </header>

      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
        <section className="flex flex-col gap-3">
          <label htmlFor="idea" className="text-sm font-medium text-zinc-700">
            What idea or decision do you want stress-tested?
          </label>
          <textarea
            id="idea"
            rows={5}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="e.g. We should raise prices by 20% next quarter."
            className="w-full resize-none rounded-md border border-zinc-300 bg-white p-4 text-base text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Stress-test it"}
          </button>
        </section>

        {results ? (
          <section
            aria-label="Results"
            className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border border-zinc-300 bg-white p-6 text-sm text-zinc-700"
          >
            <p>Analysis complete.</p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white"
            >
              Try another idea
            </button>
          </section>
        ) : error ? (
          <section
            aria-label="Error"
            className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-600"
          >
            <p>{error.message || "Analysis failed. Please try again."}</p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white"
            >
              Try again
            </button>
          </section>
        ) : (
          <section
            aria-label="Results"
            className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white text-sm text-zinc-400"
          >
            Results will appear here.
          </section>
        )}
      </main>
    </div>
  );
}

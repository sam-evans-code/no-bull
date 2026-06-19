"use client";

import { useEffect, useState } from "react";
import type { JobResults } from "@/lib/types/job";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/types/job";
import { inferInFlightStage } from "@/lib/no-bull-client";

interface ProgressIndicatorProps {
  results: JobResults;
  pollingStartedAt: number;
}

function isStageDone(stage: (typeof STAGE_ORDER)[number], results: JobResults): boolean {
  switch (stage) {
    case "reframe":
      return Boolean(results.reframedQuestion);
    case "stress-test":
      return Boolean(results.stressTest);
    case "could-be-wrong":
      return Boolean(results.couldBeWrong);
    case "devils-advocate":
      return Boolean(results.devilsAdvocateCase);
    case "fact-check-extract":
      return Boolean(results.factCheckClaims);
    case "fact-check":
      return Boolean(results.factCheck);
    case "narrative-correction":
      return Boolean(results.narrativeCorrections);
  }
}

export default function ProgressIndicator({
  results,
  pollingStartedAt,
}: ProgressIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeStage = inferInFlightStage(results);
  const elapsedSeconds = Math.max(0, Math.floor((now - pollingStartedAt) / 1000));

  // No per-stage start timestamp is tracked client-side, so this is an
  // approximation off total elapsed time rather than time-in-stress-test.
  const showSlowStressTestNote = activeStage === "stress-test" && elapsedSeconds >= 20;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-[1.3125rem] text-zinc-500">Running for {elapsedSeconds}s…</p>
      <ol className="flex flex-col gap-2">
        {STAGE_ORDER.map((stage) => {
          const done = isStageDone(stage, results);
          const active = !done && stage === activeStage;
          return (
            <li
              key={stage}
              className={`flex items-center gap-2 text-[1.3125rem] ${
                done
                  ? "text-zinc-100"
                  : active
                    ? "font-medium text-red-500"
                    : "text-zinc-600"
              }`}
            >
              <span aria-hidden="true">{done ? "✓" : active ? "→" : "·"}</span>
              <span>{STAGE_LABELS[stage]}…</span>
            </li>
          );
        })}
      </ol>
      {showSlowStressTestNote && (
        <p className="text-xs text-zinc-500">
          This step usually takes 30–45s — still working.
        </p>
      )}
    </section>
  );
}

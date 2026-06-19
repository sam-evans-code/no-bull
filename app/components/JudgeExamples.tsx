// JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING
"use client";

import { JUDGE_EXAMPLES } from "@/lib/judge-examples";

interface JudgeExamplesProps {
  onPick: (text: string) => void;
}

export default function JudgeExamples({ onPick }: JudgeExamplesProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Try a judge&rsquo;s example
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {JUDGE_EXAMPLES.map((judge) => (
          <button
            key={judge.firstName}
            type="button"
            onClick={() => onPick(judge.text)}
            title={`${judge.fullName}, ${judge.role}`}
            aria-label={`Add ${judge.fullName}'s example prompt (${judge.role})`}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-red-600 hover:text-zinc-50"
          >
            {judge.firstName}
          </button>
        ))}
      </div>
    </div>
  );
}
// END JUDGE EXAMPLES — TEMPORARY

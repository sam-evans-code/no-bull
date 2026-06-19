const MAX_INPUT_LENGTH = 4000; // kept in sync with app/api/no-bull/route.ts

interface IdeaFormProps {
  input: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError?: string;
}

export default function IdeaForm({
  input,
  onChange,
  onSubmit,
  submitting,
  submitError,
}: IdeaFormProps) {
  const overLimit = input.length > MAX_INPUT_LENGTH;
  const canSubmit = input.trim().length > 0 && !overLimit && !submitting;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Leaders don&rsquo;t need &lsquo;yes men&rsquo;. They need someone
          willing to be the a**hole in the room.
        </h1>
        <p className="text-sm text-zinc-500">
          Workers burn an average of 6.4 hours a week &ldquo;botsitting&rdquo;
          &mdash;{" "}
          <a
            href="https://www.glean.com/work-ai-institute/reports/work-ai-index-report"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Work AI Index 2026
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="idea" className="text-sm font-medium text-zinc-300">
          What idea or decision do you want stress-tested?
        </label>
        <textarea
          id="idea"
          rows={5}
          value={input}
          disabled={submitting}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. We should raise prices by 20% next quarter."
          className="w-full resize-none rounded-sm border border-zinc-800 bg-zinc-900 p-4 text-base text-zinc-100 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-950"
        />
        <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-500"}`}>
          {overLimit
            ? "Too long — trim it down before stress-testing it."
            : `${input.length}/${MAX_INPUT_LENGTH}`}
        </p>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="self-start rounded-sm bg-red-600 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Stress-test it"}
          </button>
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
        </div>

        <details className="mt-2 text-sm text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-300">
            How this works
          </summary>
          <p className="mt-2 font-medium leading-relaxed text-zinc-300">
            The more you&rsquo;ve talked to your AI, the more it agrees with
            you. That&rsquo;s not a feature. That&rsquo;s the data. If your
            idea, decision, or proposal can survive No Bull, it can survive
            your board.
          </p>
          <p className="mt-2 leading-relaxed">
            No yes-man here. Before answering, we rewrite your idea as a neutral
            question, so we&rsquo;re not leading the AI toward agreeing with
            you. Then we force it to list specific ways its own analysis could
            be wrong. A second, different AI builds the strongest case against
            your idea. Finally, a separate pass fact-checks any claims against
            real sources. You&rsquo;ll see each of these steps separately
            below, not blended into one answer.
          </p>
        </details>
      </div>
    </section>
  );
}

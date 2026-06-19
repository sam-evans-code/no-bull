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
  const canSubmit = input.trim().length > 0 && !submitting;

  return (
    <section className="flex flex-col gap-3">
      <label htmlFor="idea" className="text-sm font-medium text-zinc-700">
        What idea or decision do you want stress-tested?
      </label>
      <textarea
        id="idea"
        rows={5}
        value={input}
        disabled={submitting}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. We should raise prices by 20% next quarter."
        className="w-full resize-none rounded-md border border-zinc-300 bg-white p-4 text-base text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Starting…" : "Stress-test it"}
        </button>
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      </div>

      <details className="mt-2 text-sm text-zinc-600">
        <summary className="cursor-pointer font-medium text-zinc-700">
          How this works
        </summary>
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
    </section>
  );
}

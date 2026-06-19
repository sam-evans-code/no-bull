import Image from "next/image";
import logo from "@/app/no-bull-logo.png";

const MAX_INPUT_LENGTH = 4000; // kept in sync with app/api/no-bull/route.ts

interface IdeaFormProps {
  input: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError?: string;
  skipWarning?: boolean;
}

export default function IdeaForm({
  input,
  onChange,
  onSubmit,
  submitting,
  submitError,
  skipWarning,
}: IdeaFormProps) {
  const overLimit = input.length > MAX_INPUT_LENGTH;
  const canSubmit = input.trim().length > 0 && !overLimit && !submitting;

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
      <div className="mx-auto flex max-w-[54rem] flex-col items-center gap-4">
        <Image src={logo} alt="" width={128} height={128} className="h-32 w-32" priority />
        <span className="font-mono text-lg font-semibold uppercase tracking-widest text-zinc-100">
          No Bull
        </span>
        <h1 className="text-3xl tracking-tight text-zinc-50 sm:text-4xl">
          Your AI agrees with you. <span className="font-bold">That&rsquo;s the problem.</span>
        </h1>
        <p className="text-lg text-zinc-300">
          AI tells you you&rsquo;re right 49% more often than a human would.{" "}
          <span className="font-semibold">Even when you&rsquo;re not.</span>{" "}
          <a
            href="https://www.science.org/doi/10.1126/science.aec8352"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Science 2026
          </a>
        </p>
        <p className="text-lg leading-relaxed text-zinc-300">
          AI tools are built to keep you happy.{" "}
          <span className="font-semibold">
            No Bull is built to catch you out.
          </span>
          <br />
          It rewrites your prompt so it can&rsquo;t lead the answer, forces
          multiple counter-cases against your own idea, then sends the result
          to another LLM to fact-check.
        </p>
        <p className="text-lg font-semibold text-zinc-300">No yes-men. No bull.</p>
      </div>

      <div className="flex w-full flex-col gap-3 text-left">
        <label htmlFor="idea" className="sr-only">
          What idea or decision do you want stress-tested?
        </label>
        <div className="relative">
          <textarea
            id="idea"
            rows={5}
            value={input}
            disabled={submitting}
            onChange={(e) => onChange(e.target.value)}
            placeholder="What strategies, ideas or decisions need stress-testing? Paste them in here before you share it with your team"
            className="block w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 p-4 pb-16 text-xl text-zinc-100 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-950"
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="absolute bottom-3 right-3 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Stress-test it"}
          </button>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-500"}`}>
            {overLimit
              ? "Too long — trim it down before stress-testing it."
              : `${input.length}/${MAX_INPUT_LENGTH}`}
          </p>
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          {skipWarning && (
            <p className="text-sm text-zinc-400">
              Skipping may reduce how sharp this stress test can be — No Bull
              works best with specific input.
            </p>
          )}
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

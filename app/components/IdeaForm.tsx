import Image from "next/image";
import { useEffect, useRef } from "react";
import logo from "@/app/no-bull-logo.png";
// JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING
import JudgeExamples from "@/app/components/JudgeExamples";
// END JUDGE EXAMPLES — TEMPORARY

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

  // JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingFocusRef = useRef(false);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    const el = textareaRef.current;
    if (el) {
      // Reads el.value (the committed DOM value) rather than a captured
      // string, since this only works if onChange/dispatch has already
      // updated the DOM by the time this effect runs — true for today's
      // synchronous useReducer path, but would break if that ever changed.
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [input]);

  function handleExampleClick(exampleText: string) {
    const newValue = input.length === 0 ? exampleText : `${input}\n\n${exampleText}`;
    pendingFocusRef.current = true;
    onChange(newValue);
  }
  // END JUDGE EXAMPLES — TEMPORARY

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="mx-auto flex max-w-[54rem] flex-col items-center gap-4">
        <Image
          src={logo}
          alt=""
          width={72}
          height={72}
          className="h-[4.5rem] w-[4.5rem]"
          priority
        />
        <span className="font-mono text-base font-semibold uppercase tracking-widest text-zinc-100">
          No Bull AI
        </span>
        <h1 className="text-2xl tracking-tight text-zinc-50 sm:text-3xl">
          Your AI agrees with you. <span className="font-bold">That&rsquo;s a problem.</span>
        </h1>
        <p className="text-base text-zinc-300">
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
        <p className="text-base leading-relaxed text-zinc-300">
          AI tools are built to keep you happy.{" "}
          <span className="font-semibold">
            No Bull is built to catch you out.
          </span>
          <br />
          It rewrites your prompt so it can&rsquo;t lead the answer, forces
          multiple counter-cases against your own idea, then sends the result
          to another LLM to fact-check.
        </p>
        <p className="text-base font-semibold text-zinc-300">No yes-men. No bull.</p>
      </div>

      <div className="flex w-full flex-col gap-3 text-left">
        <label htmlFor="idea" className="sr-only">
          What idea or decision do you want stress-tested?
        </label>
        {/* JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING */}
        {!submitting && <JudgeExamples onPick={handleExampleClick} />}
        {/* END JUDGE EXAMPLES — TEMPORARY */}
        <div className="relative">
          <textarea
            id="idea"
            rows={4}
            value={input}
            ref={textareaRef} // JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING (not inside a marker block, remove by hand)
            disabled={submitting}
            onChange={(e) => onChange(e.target.value)}
            placeholder="What strategies, ideas or decisions need stress-testing? Paste them in here before you share it with your team"
            className="block w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 p-4 pb-16 text-lg text-zinc-100 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-950"
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
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Step</th>
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Why it&rsquo;s necessary</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">0</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Dynamic Clarify — single forced-tool-choice call judges if
                    the input is specific enough; if not, generates 1–3
                    targeted questions (skipped silently if input is already
                    specific)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Claude (claude-sonnet-4-6)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Stage 1&rsquo;s reframe fixes the framing of biased input,
                    but can&rsquo;t manufacture missing context (market,
                    stakes, constraints). A vague-but-neutral question still
                    produces a generic stress test — this closes that gap.
                    Always fail-open: a skip, timeout, or error falls through
                    to Stage 1 with the original input unchanged, never
                    blocking the pipeline.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">1</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Reframe — rewrite the input (plus any clarify answers) as
                    a neutral, stance-free question
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Claude (claude-sonnet-4-6)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Converting a stated opinion into a neutral question is
                    the single highest-leverage sycophancy fix found (closes
                    a 24pp gap per the UK AISI study).
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">2</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Stress Test — structured analysis forcing
                    counter-hypotheses, base rates, and a false-premise check
                    before any conclusion
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Claude (claude-sonnet-4-6)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Forces the reasoning scaffold to happen before the
                    conclusion is written, rather than letting the model
                    justify a conclusion after the fact.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">3</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Could You Be Wrong — forced itemised list of specific
                    ways the analysis above could be wrong
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Claude (claude-sonnet-4-6)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    The &lsquo;could you be wrong?&rsquo; metacognitive prompt
                    reliably surfaces hidden counter-evidence and bias that a
                    single pass misses.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">4</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Devil&rsquo;s Advocate — build the strongest possible case
                    against the idea
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    OpenAI (gpt-5.4)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Same-model self-critique is weak; a different provider
                    gives genuine cross-model critique instead of the same
                    model agreeing with itself.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">5</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Fact-Check Extract — pull out atomic, independently
                    verifiable claims from Stage 2 + Stage 4 only (not Stage
                    0, 1, or 3)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    OpenAI (gpt-5.4-nano)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    &lsquo;Information asymmetry&rsquo;: the checker never
                    sees the reframed question, clarify answers, or the
                    could-you-be-wrong list, so it can&rsquo;t inherit their
                    persuasive framing — only checks raw claims.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">6</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Fact-Check Verify — per claim, grounded web search +
                    ENTAILED/CONTRADICTED/UNVERIFIABLE verdict
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    OpenAI (gpt-5.4-mini research, gpt-5.4-nano classify)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Narrow per-claim verification with real web grounding
                    outperforms one open-ended &lsquo;review this&rsquo;
                    call; subjective/strategic claims are deliberately
                    excluded rather than forced into a verdict.
                  </td>
                </tr>
                <tr className="border-b border-zinc-900 align-top">
                  <td className="py-2 pr-4 text-zinc-100">7</td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Narrative Correction — only runs if a claim came back
                    CONTRADICTED; rewrites the affected Stage 2 or Stage 4
                    section without leaning on the disproven claim
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Same model as the section being corrected (Claude or
                    OpenAI)
                  </td>
                  <td className="py-2 pr-4 text-zinc-100">
                    Closes the gap where a confident conclusion could sit
                    right above a fact-check row saying its underlying claim
                    was false; UNVERIFIABLE claims are deliberately not
                    corrected on, since &lsquo;couldn&rsquo;t verify&rsquo;
                    isn&rsquo;t &lsquo;false&rsquo;.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

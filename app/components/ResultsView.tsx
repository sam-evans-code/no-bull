import type { JobResults, Verdict } from "@/lib/types/job";

const VERDICT_DISPLAY: Record<Verdict, { icon: string; label: string }> = {
  ENTAILED: { icon: "✅", label: "ENTAILED" },
  CONTRADICTED: { icon: "⚠️", label: "CONTRADICTED" },
  UNVERIFIABLE: { icon: "❓", label: "UNVERIFIABLE" },
};

interface ResultsViewProps {
  results: JobResults;
}

export default function ResultsView({ results }: ResultsViewProps) {
  return (
    <div className="flex flex-col gap-6">
      {results.reframedQuestion && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            The Reframed Question
          </h2>
          <p className="text-base text-zinc-900">{results.reframedQuestion}</p>
        </section>
      )}

      {results.stressTest && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            The Stress Test
          </h2>
          <div className="flex flex-col gap-3 text-base text-zinc-900">
            <ul className="list-disc pl-5">
              {results.stressTest.counterHypotheses.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <p>{results.stressTest.baseRates}</p>
            <p>{results.stressTest.falsePremiseCheck}</p>
            <p className="font-medium">{results.stressTest.conclusion}</p>
          </div>
        </section>
      )}

      {results.couldBeWrong && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Where This Could Be Wrong
          </h2>
          <ul className="list-disc pl-5 text-base text-zinc-900">
            {results.couldBeWrong.counterEvidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {results.devilsAdvocateCase && (
        <section className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            The Strongest Case Against It
          </h2>
          <ul className="list-disc pl-5 text-base text-zinc-900">
            {results.devilsAdvocateCase.keyArguments.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="font-medium text-zinc-900">
            {results.devilsAdvocateCase.conclusion}
          </p>
        </section>
      )}

      {results.factCheck && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Fact Check
          </h2>
          {results.factCheck.length === 0 ? (
            <p className="text-base text-zinc-600">
              No independently checkable factual claims were found in this
              analysis.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Claim</th>
                  <th className="py-2 pr-4 font-medium">Verdict</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {results.factCheck.map((entry, i) => {
                  const verdict = VERDICT_DISPLAY[entry.verdict];
                  return (
                    <tr key={i} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-4 text-zinc-900">{entry.claim}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {verdict.icon} {verdict.label}
                      </td>
                      <td className="py-2">
                        {entry.source ? (
                          <a
                            href={entry.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                          >
                            source
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {results.reframedQuestion && (
        <p className="text-xs text-zinc-400">
          Stress test by Claude · Counter-case and fact-check by GPT
        </p>
      )}
    </div>
  );
}

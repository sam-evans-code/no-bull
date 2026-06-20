import type { JobResults, NarrativeCorrection, SourceStage, Verdict } from "@/lib/types/job";

const VERDICT_DISPLAY: Record<Verdict, { icon: string; label: string }> = {
  ENTAILED: { icon: "✅", label: "ENTAILED" },
  CONTRADICTED: { icon: "⚠️", label: "CONTRADICTED" },
  UNVERIFIABLE: { icon: "❓", label: "UNVERIFIABLE" },
};

const SECTION_NAMES: Record<SourceStage, string> = {
  "stress-test": "Stress Test",
  "devils-advocate": "Strongest Case Against It",
};

interface ResultsViewProps {
  results: JobResults;
}

function findCorrection<S extends SourceStage>(
  corrections: NarrativeCorrection[] | undefined,
  stage: S
): Extract<NarrativeCorrection, { stage: S }> | undefined {
  return corrections?.find(
    (c): c is Extract<NarrativeCorrection, { stage: S }> => c.stage === stage
  );
}

function RevisionBanner({ triggeringClaims }: { triggeringClaims: string[] }) {
  return (
    <div className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
      <p className="font-medium">
        ⚠ This section was revised — fact-checking found the following claim(s) to be
        false:
      </p>
      <ul className="list-disc pl-5">
        {triggeringClaims.map((claim, i) => (
          <li key={i}>{claim}</li>
        ))}
      </ul>
    </div>
  );
}

function UnverifiableNote({ claims }: { claims: string[] }) {
  if (claims.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
      <p>
        ❓ The following claim(s) in this section could not be confirmed or denied via web
        search — that&apos;s not the same as being false:
      </p>
      <ul className="list-disc pl-5">
        {claims.map((claim, i) => (
          <li key={i}>{claim}</li>
        ))}
      </ul>
    </div>
  );
}

function BulletItem({ text }: { text: string }) {
  const match = text.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
  if (!match) return <li>{text}</li>;
  const [, lead, rest] = match;
  return (
    <li>
      <strong>{lead}</strong>
      {rest && ` ${rest}`}
    </li>
  );
}

function KeyPoints({ points }: { points: string[] }) {
  if (points.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xl font-semibold uppercase tracking-wide text-zinc-500">
        Key Points
      </p>
      <ul className="list-disc pl-5 text-base text-zinc-100">
        {points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ResultsView({ results }: ResultsViewProps) {
  const stressTestCorrection = findCorrection(results.narrativeCorrections, "stress-test");
  const devilsAdvocateCorrection = findCorrection(
    results.narrativeCorrections,
    "devils-advocate"
  );

  const stressTest = stressTestCorrection?.revised ?? results.stressTest;
  const devilsAdvocateCase = devilsAdvocateCorrection?.revised ?? results.devilsAdvocateCase;

  const unverifiableByStage = (stage: SourceStage): string[] =>
    (results.factCheck ?? [])
      .filter((entry) => entry.originStage === stage && entry.verdict === "UNVERIFIABLE")
      .map((entry) => entry.claim);

  const factCheckCounts = results.factCheck
    ? {
        entailed: results.factCheck.filter((e) => e.verdict === "ENTAILED").length,
        contradicted: results.factCheck.filter((e) => e.verdict === "CONTRADICTED").length,
        unverifiable: results.factCheck.filter((e) => e.verdict === "UNVERIFIABLE").length,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      {results.reframedQuestion && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
            The Reframed Question
          </h2>
          <p className="text-base text-zinc-100">{results.reframedQuestion}</p>
        </section>
      )}

      {stressTest && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer">
            <span className="block font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
              The Stress Test
            </span>
            <span className="mt-1 block text-xs font-normal text-zinc-400">
              {stressTest.counterHypotheses.length} counter-hypotheses · base-rate reasoning
              applied · false-premise check applied
              {stressTestCorrection && " · revised"}
            </span>
          </summary>
          {stressTestCorrection && (
            <RevisionBanner triggeringClaims={stressTestCorrection.triggeringClaims} />
          )}
          <div className="flex flex-col gap-3 text-base text-zinc-100">
            <ul className="list-disc pl-5">
              {stressTest.counterHypotheses.map((item, i) => (
                <BulletItem key={i} text={item} />
              ))}
            </ul>
            <p>{stressTest.baseRates}</p>
            <p>{stressTest.falsePremiseCheck}</p>
            <p className="font-medium">{stressTest.conclusion}</p>
          </div>
          <KeyPoints points={stressTest.keyPoints} />
          <UnverifiableNote claims={unverifiableByStage("stress-test")} />
        </details>
      )}

      {results.couldBeWrong && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer">
            <span className="block font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Where This Could Be Wrong
            </span>
            <span className="mt-1 block text-xs font-normal text-zinc-400">
              {results.couldBeWrong.counterEvidence.length} ways this could be wrong
            </span>
          </summary>
          <ul className="list-disc pl-5 text-base text-zinc-100">
            {results.couldBeWrong.counterEvidence.map((item, i) => (
              <BulletItem key={i} text={item} />
            ))}
          </ul>
          <KeyPoints points={results.couldBeWrong.keyPoints} />
        </details>
      )}

      {devilsAdvocateCase && (
        <details className="flex flex-col gap-2 rounded-2xl border-l-2 border-red-600 bg-zinc-900 p-4">
          <summary className="cursor-pointer">
            <span className="block font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
              The Strongest Case Against It
            </span>
            <span className="mt-1 block text-xs font-normal text-zinc-400">
              {devilsAdvocateCase.keyArguments.length} counter-arguments
              {devilsAdvocateCorrection && " · revised"}
            </span>
          </summary>
          {devilsAdvocateCorrection && (
            <RevisionBanner triggeringClaims={devilsAdvocateCorrection.triggeringClaims} />
          )}
          <ul className="list-disc pl-5 text-base text-zinc-100">
            {devilsAdvocateCase.keyArguments.map((item, i) => (
              <BulletItem key={i} text={item} />
            ))}
          </ul>
          <p className="font-medium text-zinc-100">{devilsAdvocateCase.conclusion}</p>
          <KeyPoints points={devilsAdvocateCase.keyPoints} />
          <UnverifiableNote claims={unverifiableByStage("devils-advocate")} />
        </details>
      )}

      {results.factCheck && factCheckCounts && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer">
            <span className="block font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Fact Check
            </span>
            <span className="mt-1 block text-xs font-normal text-zinc-400">
              {results.factCheck.length === 0
                ? "No checkable claims found"
                : `${factCheckCounts.entailed} entailed · ${factCheckCounts.contradicted} contradicted · ${factCheckCounts.unverifiable} unverifiable`}
            </span>
          </summary>
          {results.factCheck.length === 0 ? (
            <p className="text-base text-zinc-300">
              No independently checkable factual claims were found in this
              analysis.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Claim</th>
                    <th className="py-2 pr-4 font-medium">Verdict</th>
                    <th className="py-2 pr-4 font-medium">Impact if false</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {results.factCheck.map((entry, i) => {
                    const verdict = VERDICT_DISPLAY[entry.verdict];
                    return (
                      <tr key={i} className="border-b border-zinc-900 align-top">
                        <td className="py-2 pr-4 text-zinc-100">{entry.claim}</td>
                        <td
                          className={`py-2 pr-4 whitespace-nowrap ${
                            entry.verdict === "CONTRADICTED"
                              ? "text-red-400"
                              : "text-zinc-100"
                          }`}
                        >
                          {verdict.icon} {verdict.label}
                          {entry.verdict === "CONTRADICTED" && (
                            <p className="mt-1 text-xs font-normal text-red-400/80">
                              → caused the {SECTION_NAMES[entry.originStage]} section to be
                              revised
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap text-zinc-400">
                          {entry.importanceScore}/100
                        </td>
                        <td className="py-2">
                          {entry.source ? (
                            <a
                              href={entry.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 underline"
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
            </div>
          )}
        </details>
      )}

      {results.reframedQuestion && (
        <p className="text-xs text-zinc-400">
          Stress test by Claude · Counter-case and fact-check by GPT
        </p>
      )}
    </div>
  );
}

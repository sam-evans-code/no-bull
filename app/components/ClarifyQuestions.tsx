"use client";

import { useState } from "react";

interface ClarifyQuestionsProps {
  originalInput: string;
  questions: string[];
  onAnswerAndContinue: (combinedInput: string) => void;
  onSkipAnyway: () => void;
  onBack: () => void;
}

function buildCombinedInput(originalInput: string, questions: string[], answers: string[]): string {
  const pairs = questions
    .map((question, i) => ({ question, answer: answers[i]?.trim() ?? "" }))
    .filter((pair) => pair.answer.length > 0);

  if (pairs.length === 0) return originalInput;

  const context = pairs.map((pair) => `Q: ${pair.question}\nA: ${pair.answer}`).join("\n");
  return `${originalInput}\n\nAdditional context (from clarifying questions):\n${context}`;
}

export default function ClarifyQuestions({
  originalInput,
  questions,
  onAnswerAndContinue,
  onSkipAnyway,
  onBack,
}: ClarifyQuestionsProps) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function handleAnswerChange(index: number, text: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  }

  function handleContinue() {
    onAnswerAndContinue(buildCombinedInput(originalInput, questions, answers));
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-zinc-400">
          A couple of quick questions before we stress-test this
        </h2>
        <p className="text-sm text-zinc-400">{originalInput}</p>
      </div>

      <div className="flex flex-col gap-4">
        {questions.map((question, i) => (
          <div key={i} className="flex flex-col gap-2">
            <label htmlFor={`clarify-${i}`} className="text-sm font-medium text-zinc-200">
              {question}
            </label>
            <input
              id={`clarify-${i}`}
              type="text"
              value={answers[i] ?? ""}
              onChange={(e) => handleAnswerChange(i, e.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-base text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white"
        >
          Answer &amp; continue
        </button>
        <button
          type="button"
          onClick={onSkipAnyway}
          className="text-sm font-medium text-zinc-400 underline"
        >
          Skip anyway
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs font-medium text-zinc-500 underline"
      >
        ← Back
      </button>
    </section>
  );
}

"use client";

import { useState } from "react";
import { TEST_CARDS, TEST_DATA, type TestType, type TestResult } from "./data";

export default function TestPage() {
  const [active, setActive] = useState<TestType | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);

  function startTest(type: TestType) {
    setActive(type);
    setAnswers({});
    setResult(null);
  }

  function selectAnswer(qIndex: number, value: number) {
    setAnswers((a) => ({ ...a, [qIndex]: value }));
  }

  function submit() {
    if (!active) return;
    const def = TEST_DATA[active];
    if (def.questions.some((_, i) => answers[i] === undefined)) return;
    let s = 0;
    def.questions.forEach((_, i) => {
      const v = answers[i];
      s += def.reverseIdx.includes(i) ? 4 - v : v;
    });
    setScore(s);
    setResult(def.getResult(s));
  }

  if (!active) {
    return (
      <div>
        <div className="mb-5 text-lg font-extrabold text-text">🧪 심리검사</div>
        <div className="grid grid-cols-1 gap-3.5 shell:grid-cols-3">
          {TEST_CARDS.map((t) => (
            <button
              key={t.type}
              onClick={() => startTest(t.type)}
              className="relative flex min-h-[130px] flex-col gap-2.5 overflow-hidden rounded-2xl p-5 text-left text-white transition-transform hover:-translate-y-1"
              style={{ background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})` }}
            >
              <div className="text-[11px] font-bold text-white/75">{t.label}</div>
              <div className="text-lg font-extrabold leading-snug">{t.title}</div>
              <div className="mt-auto text-xs text-white/70">{t.sub}</div>
              <div className="absolute bottom-3.5 right-4 text-4xl opacity-85">{t.emoji}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const def = TEST_DATA[active];
  const allAnswered = def.questions.every((_, i) => answers[i] !== undefined);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-lg font-extrabold text-text">{def.title}</div>
        <button onClick={() => setActive(null)} className="text-text-muted">
          ×
        </button>
      </div>
      <div className="mb-5 text-[13px] leading-relaxed text-text-muted">{def.intro}</div>

      {result ? (
        <div className="py-6 text-center">
          <div className="mb-2 text-5xl font-black" style={{ color: result.color }}>
            {score}점
          </div>
          <div className="mb-3 text-lg font-bold text-text">{result.label}</div>
          <div className="text-sm leading-relaxed text-text-muted">{result.desc}</div>
          <button
            onClick={() => setActive(null)}
            className="mt-6 rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white"
          >
            닫기
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {def.questions.map((q, i) => (
              <div key={i} className="border-b border-border pb-5 last:border-0">
                <div className="mb-2 text-xs font-bold text-text-muted">
                  Q{i + 1} / {def.questions.length}
                </div>
                <div className="mb-4 font-bold leading-snug text-text">{q}</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {def.cols.map((label, ci) => (
                    <button
                      key={ci}
                      onClick={() => selectAnswer(i, ci)}
                      className={`rounded-full border-2 px-3 py-2 text-xs font-bold transition-colors ${
                        answers[i] === ci
                          ? "border-primary-dark bg-primary-light text-primary-dark"
                          : "border-border text-text-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={submit}
              disabled={!allAnswered}
              className="rounded-xl bg-primary-dark px-8 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              결과 보기
            </button>
          </div>
        </>
      )}
    </div>
  );
}

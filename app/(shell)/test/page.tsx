"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import TestResultActions from "@/app/components/TestResultActions";
import RequireAuth from "@/app/components/RequireAuth";
import { useTestHistory } from "@/app/hooks/useTestHistory";
import { TEST_CARDS, TEST_DATA, type TestType, type TestResult, type TestDef } from "./data";

/**
 * 점수가 "우려되는 방향"으로 얼마나 치우쳤는지를 0(최선)~1(최악)로 정규화해서
 * needsSupport/isHighRisk를 판단한다. higherIsBetter인 척도(자존감)는 점수가
 * 낮을수록, 그 외(스트레스/우울)는 점수가 높을수록 우려되는 쪽이다.
 */
function concernLevel(def: TestDef, score: number) {
  const maxIdx = def.cols.length - 1;
  const base = def.scoreBase ?? 0;
  const min = def.questions.length * base;
  const max = def.questions.length * (maxIdx + base);
  const range = max - min;
  const concern = def.higherIsBetter ? max - score : score - min;
  const ratio = range === 0 ? 0 : concern / range;
  return { needsSupport: ratio >= 0.5, isHighRisk: ratio >= 0.75 };
}

export default function TestPage() {
  return (
    <RequireAuth reason="심리검사 결과를 기록하려면 로그인이 필요해요.">
      <Suspense fallback={null}>
        <TestPageContent />
      </Suspense>
    </RequireAuth>
  );
}

function TestPageContent() {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType = requestedType && requestedType in TEST_DATA ? (requestedType as TestType) : null;
  const [active, setActive] = useState<TestType | null>(initialType);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const { add, previousScore } = useTestHistory();

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
    const maxIdx = def.cols.length - 1;
    const base = def.scoreBase ?? 0;
    let s = 0;
    def.questions.forEach((_, i) => {
      const v = answers[i];
      const raw = def.reverseIdx.includes(i) ? maxIdx - v : v;
      s += raw + base;
    });
    const outcome = def.getResult(s);
    setScore(s);
    setResult(outcome);

    const { needsSupport } = concernLevel(def, s);
    const prev = previousScore(active);
    setDelta(prev === null ? null : s - prev);
    add({ type: active, title: def.title, score: s, label: outcome.label, color: outcome.color, needsSupport });
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
              <div className="pr-10 text-[11px] font-bold text-white/75">{t.label}</div>
              <div className="pr-10 text-lg font-extrabold leading-snug">{t.title}</div>
              <div className="mt-auto pr-10 text-xs text-white/70">{t.sub}</div>
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
          <TestResultActions {...concernLevel(def, score)} delta={delta} />
          <button
            onClick={() => setActive(null)}
            className="mt-3 text-sm font-bold text-text-muted"
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

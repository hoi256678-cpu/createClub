"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/app/components/ui/Card";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { readJSON, writeJSON } from "@/lib/storage";
import { apiFetch } from "@/lib/api";

const KEY = "somit:mood";
const SHARE_KEY = "somit:mood:share";

/** 이모지는 기분을 고르는 입력 수단이라 남긴다. 장식용 이모지는 쓰지 않는다. */
export const MOODS = [
  { score: 5, emoji: "😄", label: "좋아요" },
  { score: 4, emoji: "🙂", label: "괜찮아요" },
  { score: 3, emoji: "😐", label: "그저 그래요" },
  { score: 2, emoji: "😔", label: "힘들어요" },
  { score: 1, emoji: "😢", label: "많이 힘들어요" },
];

/** 5문항 간단 체크. 길면 매일 하지 않는다. */
export const CHECKS = [
  { id: "sleep", text: "잘 잤어요" },
  { id: "appetite", text: "밥을 잘 먹었어요" },
  { id: "focus", text: "할 일에 집중이 됐어요" },
  { id: "people", text: "누군가와 편하게 이야기했어요" },
  { id: "worth", text: "나 자신이 괜찮게 느껴졌어요" },
];

export type MoodEntry = {
  date: string;
  score: number;
  note: string;
  /** 체크한 항목 id 목록. 개수가 적을수록 힘든 하루로 본다. */
  checks: string[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type ViewMonth = { y: number; m: number };

type MonthCell = { date: string; day: number; entry: MoodEntry | null } | null;

function toDateKey(y: number, m: number, day: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthGrid(viewMonth: ViewMonth, entries: MoodEntry[]): MonthCell[] {
  const { y, m } = viewMonth;
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const cells: MonthCell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toDateKey(y, m, day);
    cells.push({ date, day, entry: byDate.get(date) ?? null });
  }
  return cells;
}

function todayKey() {
  const d = new Date();
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function MoodPage() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function selectDate(date: string) {
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  useEffect(() => {
    const loaded = readJSON<MoodEntry[]>(KEY, []);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setEntries(loaded);
    setShare(readJSON<boolean>(SHARE_KEY, false));
    const today = loaded.find((e) => e.date === todayKey());
    if (today) {
      setScore(today.score);
      setNote(today.note);
      setChecks(today.checks ?? []);
    }

    apiFetch("/api/mood/entries")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data: { shareEnabled: boolean; entries: MoodEntry[] } | null) => {
        if (!data) return;
        setShare(data.shareEnabled);
        writeJSON(SHARE_KEY, data.shareEnabled);

        const missing = loaded.filter((e) => !data.entries.some((s) => s.date === e.date));
        await Promise.all(
          missing.map((e) =>
            apiFetch(`/api/mood/entries/${e.date}`, {
              method: "PUT",
              body: JSON.stringify({ score: e.score, note: e.note, checks: e.checks }),
            }).catch(() => {})
          )
        );

        const merged = [...data.entries, ...missing].sort((a, b) => (a.date < b.date ? 1 : -1));
        setEntries(merged);
        writeJSON(KEY, merged);
        const todayMerged = merged.find((e) => e.date === todayKey());
        if (todayMerged) {
          setScore(todayMerged.score);
          setNote(todayMerged.note);
          setChecks(todayMerged.checks ?? []);
        }
      })
      .catch(() => {});
  }, []);

  function toggleCheck(id: string) {
    setChecks((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function save() {
    if (score === null) return;
    const entry: MoodEntry = { date: todayKey(), score, note: note.trim(), checks };
    const next = [entry, ...entries.filter((e) => e.date !== entry.date)].slice(0, 90);
    setEntries(next);
    writeJSON(KEY, next);
    apiFetch(`/api/mood/entries/${entry.date}`, {
      method: "PUT",
      body: JSON.stringify({ score: entry.score, note: entry.note, checks: entry.checks }),
    }).catch(() => {});
    const today = new Date();
    setViewMonth({ y: today.getFullYear(), m: today.getMonth() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleShare(value: boolean) {
    setShare(value);
    writeJSON(SHARE_KEY, value);
    apiFetch("/api/mood/share", {
      method: "PATCH",
      body: JSON.stringify({ enabled: value }),
    }).catch(() => {});
  }

  const monthGrid = useMemo(() => buildMonthGrid(viewMonth, entries), [viewMonth, entries]);
  const average = useMemo(() => {
    const scores = monthGrid.filter((c): c is NonNullable<MonthCell> => c !== null && c.entry !== null).map((c) => c.entry!.score);
    return scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
  }, [monthGrid]);

  function shiftMonth(delta: number) {
    setViewMonth(({ y, m }) => {
      const total = y * 12 + m + delta;
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });
  }

  // 하루의 저조함은 정상이지만 사흘 이상 이어지면 혼자 두지 않는 편이 낫다.
  const lowStreak = useMemo(() => {
    let n = 0;
    for (const e of entries) {
      if (e.score <= 2) n += 1;
      else break;
    }
    return n;
  }, [entries]);

  const showCrisis = detectCrisis(note) || lowStreak >= 3;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <h1 className="font-extrabold text-text">오늘 마음은 어때요?</h1>
        <p className="mb-4 mt-1 text-[13px] text-text-muted">하루 한 번, 10초면 충분해요.</p>

        <div className="flex justify-between gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.score}
              onClick={() => setScore(m.score)}
              aria-pressed={score === m.score}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border-2 py-3 transition-colors ${
                score === m.score ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-[10px] font-bold text-text-muted">{m.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[13px] font-bold text-text">오늘 해당하는 것을 골라주세요</div>
          <div className="flex flex-col gap-1.5">
            {CHECKS.map((c) => {
              const on = checks.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCheck(c.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] transition-colors ${
                    on ? "border-primary-dark bg-primary-light font-bold text-text" : "border-border text-text-muted"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] ${
                      on ? "border-primary-dark bg-primary-dark text-white" : "border-border"
                    }`}
                    aria-hidden
                  >
                    {on ? "✓" : ""}
                  </span>
                  {c.text}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="오늘 한 줄 (선택)"
          className="mt-4 w-full resize-none rounded-xl border border-border bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-text outline-none focus:border-primary"
        />

        <button
          onClick={save}
          disabled={score === null}
          className="mt-3 w-full rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-40"
        >
          {saved ? "저장됐어요" : "오늘 기분 기록하기"}
        </button>
      </Card>

      {showCrisis && <CrisisNotice />}

      {entries.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} aria-label="이전 달" className="px-1 text-lg text-text-muted">
              ‹
            </button>
            <h2 className="font-extrabold text-text">
              {viewMonth.y}년 {viewMonth.m + 1}월
            </h2>
            <button onClick={() => shiftMonth(1)} aria-label="다음 달" className="px-1 text-lg text-text-muted">
              ›
            </button>
            {average !== null && (
              <span className="ml-auto text-xs text-text-muted">평균 {average.toFixed(1)} / 5</span>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-bold text-text-faint">
                {w}
              </div>
            ))}
            {monthGrid.map((cell, i) => {
              if (cell === null) return <div key={`empty-${i}`} />;
              const mood = cell.entry ? MOODS.find((m) => m.score === cell.entry!.score) : null;
              const isToday = cell.date === todayKey();
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => cell.entry && selectDate(cell.date)}
                  disabled={!cell.entry}
                  aria-pressed={selectedDate === cell.date}
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors ${
                    isToday ? "border-2 border-primary-dark" : "border border-transparent"
                  } ${
                    selectedDate === cell.date ? "bg-primary-light" : ""
                  } ${cell.entry ? "cursor-pointer hover:bg-primary-light" : "cursor-default"}`}
                >
                  <span>{mood ? mood.emoji : <span className="text-text-faint">·</span>}</span>
                  <span className="text-[9px] text-text-faint">{cell.day}</span>
                </button>
              );
            })}
          </div>

          {selectedDate && (() => {
            const selectedCell = monthGrid.find((c) => c && c.date === selectedDate && c.entry);
            if (!selectedCell || !selectedCell.entry) return null;
            const entry = selectedCell.entry;
            const mood = MOODS.find((m) => m.score === entry.score);
            if (!mood) return null;
            return (
              <div className="mt-4 rounded-xl border border-border bg-bg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{mood.emoji}</span>
                  <span className="text-sm font-bold text-text">
                    {selectedDate} · {mood.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {CHECKS.map((c) => {
                    const on = entry.checks.includes(c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-[12px]">
                        <span className={on ? "text-primary-dark" : "text-text-faint"}>{on ? "✓" : "○"}</span>
                        <span className={on ? "text-text" : "text-text-faint"}>{c.text}</span>
                      </div>
                    );
                  })}
                </div>
                {entry.note && <p className="mt-2 text-[13px] leading-relaxed text-text-2">{entry.note}</p>}
              </div>
            );
          })()}

          {/*
            기분 기록은 사용자가 혼자 쓰는 일기에 가깝다.
            상담사가 당연히 본다고 여기면 솔직하게 쓰지 않게 되므로 반드시 따로 동의를 받는다.
          */}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg px-4 py-3">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => toggleShare(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#0F6E56]"
            />
            <span className="text-[13px] leading-relaxed text-text-2">
              상담을 시작할 때 최근 2주 기분 기록을 상담사에게 보여줄게요
              <span className="mt-0.5 block text-[11px] text-text-faint">
                언제든 해제할 수 있어요. 한 줄 메모까지 함께 전달됩니다.
              </span>
            </span>
          </label>
        </Card>
      )}
    </div>
  );
}

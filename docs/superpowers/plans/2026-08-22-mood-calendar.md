# 기분 기록 월간 달력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mood` 페이지의 "최근 흐름" 막대그래프를 월간 달력(날짜별 기분 이모지 + 클릭 시 상세) 형태로 교체한다.

**Architecture:** `app/(shell)/mood/page.tsx` 한 파일 내에서 기존 `recent`(최근 14일) 로직을 월 단위 그리드 계산으로 교체하고, 날짜 선택 state를 추가해 상세 카드를 조건부 렌더링한다. 새 파일/컴포넌트/의존성 없음.

**Tech Stack:** Next.js App Router, React 19 (useState/useMemo), Tailwind CSS v4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-22-mood-calendar-and-settings-design.md` (섹션 A)

## Global Constraints

- 이 프로젝트에는 프론트엔드 테스트 러너가 없다(서버만 `server/`에서 `node --test`). 각 태스크는 "테스트 작성" 대신 브라우저에서 실제로 재현/확인하는 단계로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: `npx tsc --noEmit`, `npx eslint .`, `npm run build`
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 백엔드/새 npm 의존성 변경 없음.

---

## Task 1: 막대그래프를 월간 달력 그리드로 교체 (월 이동 + 월 평균 포함)

**Files:**
- Modify: `app/(shell)/mood/page.tsx`

**Interfaces:**
- Produces: `WEEKDAYS: string[]`, `type MonthCell = { date: string; day: number; entry: MoodEntry | null } | null`, `buildMonthGrid(viewMonth: { y: number; m: number }, entries: MoodEntry[]): MonthCell[]`, `viewMonth` state, `monthGrid: MonthCell[]`, `average: number | null`(기존 변수명 유지, 계산 범위만 전체 평균 → 월 평균으로 변경). Task 2가 `monthGrid`와 `MonthCell`을 그대로 소비한다.

- [ ] **Step 1: 브라우저에서 현재 동작 확인 (베이스라인)**

```bash
npm run dev
```

`http://localhost:3000/mood`에서 개발자도구 콘솔에 아래를 붙여넣어 여러 날짜의 기록을 만든 뒤 새로고침한다:

```js
const KEY = "somit:mood";
const entries = [
  { date: "2026-08-01", score: 2, note: "피곤한 하루", checks: ["sleep"] },
  { date: "2026-08-03", score: 5, note: "", checks: ["sleep", "appetite", "focus", "people", "worth"] },
  { date: "2026-08-10", score: 4, note: "", checks: ["sleep", "focus"] },
  { date: "2026-08-15", score: 1, note: "많이 힘들었다", checks: [] },
  { date: "2026-08-20", score: 3, note: "", checks: ["people"] },
];
localStorage.setItem(KEY, JSON.stringify(entries));
location.reload();
```

기존 막대그래프가 최근 14일치만 좁은 막대로 보여주는 것을 확인한다(이후 이 로컬스토리지 데이터를 계속 재사용한다).

- [ ] **Step 2: 달력 계산 로직 + 그리드 렌더링으로 교체**

`app/(shell)/mood/page.tsx`에서 `MoodEntry` 타입 선언(30~36번 줄) 바로 아래에 다음을 추가한다:

```tsx
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
```

`MoodPage` 함수 내부, `const [saved, setSaved] = useState(false);` 다음 줄에 상태를 추가한다:

```tsx
const [viewMonth, setViewMonth] = useState<ViewMonth>(() => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
});
```

`const recent = useMemo(...)` 블록(82번 줄)과 `const average = useMemo(...)` 블록(83~86번 줄)을 둘 다 삭제하고 그 자리에 다음을 추가한다(`average`라는 변수명은 그대로 유지하되, 계산 범위를 전체 entries에서 현재 보고 있는 달로 바꾼다):

```tsx
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
```

JSX에서 `{recent.length > 0 && (` 로 시작하는 카드 블록(171번 줄)의 조건을 `{entries.length > 0 && (`로 바꾸고, 그 안의 다음 블록을:

```tsx
<div className="mb-3 flex items-center gap-2">
  <h2 className="font-extrabold text-text">최근 흐름</h2>
  {average !== null && (
    <span className="ml-auto text-xs text-text-muted">평균 {average.toFixed(1)} / 5</span>
  )}
</div>
<div className="flex h-28 gap-1.5">
  {recent.map((e) => (
    <div key={e.date} className="flex h-full flex-1 flex-col items-center gap-1">
      <div className="flex w-full flex-1 items-end">
        <div
          className="w-full rounded-t-md bg-primary-dark"
          style={{ height: `${(e.score / 5) * 100}%`, opacity: 0.35 + e.score * 0.13 }}
          title={`${e.date}: ${e.score}점`}
        />
      </div>
      <span className="text-[9px] text-text-faint">{e.date.slice(8)}</span>
    </div>
  ))}
</div>
```

다음으로 교체한다:

```tsx
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
      <div
        key={cell.date}
        className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${
          isToday ? "border-2 border-primary-dark" : "border border-transparent"
        }`}
      >
        <span>{mood ? mood.emoji : "·"}</span>
        <span className="text-[9px] text-text-faint">{cell.day}</span>
      </div>
    );
  })}
</div>
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음. (`average`, `recent` 미사용 변수가 남아있다면 컴파일은 통과하지만 다음 단계 lint에서 걸린다 — 지웠는지 다시 확인)

- [ ] **Step 4: 브라우저에서 확인**

`http://localhost:3000/mood`를 새로고침한다. Step 1에서 넣은 5개 날짜(8/1, 8/3, 8/10, 8/15, 8/20)에 해당 점수의 이모지가 뜨는지, 나머지 날짜는 `·`로 비어있는지, 오늘 날짜 칸에 테두리가 있는지, `‹`/`›`로 이전/다음 달 이동이 되는지(이동해도 이모지 위치가 요일에 맞게 정렬되는지), 상단 평균이 8월 데이터만 반영해 `3.0`(2,5,4,1,3의 평균)으로 뜨는지 확인한다.

- [ ] **Step 5: 린트**

```bash
npx eslint "app/(shell)/mood/page.tsx"
```

Expected: 에러 없음(미사용 변수 없음).

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/mood/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 기분 기록 최근 흐름을 막대그래프에서 월간 달력으로 교체

막대그래프는 최근 14일치를 색 농도로만 구분해 가시성이 낮았다.
날짜별 기분 이모지를 보여주는 월간 달력으로 바꾸고, 평균 배지도
전체 평균에서 현재 보고 있는 달의 평균으로 변경.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 날짜 클릭 시 상세 카드 표시

**Files:**
- Modify: `app/(shell)/mood/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `monthGrid: MonthCell[]`, `MonthCell` 타입, `entries: MoodEntry[]`, `MOODS`, `CHECKS`.
- 이 태스크 이후 외부에 노출되는 새 인터페이스는 없음(페이지 내부 UI 동작).

- [ ] **Step 1: 선택 state 추가**

`viewMonth` state 바로 아래에 추가한다:

```tsx
const [selectedDate, setSelectedDate] = useState<string | null>(null);

function selectDate(date: string) {
  setSelectedDate((prev) => (prev === date ? null : date));
}
```

- [ ] **Step 2: 달력 칸을 클릭 가능하게 변경**

Task 1에서 만든 `monthGrid.map` 블록의 날짜 `<div>`를 `<button>`으로 바꾼다:

```tsx
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
```

- [ ] **Step 3: 선택된 날짜의 상세 카드 추가**

달력 그리드 `<div className="grid grid-cols-7 gap-1">...</div>` 블록 바로 다음(같은 카드 안, "기분을 상담사에게 보여줄게요" 동의 체크박스 `<label>` 앞)에 추가한다:

```tsx
{selectedDate && (() => {
  const entry = entries.find((e) => e.date === selectedDate);
  if (!entry) return null;
  const mood = MOODS.find((m) => m.score === entry.score)!;
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
```

- [ ] **Step 4: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/mood/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 5: 브라우저에서 확인**

`http://localhost:3000/mood`를 새로고침하고 Task 1에서 넣어둔 날짜(예: 8/15, 점수 1, 메모 "많이 힘들었다") 중 하나를 클릭한다. 상세 카드가 펼쳐져서 이모지+라벨, 체크리스트(8/15는 전부 ○), 메모가 보이는지 확인한다. 같은 날짜를 다시 클릭하면 접히는지, 다른 날짜(예: 8/3, 체크 5개 전부 ✓)를 클릭하면 내용이 바뀌는지, 기록 없는 날짜(예: 8/5)는 클릭해도 아무 반응이 없는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/mood/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 기분 달력에서 날짜 클릭 시 그날의 메모/체크리스트 표시

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~2가 모두 커밋된 상태의 `main` 브랜치.

- [ ] **Step 1: 전체 빌드 재확인**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 2: main 푸시**

```bash
git push origin main
```

- [ ] **Step 3: 배포 상태 확인**

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<위에서 나온 커밋 해시>/status"
```

Expected: Vercel + Railway 모두 `"state": "success"`.

- [ ] **Step 4: 프로덕션에서 수동 확인**

`https://create-club.vercel.app/mood`에서 기분을 기록하고, "최근 흐름" 카드에 오늘 날짜의 이모지가 달력에 찍히는지, 이전 달로 이동해도 정상 표시되는지 확인한다.

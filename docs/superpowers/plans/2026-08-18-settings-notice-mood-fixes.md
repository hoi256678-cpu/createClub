# 설정/공지사항/기분기록 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면 토글 위치 버그, 백엔드 연결상태 표시, 공지사항 미클릭, 기분 기록 차트 미표시 — 4개의 독립적인 프론트엔드 버그를 수정한다.

**Architecture:** Next.js App Router 프론트엔드(`create-club`)의 기존 페이지/컴포넌트를 직접 수정. 새 라우트 하나(`/community/notice/[id]`)만 추가. 백엔드(`server/`) 변경 없음, 새 npm 의존성 없음.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.

## Global Constraints

- 이 프로젝트에는 프론트엔드 테스트 러너가 없다(서버만 `node --test`가 있음). 각 태스크는 "테스트 작성" 대신 브라우저에서 실제로 재현/확인하는 단계로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: `npx tsc --noEmit`, `npx eslint .`, `npm run build`
- 커밋은 브랜치 없이 `main`에 직접 한다(이 프로젝트의 기존 워크플로우).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 설계 문서: `docs/superpowers/specs/2026-08-18-settings-notice-mood-fixes-design.md`

---

## Task 1: 설정 토글 버튼 위치 버그 수정

**Files:**
- Modify: `app/(shell)/settings/page.tsx:10-27` (`ToggleRow` 컴포넌트)

**Interfaces:**
- 이 태스크는 다른 태스크와 독립적이다. `ToggleRow`의 외부 시그니처(`{ label, defaultOn }` props)는 변경하지 않는다.

- [ ] **Step 1: 브라우저에서 버그 재현 확인**

로컬 개발 서버를 띄운다:

```bash
npm run dev
```

브라우저를 390px 폭(모바일)으로 좁혀서 `http://localhost:3000/settings`에 접속해 토글 버튼들을 확인한다. 흰 원(thumb)이 파란 트랙 오른쪽 바깥으로 벗어나 떠 있는 것을 확인한다(현재 프로덕션에서도 동일하게 재현됨).

- [ ] **Step 2: `ToggleRow`의 thumb에 `left-0.5` 추가**

`app/(shell)/settings/page.tsx`의 `ToggleRow` 함수를 다음과 같이 수정한다:

```tsx
function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
```

변경점: `<span>`에 `left-0.5` 추가, 꺼짐 상태의 이동값을 `translate-x-0.5` → `translate-x-0`으로 변경(이제 `left-0.5`가 2px 기준 위치를 담당하므로 이동값은 0).

- [ ] **Step 3: 브라우저에서 수정 확인**

같은 390px 폭 화면에서 `http://localhost:3000/settings`를 새로고침하고 토글 4개를 각각 클릭해본다. thumb이 항상 트랙 안(왼쪽 2px ~ 오른쪽 2px)에서만 움직이는지 확인한다. 넓은 화면(1200px 이상)에서도 동일하게 확인한다.

- [ ] **Step 4: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint app/\(shell\)/settings/page.tsx
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/settings/page.tsx"
git commit -m "$(cat <<'EOF'
fix: 설정 토글 버튼 thumb이 트랙 밖으로 벗어나는 버그 수정

left가 미지정이라 static position이 화면 폭에 따라 다르게 계산되어
좁은 화면에서 thumb이 트랙 오른쪽 밖에 렌더링되던 문제.
left-0.5를 명시해 기준 위치를 고정.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 연결 상태 표시 제거

**Files:**
- Modify: `app/(shell)/settings/page.tsx:1-9` (import), `:71-80` (앱 정보 섹션)
- Delete: `app/components/SystemStatus.tsx` (다른 곳에서 참조되지 않음 — Task 1에서 이미 확인됨)

**Interfaces:**
- Task 1 이후의 `app/(shell)/settings/page.tsx` 상태를 기반으로 작업한다.

- [ ] **Step 1: import 및 "백엔드 연결 상태" 행 제거**

`app/(shell)/settings/page.tsx` 상단 import에서 `SystemStatus` 제거:

```tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import CrisisNotice from "@/app/components/CrisisNotice";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { apiFetch } from "@/lib/api";
```

"앱 정보" `SectionCard` 안에서 "백엔드 연결 상태" 행을 제거하고 "버전" 행만 남긴다:

```tsx
<SectionCard title="앱 정보">
  <div className="flex items-center gap-3 px-5 py-3">
    <span className="flex-1 text-sm font-semibold text-text">버전</span>
    <span className="text-xs text-text-muted">1.0.0 (Web)</span>
  </div>
</SectionCard>
```

(기존에 "버전" 행에 있던 `border-b border-border`는 이제 이 섹션의 마지막 행이므로 제거한다 — `SectionCard`의 다른 곳처럼 `last:border-0` 패턴을 안 쓰고 있었으므로 직접 제거)

- [ ] **Step 2: `SystemStatus.tsx` 삭제**

```bash
git rm app/components/SystemStatus.tsx
```

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint app/\(shell\)/settings/page.tsx
npm run build
```

Expected: 에러 없음. 빌드가 되면 `SystemStatus` 삭제로 인한 깨진 참조가 없다는 뜻이다.

- [ ] **Step 4: 브라우저에서 확인**

`http://localhost:3000/settings`에서 "앱 정보" 섹션에 "백엔드 연결 상태" 행이 더 이상 없는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/settings/page.tsx"
git rm app/components/SystemStatus.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
chore: 설정 화면에서 백엔드 연결 상태 표시 제거

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 공지사항 상세 페이지 추가

**Files:**
- Modify: `app/(shell)/community/mock.ts` (`NOTICE_POSTS`에 `body` 필드 추가)
- Create: `app/(shell)/community/notice/[id]/page.tsx`
- Modify: `app/(shell)/community/page.tsx:112-121` (공지사항 탭), `:186-195` (사이드바 카드)

**Interfaces:**
- Produces: `NOTICE_POSTS: { id: string; title: string; time: string; body: string }[]` — `body` 필드가 새로 추가된 배열. `app/(shell)/community/notice/[id]/page.tsx`와 `app/(shell)/community/page.tsx` 양쪽이 이 타입을 그대로 소비한다.

- [ ] **Step 1: `NOTICE_POSTS`에 `body` 필드 추가**

`app/(shell)/community/mock.ts`의 `NOTICE_POSTS`를 다음과 같이 수정한다:

```ts
export const NOTICE_POSTS = [
  {
    id: "n1",
    title: "솜잇 서비스 이용 안내",
    time: "2024.03.01",
    body: "솜잇을 이용해주셔서 감사합니다. 솜잇은 또래 상담사와 1:1로 이야기를 나눌 수 있는 상담 플랫폼입니다. 서비스 이용 중 궁금한 점이 있으면 언제든 문의해주세요.",
  },
  {
    id: "n2",
    title: "2024년 상담사 모집 안내",
    time: "2024.02.15",
    body: "솜잇과 함께할 또래 상담사를 모집합니다. 상담 관련 전공 대학생이라면 누구나 지원할 수 있습니다. 자세한 지원 방법은 추후 공지를 통해 안내드리겠습니다.",
  },
  {
    id: "n3",
    title: "개인정보처리방침 업데이트 안내",
    time: "2024.01.20",
    body: "개인정보처리방침이 일부 업데이트되었습니다. 변경된 내용은 개인정보 수집 항목 및 이용 목적에 관한 조항입니다. 자세한 내용은 정책 전문을 확인해주세요.",
  },
];
```

(실제 문구는 추후 직접 교체 가능 — 지금은 자리 채우기용 짧은 샘플)

- [ ] **Step 2: 공지사항 상세 페이지 생성**

`app/(shell)/community/notice/[id]/page.tsx` 파일을 새로 만든다:

```tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { NOTICE_POSTS } from "../../mock";

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const notice = NOTICE_POSTS.find((n) => n.id === params.id);

  if (!notice) {
    return (
      <div className="py-16 text-center text-sm text-text-faint">
        공지를 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/community" className="font-bold text-primary-dark">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <div className="text-sm font-bold text-primary-dark">공지</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{notice.time}</div>
        <p className="mt-4 text-sm leading-relaxed text-text-2">{notice.body}</p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 공지사항 탭 목록을 클릭 가능하게 변경**

`app/(shell)/community/page.tsx` 상단 import에 `Link`가 이미 있는지 확인한다(이미 3번째 줄에 `import Link from "next/link";`가 있으므로 추가 import 불필요).

`tab === "notice"` 블록(112~121번 줄)을 다음과 같이 수정한다:

```tsx
{tab === "notice" ? (
  <div className="flex flex-col gap-2">
    {NOTICE_POSTS.map((n) => (
      <Link key={n.id} href={`/community/notice/${n.id}`}>
        <Card className="cursor-pointer transition-shadow hover:shadow-card">
          <div className="text-sm font-bold text-primary-dark">공지</div>
          <div className="mt-1 font-bold text-text">{n.title}</div>
          <div className="mt-1 text-xs text-text-faint">{n.time}</div>
        </Card>
      </Link>
    ))}
  </div>
) : loading ? (
```

- [ ] **Step 4: 사이드바 공지사항 카드도 클릭 가능하게 변경**

같은 파일의 사이드바 `<Card>` 블록(186~195번 줄)을 다음과 같이 수정한다:

```tsx
<Card>
  <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
  <div className="flex flex-col divide-y divide-border">
    {NOTICE_POSTS.map((n) => (
      <Link
        key={n.id}
        href={`/community/notice/${n.id}`}
        className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
      >
        {n.title}
      </Link>
    ))}
  </div>
</Card>
```

- [ ] **Step 5: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint app/\(shell\)/community/
```

Expected: 에러 없음.

- [ ] **Step 6: 브라우저에서 확인**

`http://localhost:3000/community`에서 "공지사항" 탭을 클릭하고, 공지 하나를 클릭해 상세 페이지(`/community/notice/n1` 등)로 이동하는지, 본문이 보이는지 확인한다. 홈이 아닌 사이드바의 "📋 공지사항" 카드에서도 동일하게 클릭해 확인한다. 존재하지 않는 id(`/community/notice/xxx`)로 직접 접속했을 때 "공지를 찾을 수 없어요"가 뜨는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add "app/(shell)/community/mock.ts" "app/(shell)/community/notice" "app/(shell)/community/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 공지사항 클릭 시 상세 내용을 볼 수 있게 추가

NOTICE_POSTS에 본문(body) 필드를 추가하고 /community/notice/[id]
상세 페이지를 만들어 공지사항 탭/사이드바 카드에서 클릭 가능하게 연결.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 기분 기록 "최근 흐름" 차트 렌더링 버그 수정

**Files:**
- Modify: `app/(shell)/mood/page.tsx:179-190` (막대그래프 부분)

**Interfaces:**
- 이 태스크는 다른 태스크와 독립적이다.

- [ ] **Step 1: 브라우저에서 버그 재현 확인**

`http://localhost:3000/mood`에 접속해 기분을 하나 선택하고 "오늘 기분 기록하기"를 누른다. "최근 흐름" 카드가 나타나지만 막대그래프 영역이 비어있고 날짜 숫자만 보이는 것을 확인한다.

- [ ] **Step 2: 막대그래프 컨테이너 수정**

`app/(shell)/mood/page.tsx`에서 다음 블록(현재 179~190번 줄)을:

```tsx
<div className="flex h-28 items-end gap-1.5">
  {recent.map((e) => (
    <div key={e.date} className="flex flex-1 flex-col items-center gap-1">
      <div
        className="w-full rounded-t-md bg-primary-dark"
        style={{ height: `${(e.score / 5) * 100}%`, opacity: 0.35 + e.score * 0.13 }}
        title={`${e.date}: ${e.score}점`}
      />
      <span className="text-[9px] text-text-faint">{e.date.slice(8)}</span>
    </div>
  ))}
</div>
```

다음과 같이 수정한다:

```tsx
<div className="flex h-28 gap-1.5">
  {recent.map((e) => (
    <div key={e.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
      <div
        className="w-full rounded-t-md bg-primary-dark"
        style={{ height: `${(e.score / 5) * 100}%`, opacity: 0.35 + e.score * 0.13 }}
        title={`${e.date}: ${e.score}점`}
      />
      <span className="text-[9px] text-text-faint">{e.date.slice(8)}</span>
    </div>
  ))}
</div>
```

변경점: 바깥 컨테이너에서 `items-end` 제거(기본값 `items-stretch`가 되어 각 wrapper가 컨테이너 높이 112px로 늘어남), 각 wrapper에 `h-full`과 `justify-end` 추가(막대의 퍼센트 높이가 이제 112px 기준으로 계산되고, 막대+라벨이 바닥에 붙어 기존과 동일하게 보임).

- [ ] **Step 3: 브라우저에서 수정 확인**

`http://localhost:3000/mood`를 새로고침하고 다시 기분을 기록한다. "최근 흐름" 카드에 실제 파란 막대가 보이는지, 점수가 높을수록 막대가 길고 진하게 보이는지 확인한다. 며칠치 데이터가 있다고 가정하기 어려우니, 브라우저 devtools console에서 아래 스크립트로 로컬스토리지에 여러 날짜의 기록을 임시로 채워넣고 새로고침해서도 확인한다(확인 후 다시 지워도 됨):

```js
const KEY = "somit:mood";
const entries = [
  { date: "2026-08-14", score: 2, note: "", checks: [] },
  { date: "2026-08-15", score: 3, note: "", checks: [] },
  { date: "2026-08-16", score: 5, note: "", checks: [] },
  { date: "2026-08-17", score: 4, note: "", checks: [] },
];
localStorage.setItem(KEY, JSON.stringify(entries));
location.reload();
```

- [ ] **Step 4: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint app/\(shell\)/mood/page.tsx
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/mood/page.tsx"
git commit -m "$(cat <<'EOF'
fix: 기분 기록 최근 흐름 막대그래프가 안 보이던 버그 수정

부모 컨테이너가 items-end라 막대 wrapper의 높이가 auto로 무너져
퍼센트 높이(height: N%) 막대가 0px로 계산되던 문제.
컨테이너를 items-stretch(기본값)로 바꾸고 wrapper에 h-full +
justify-end를 적용해 퍼센트 높이 기준을 명확히 함.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~4가 모두 커밋된 상태의 `main` 브랜치.

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
```

위에서 나온 커밋 해시로:

```bash
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<커밋해시>/status"
```

Expected: Vercel(create-club, create-club-5kro) + Railway 모두 `"state": "success"`.

- [ ] **Step 4: 프로덕션에서 수동 확인**

`https://create-club.vercel.app`에서:
- `/settings`: 넓은 화면 + 좁은 화면(390px) 양쪽에서 토글 클릭 시 thumb이 트랙 안에서만 움직이는지, "백엔드 연결 상태" 행이 없는지
- `/community` → 공지사항 탭 → 공지 클릭 → 상세 페이지 본문 확인
- `/mood` → 기분 기록 후 "최근 흐름" 막대가 실제로 보이는지

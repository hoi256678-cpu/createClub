# 앱 셸 & 내비게이션 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 정적 HTML 목업(데스크탑 사이드바형, 모바일 하단탭형)을 참고해, 반응형 앱 셸과 내비게이션 가능한 화면 뼈대(홈/커뮤니티/채팅/심리검사/마이페이지/알림/설정 + 재디자인된 로그인/회원가입)를 실제 Next.js 앱으로 만든다.

**Architecture:** `app/(shell)/` 라우트 그룹이 `AppShell`(데스크탑=사이드바+상단바, 모바일=하단탭바, 900px 브레이크포인트) 안에 홈/커뮤니티/채팅/심리검사/마이페이지/알림/설정 페이지를 렌더링한다. 인증(회원가입/로그인)을 제외한 모든 페이지는 하드코딩된 더미 데이터(`mock.ts`)로 렌더링한다. 로그인 상태는 기존 `GET /api/auth/me` 패턴을 공유 훅(`useAuthStatus`)으로 추출해 `AppShell`과 보호 라우트가 함께 쓴다.

**Tech Stack:** Next.js 16 (App Router) / React 19 / Tailwind v4 / TypeScript. 새 런타임 의존성 추가 없음(`next/font/local`은 Next.js 내장 기능).

## Global Constraints

- 반응형 브레이크포인트는 `900px`. Tailwind v4 커스텀 브레이크포인트 `shell:` variant로 구현한다(`@theme` 안에 `--breakpoint-shell: 900px`).
- 색상/폰트/라운드/그림자 토큰은 목업의 CSS 변수 값을 그대로 가져와 `app/globals.css`의 `@theme inline`에 이식한다. 기존 `--ink`/`--ink-2`/`--line`/`--paper`/`--muted`/`--accent`/`--accent-2` 다크·오렌지 톤은 제거하고 교체한다.
- SUIT 폰트는 `next/font/local`로 자체 호스팅한다. 파일은 `public/fonts/SUIT-{Regular,Medium,SemiBold,Bold,ExtraBold,Heavy}.woff2` (가중치 400/500/600/700/800/900), 출처는 `https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/`.
- 인증이 필요한 화면(`/chat`, `/chat/[id]`, `/mypage`, `/notifications`)은 `RequireAuth` 컴포넌트로 감싸 비로그인 시 `/login`으로 보낸다.
- 커뮤니티/채팅/심리검사/알림 데이터는 전부 더미(하드코딩)다. 백엔드 연동은 이번 스코프 밖.
- 자동 테스트는 추가하지 않는다. 각 태스크의 기계적 검증은 `npm run lint`로, 시각적 검증은 `npm run dev`로 해당 라우트를 직접 열어 확인한다. 기존 백엔드 auth 테스트(`server`, 18/18)는 이번 작업으로 건드리지 않으므로 재실행하지 않아도 되지만, 마지막 태스크에서 회귀 확인 삼아 한 번 돌린다.
- Tailwind 클래스의 spacing 값은 기본 스케일(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24 ...)만 사용한다. 4 초과 구간에서 `.5` 단위(예: `px-4.5`)는 기본 스케일에 없으므로 쓰지 않는다.
- `lib/api.ts`의 `apiFetch`, 기존 `/api/auth/{signup,login,logout,me}` 백엔드 라우트는 이번 작업에서 수정하지 않는다.

---

## Task 1: 디자인 토큰 & SUIT 폰트

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `public/fonts/SUIT-Regular.woff2`, `public/fonts/SUIT-Medium.woff2`, `public/fonts/SUIT-SemiBold.woff2`, `public/fonts/SUIT-Bold.woff2`, `public/fonts/SUIT-ExtraBold.woff2`, `public/fonts/SUIT-Heavy.woff2`

**Interfaces:**
- Produces: Tailwind 유틸리티로 쓸 색상 토큰(`bg-bg`, `bg-surface`, `border-border`, `text-text`, `text-text-2`, `text-text-muted`, `text-text-faint`, `bg-primary`, `bg-primary-dark`, `bg-primary-darker`, `bg-primary-light`, `bg-primary-xlight`, `text-danger`, `text-success` 등 색상 계열 전부), `shadow-card`/`shadow-card-md` 유틸리티, `shell:` 반응형 variant(900px 이상), 기본 폰트로 적용된 SUIT.

- [ ] **Step 1: SUIT 폰트 파일 내려받기**

프로젝트 루트에서 실행(이미 `https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT-Regular.woff2` 가 200 OK로 응답하는 것을 확인했다):

```bash
mkdir -p public/fonts
for w in Regular Medium SemiBold Bold ExtraBold Heavy; do
  curl -sfL "https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT-$w.woff2" -o "public/fonts/SUIT-$w.woff2"
done
ls -la public/fonts
```

Expected: `public/fonts` 안에 6개 `.woff2` 파일이 생기고, 각 파일 크기가 0바이트가 아니어야 한다(`ls -la`로 확인). 하나라도 0바이트거나 curl이 실패하면 해당 weight의 URL을 다시 확인한다(브라우저로 `https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT.css` 를 열어 정확한 파일명을 재확인).

- [ ] **Step 2: `app/globals.css`를 새 디자인 토큰으로 전체 교체**

```css
@import "tailwindcss";

:root {
  --bg: #f6f8fb;
  --surface: #ffffff;
  --border: #e8edf4;
  --primary: #9eb9e6;
  --primary-dark: #7a9cc5;
  --primary-darker: #5a7ca8;
  --primary-light: #eef5fd;
  --primary-xlight: #f5f9ff;
  --text: #1a2540;
  --text-2: #2d3a52;
  --text-muted: #7a8ba8;
  --text-faint: #b0bccf;
  --danger: #e05252;
  --success: #3db8a0;
  --shadow-card-value: 0 2px 16px rgba(60, 90, 140, 0.08);
  --shadow-card-md-value: 0 4px 32px rgba(60, 90, 140, 0.13);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-dark: var(--primary-dark);
  --color-primary-darker: var(--primary-darker);
  --color-primary-light: var(--primary-light);
  --color-primary-xlight: var(--primary-xlight);
  --color-text: var(--text);
  --color-text-2: var(--text-2);
  --color-text-muted: var(--text-muted);
  --color-text-faint: var(--text-faint);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --shadow-card: var(--shadow-card-value);
  --shadow-card-md: var(--shadow-card-md-value);
  --breakpoint-shell: 900px;
  --font-sans: var(--font-suit);
  --font-display: var(--font-suit);
}

body {
  background: var(--bg);
  color: var(--text-2);
}
```

(기존 `.cursor-blink`/`.status-dot` 애니메이션과 그 keyframes는 삭제한다 — Task 3에서 이 클래스들을 쓰던 기존 홈 랜딩 페이지가 완전히 대체된다.)

- [ ] **Step 3: `app/layout.tsx`를 SUIT 로컬 폰트로 교체**

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const suit = localFont({
  src: [
    { path: "../public/fonts/SUIT-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/SUIT-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/SUIT-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/SUIT-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/SUIT-ExtraBold.woff2", weight: "800", style: "normal" },
    { path: "../public/fonts/SUIT-Heavy.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-suit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "솜잇",
  description: "고민이 있는 청소년과 상담 전공 대학생을 연결하는 또래 상담 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${suit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-text-2">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: 검증**

```bash
npm run lint
```

Expected: 에러 없음. 그 다음 `npm run dev`로 `http://localhost:3000`을 열어(아직 이전 홈 화면 그대로지만) 브라우저 개발자도구 Network 탭에서 `SUIT-Regular.woff2` 등이 200으로 로드되는지, 배경이 `#f6f8fb`(연한 회색-블루)로 바뀌었는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add app/globals.css app/layout.tsx public/fonts
git commit -m "design: 솜잇 디자인 토큰 이식 및 SUIT 폰트 적용"
```

---

## Task 2: 공용 인증 훅 + RequireAuth + UI 프리미티브

**Files:**
- Create: `app/hooks/useAuthStatus.ts`
- Create: `app/components/RequireAuth.tsx`
- Modify: `app/components/AuthStatus.tsx`
- Create: `app/components/ui/Card.tsx`
- Create: `app/components/ui/SectionTitle.tsx`
- Create: `app/components/ui/Chip.tsx`

**Interfaces:**
- Consumes: `lib/api.ts`의 `apiFetch(path, options)` (기존, 시그니처 불변).
- Produces:
  - `useAuthStatus(): readonly [AuthState, Dispatch<SetStateAction<AuthState>>]` — `AuthState = { phase: "loading" } | { phase: "out" } | { phase: "in"; name: string; role: "counselor" | "client" }`.이후 모든 태스크(AppShell, Sidebar, TopBar, BottomNav, 보호 라우트)가 이 훅으로 로그인 상태를 읽는다.
  - `<RequireAuth>{children}</RequireAuth>` — 비로그인 시 `/login`으로 리다이렉트, 로그인 확인 전/비로그인 시 `null` 렌더.
  - `<Card className? >{children}</Card>`, `<SectionTitle action?>{children}</SectionTitle>`, `<Chip active? onClick?>{children}</Chip>` — 이후 모든 페이지 태스크가 재사용.

- [ ] **Step 1: `app/hooks/useAuthStatus.ts` 작성**

```ts
"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "@/lib/api";

export type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | { phase: "in"; name: string; role: "counselor" | "client" };

export function useAuthStatus(): readonly [AuthState, Dispatch<SetStateAction<AuthState>>] {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState({ phase: "out" });
          return;
        }
        const data = (await res.json()) as { name: string; role: "counselor" | "client" };
        if (!cancelled) setState({ phase: "in", name: data.name, role: data.role });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "out" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return [state, setState] as const;
}
```

- [ ] **Step 2: `app/components/RequireAuth.tsx` 작성**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStatus, type AuthState } from "@/app/hooks/useAuthStatus";

type LoggedInState = Extract<AuthState, { phase: "in" }>;

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode | ((auth: LoggedInState) => React.ReactNode);
}) {
  const [state] = useAuthStatus();
  const router = useRouter();

  useEffect(() => {
    if (state.phase === "out") router.push("/login");
  }, [state, router]);

  if (state.phase !== "in") return null;
  return <>{typeof children === "function" ? children(state) : children}</>;
}
```

`children`을 함수로 넘기면 로그인된 사용자 정보(`name`, `role`)를 받아 쓸 수 있다(예: Task 11 마이페이지). 단순 가드만 필요하면(Task 9 채팅) 기존처럼 일반 JSX children을 넘기면 된다 — 이 훅 안에서 이미 `phase === "in"`을 한 번 확인했으므로, 자식이 다시 `useAuthStatus()`를 별도로 호출하면 훅 인스턴스가 새로 생겨 "loading"부터 다시 시작해 화면이 잠깐 깜빡일 수 있다. 로그인된 사용자 정보가 필요한 화면은 반드시 함수 children으로 받아 쓰고, `RequireAuth` 밖에서 별도로 `useAuthStatus()`를 호출하지 않는다.

- [ ] **Step 3: `app/components/AuthStatus.tsx`를 새 훅 + 새 디자인으로 교체**

```tsx
"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";

export default function AuthStatus() {
  const [state, setState] = useAuthStatus();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setState({ phase: "out" });
  }

  if (state.phase === "loading") return null;

  if (state.phase === "in") {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs font-semibold text-text-muted shell:inline">
          {state.name}님
        </span>
        <button
          onClick={handleLogout}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary-dark hover:text-primary-dark"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs font-bold">
      <Link href="/login" className="text-text-muted hover:text-primary-dark">
        로그인
      </Link>
      <span className="text-text-faint">·</span>
      <Link href="/signup" className="text-text-muted hover:text-primary-dark">
        회원가입
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: UI 프리미티브 3개 작성**

```tsx
// app/components/ui/Card.tsx
export default function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>
      {children}
    </div>
  );
}
```

```tsx
// app/components/ui/SectionTitle.tsx
export default function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 text-lg font-extrabold text-text">
      {children}
      {action && <span className="ml-auto text-sm font-semibold text-primary-dark">{action}</span>}
    </div>
  );
}
```

```tsx
// app/components/ui/Chip.tsx
export default function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-primary-dark bg-primary-dark text-white"
          : "border-border text-text-muted hover:border-primary-dark hover:text-primary-dark"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: 검증**

```bash
npm run lint
```

Expected: 에러 없음(`AuthStatus.tsx`를 쓰는 `app/page.tsx`가 아직 있으므로 타입 에러가 없어야 한다 — `useAuthStatus`가 반환하는 튜플 타입이 기존 `useState` 튜플과 호환되는지 확인).

- [ ] **Step 6: 커밋**

```bash
git add app/hooks app/components/RequireAuth.tsx app/components/AuthStatus.tsx app/components/ui
git commit -m "feat: 공용 인증 훅(useAuthStatus)과 RequireAuth, UI 프리미티브 추가"
```

---

## Task 3: AppShell(반응형 사이드바/상단바/하단탭) + 라우트 그룹 이전

**Files:**
- Create: `app/components/shell/nav-items.tsx`
- Create: `app/components/shell/Sidebar.tsx`
- Create: `app/components/shell/TopBar.tsx`
- Create: `app/components/shell/BottomNav.tsx`
- Create: `app/components/shell/AppShell.tsx`
- Create: `app/(shell)/layout.tsx`
- Create: `app/(shell)/page.tsx` (임시 자리표시자 — Task 5에서 실제 홈 콘텐츠로 교체)
- Delete: `app/page.tsx` (기존 "Hello, World" 랜딩. `app/(shell)/page.tsx`가 대체)

**Interfaces:**
- Consumes: `useAuthStatus`(Task 2), `AuthStatus`(Task 2).
- Produces: `NAV_ITEMS: NavItem[]`, `pageTitle(pathname: string): string` — 이후 페이지 태스크는 직접 쓰지 않지만 새 라우트를 추가할 때 `pageTitle`에 분기를 추가해야 한다는 것만 알면 됨. `<AppShell>{children}</AppShell>`이 `app/(shell)/layout.tsx`에서 전체를 감싼다.

- [ ] **Step 1: `app/components/shell/nav-items.tsx` 작성**

```tsx
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function MypageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    </svg>
  );
}

export type NavItem = {
  href: string;
  label: string;
  requiresAuth: boolean;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", requiresAuth: false, Icon: HomeIcon },
  { href: "/community", label: "커뮤니티", requiresAuth: false, Icon: CommunityIcon },
  { href: "/chat", label: "채팅 상담", requiresAuth: true, Icon: ChatIcon },
  { href: "/test", label: "심리검사", requiresAuth: false, Icon: TestIcon },
  { href: "/mypage", label: "마이페이지", requiresAuth: true, Icon: MypageIcon },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function pageTitle(pathname: string): string {
  if (pathname === "/") return "홈";
  if (pathname.startsWith("/community/write")) return "글쓰기";
  if (pathname.startsWith("/community/")) return "게시글";
  if (pathname.startsWith("/community")) return "커뮤니티";
  if (pathname.startsWith("/chat/")) return "채팅방";
  if (pathname.startsWith("/chat")) return "채팅 상담";
  if (pathname.startsWith("/test")) return "심리검사";
  if (pathname.startsWith("/mypage")) return "마이페이지";
  if (pathname.startsWith("/notifications")) return "알림";
  if (pathname.startsWith("/settings")) return "설정";
  return "솜잇";
}
```

- [ ] **Step 2: `app/components/shell/Sidebar.tsx` 작성**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function Sidebar({ pathname }: { pathname: string }) {
  const [auth] = useAuthStatus();
  const router = useRouter();

  function handleNavClick(e: React.MouseEvent, href: string, requiresAuth: boolean) {
    if (requiresAuth && auth.phase !== "in") {
      e.preventDefault();
      router.push("/login");
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-border bg-surface shell:flex">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-dark to-primary-darker text-lg">
          🩵
        </div>
        <div>
          <div className="text-xl font-black tracking-tight text-text">솜잇</div>
          <div className="text-[11px] text-text-muted">또래 상담 플랫폼</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="mb-1 px-2 text-[10px] font-bold tracking-wider text-text-faint">메인</div>
        {NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNavClick(e, href, requiresAuth)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary-light text-primary-dark"
                  : "text-text-muted hover:bg-primary-light hover:text-primary-dark"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href={auth.phase === "in" ? "/mypage" : "/login"}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary-light"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-dark to-primary-darker text-sm font-extrabold text-white">
            {auth.phase === "in" ? auth.name.slice(0, 1) : "나"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-text">
              {auth.phase === "in" ? auth.name : "로그인 해주세요"}
            </div>
            <div className="text-[11px] text-text-muted">
              {auth.phase === "in"
                ? auth.role === "counselor"
                  ? "🌿 상담사"
                  : "🌱 고민 청소년"
                : "👆 클릭해서 로그인"}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: `app/components/shell/TopBar.tsx` 작성**

```tsx
import Link from "next/link";
import AuthStatus from "@/app/components/AuthStatus";

export default function TopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-[60px] items-center gap-4 border-b border-border bg-surface px-4 shell:px-8">
      <div className="flex-1 text-[18px] font-extrabold text-text">{title}</div>
      <div className="flex items-center gap-3">
        <Link
          href="/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-primary-light hover:text-primary-dark"
          title="알림"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
        <AuthStatus />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: `app/components/shell/BottomNav.tsx` 작성**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function BottomNav({ pathname }: { pathname: string }) {
  const [auth] = useAuthStatus();
  const router = useRouter();

  function handleNavClick(e: React.MouseEvent, href: string, requiresAuth: boolean) {
    if (requiresAuth && auth.phase !== "in") {
      e.preventDefault();
      router.push("/login");
    }
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t border-border bg-surface shell:hidden">
      {NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={(e) => handleNavClick(e, href, requiresAuth)}
            className={`flex flex-col items-center gap-1 px-2 text-[10px] font-bold ${
              active ? "text-primary-dark" : "text-text-faint"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: `app/components/shell/AppShell.tsx` 작성**

```tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { pageTitle } from "./nav-items";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar pathname={pathname} />
      <div className="flex flex-1 flex-col shell:ml-[260px]">
        <TopBar title={title} />
        <main className="flex-1 px-4 pb-20 pt-6 shell:px-8 shell:pb-12">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  );
}
```

- [ ] **Step 6: 라우트 그룹으로 이전 — `app/(shell)/layout.tsx`, `app/(shell)/page.tsx` 생성, `app/page.tsx` 삭제**

```tsx
// app/(shell)/layout.tsx
import AppShell from "@/app/components/shell/AppShell";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

```tsx
// app/(shell)/page.tsx (임시 — Task 5에서 실제 홈 콘텐츠로 교체)
export default function HomePage() {
  return <div className="text-text">홈 화면 준비 중</div>;
}
```

```bash
git rm app/page.tsx
```

- [ ] **Step 7: 검증**

```bash
npm run lint
```

Expected: 에러 없음(단, `app/(shell)/page.tsx`가 방금 만든 임시 자리표시자라 정상). 이어서 `npm run dev`로 다음을 브라우저에서 확인한다:
1. `http://localhost:3000` — 창을 900px 이상으로 넓히면 왼쪽에 "솜잇" 사이드바(홈/커뮤니티/채팅 상담/심리검사/마이페이지)가 보이고, 900px 미만으로 좁히면 사이드바가 사라지고 하단에 5개 아이콘 탭바가 보인다.
2. 상단바 오른쪽에 알림 종 아이콘 + "로그인 · 회원가입" 링크가 보인다(비로그인 상태).
3. 사이드바/하단탭의 "채팅 상담", "마이페이지"를 클릭하면 `/login`으로 이동한다(아직 그 페이지들 자체는 만들지 않았으므로 404가 나면 안 되고, `authGuard`가 먼저 가로채 `/login`으로 보내는지 확인 — `/login`은 기존 페이지라 정상적으로 뜬다).
4. "커뮤니티", "심리검사"를 클릭하면 404가 뜬다 — 이건 정상(다음 태스크들에서 만들 예정).

- [ ] **Step 8: 커밋**

```bash
git add app/components/shell app/\(shell\) app/page.tsx
git commit -m "feat: 반응형 AppShell(사이드바/상단바/하단탭) 및 (shell) 라우트 그룹 추가"
```

---

## Task 4: 정적 콘텐츠 데이터 모듈 (커뮤니티/심리검사/채팅/알림 더미 데이터)

**Files:**
- Create: `app/(shell)/community/mock.ts`
- Create: `app/(shell)/test/data.ts`
- Create: `app/(shell)/chat/mock.ts`
- Create: `app/(shell)/notifications/mock.ts`

이 태스크는 화면(JSX)을 만들지 않고, 이후 모든 페이지 태스크(홈/커뮤니티/채팅/심리검사/알림)가 그대로 import해서 쓸 더미 데이터 모듈만 만든다. 목업(`somit_web_welcome_1.html` 787~1172줄의 `POST_DATA`/`TEST_DATA`/`TEST_CARDS`/`QUOTES`/`NOTICE_POSTS`, 1616줄 부근의 채팅 목록, 1235~1249줄의 `notifListWeb`)을 참고해 대표 데이터만 옮긴다(29개 게시글 전부가 아니라 8개 대표 게시글로 축약 — 화면/네비게이션 검증에는 충분).

**Interfaces:**
- Produces:
  - `app/(shell)/community/mock.ts`: `type CommunityPost`, `COMMUNITY_POSTS: CommunityPost[]`, `TOPICS: readonly string[]`, `TOPIC_EMOJI: Record<string, string>`, `NOTICE_POSTS: { id: string; title: string; time: string }[]`.
  - `app/(shell)/test/data.ts`: `type TestType = "stress" | "selfesteem" | "depression"`, `TEST_CARDS: { type: TestType; gradientFrom: string; gradientTo: string; emoji: string; label: string; title: string; sub: string }[]`, `TEST_DATA: Record<TestType, { title: string; intro: string; reverseIdx: number[]; cols: string[]; questions: string[]; getResult(score: number): { label: string; desc: string; color: string } }>`.
  - `app/(shell)/chat/mock.ts`: `type ChatMessage`, `type ChatRoom`, `CHAT_ROOMS: ChatRoom[]`.
  - `app/(shell)/notifications/mock.ts`: `type NotificationItem`, `NOTIFICATIONS: NotificationItem[]`.

- [ ] **Step 1: `app/(shell)/community/mock.ts` 작성**

```ts
export type CommunityComment = {
  av: string;
  name: string;
  role: string;
  text: string;
  date: string;
};

export type CommunityPost = {
  id: number;
  tag: string;
  title: string;
  author: string;
  gender: "남" | "여";
  age: number;
  time: string;
  views: number;
  likes: number;
  cmtCount: number;
  body: string;
  comments: CommunityComment[];
};

export const TOPICS = ["MBTI", "스트레스", "마음", "관계", "진로", "감정", "학교", "고민"] as const;

export const TOPIC_EMOJI: Record<string, string> = {
  MBTI: "🧠",
  스트레스: "😤",
  마음: "💙",
  관계: "🤝",
  진로: "💼",
  감정: "😔",
  학교: "📚",
  고민: "🤔",
};

export const NOTICE_POSTS = [
  { id: "n1", title: "솜잇 서비스 이용 안내", time: "2024.03.01" },
  { id: "n2", title: "2024년 상담사 모집 안내", time: "2024.02.15" },
  { id: "n3", title: "개인정보처리방침 업데이트 안내", time: "2024.01.20" },
];

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 0,
    tag: "마음",
    title: "시험 기간마다 극심한 불안이 와요",
    author: "익명",
    gender: "여",
    age: 21,
    time: "30분 전",
    views: 52,
    likes: 6,
    cmtCount: 9,
    body: "중간고사 기간만 되면 아무것도 못 하겠어요.\n공부를 해야 한다는 걸 아는데, 책상 앞에 앉으면 가슴이 답답하고 손이 떨려요.\n이게 불안 장애인지, 그냥 긴장인지 구분이 안 돼서 더 무서워요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "시험 불안은 정말 많은 대학생이 겪어요. 시험 전날 밤에 복식 호흡을 10분만 해보세요.", date: "20분 전" },
    ],
  },
  {
    id: 1,
    tag: "MBTI",
    title: "INFP인데 팀플에서 너무 힘들어요",
    author: "달빛콩",
    gender: "여",
    age: 20,
    time: "1시간 전",
    views: 130,
    likes: 21,
    cmtCount: 14,
    body: "팀플을 하면 항상 제가 제일 많이 하는 것 같은데, 말을 못 해서 그냥 참게 돼요.\n인프피 특성상 갈등을 너무 싫어하다 보니까 불만도 표현을 못 하고...",
    comments: [
      { av: "🧠", name: "INFP4년차", role: "", text: "저도 같은 유형이에요. 카톡으로 의견 내면 말보다 훨씬 편하더라고요.", date: "40분 전" },
    ],
  },
  {
    id: 2,
    tag: "진로",
    title: "복수전공 할까요 말까요 진짜 모르겠어요",
    author: "갈팡질팡",
    gender: "남",
    age: 22,
    time: "2시간 전",
    views: 88,
    likes: 12,
    cmtCount: 11,
    body: "컴공 다니고 있는데 경영 복수전공을 생각 중이에요.\n취업에 도움이 될 것 같긴 한데, 이미 학점 관리도 빠듯한데 부전공까지 하면 너무 힘들 것 같고...",
    comments: [
      { av: "🎓", name: "졸업생", role: "", text: "저는 했는데 솔직히 힘들었어요. 그래도 취업할 때 메리트는 있었어요.", date: "1시간 전" },
    ],
  },
  {
    id: 3,
    tag: "감정",
    title: "자취 시작하고 갑자기 외로움이 밀려와요",
    author: "혼자사는중",
    gender: "남",
    age: 20,
    time: "3시간 전",
    views: 175,
    likes: 34,
    cmtCount: 19,
    body: "처음 자취를 시작했어요. 자유롭고 좋을 줄 알았는데...\n저녁에 밥 먹을 때랑 주말에 혼자 있을 때 외로움이 너무 커요.",
    comments: [
      { av: "🏠", name: "자취3년차", role: "", text: "처음엔 다 그래요! 저도 한 달은 진짜 힘들었어요.", date: "2시간 전" },
    ],
  },
  {
    id: 4,
    tag: "관계",
    title: "친구인데 자꾸 비교해서 상처받아요",
    author: "익명",
    gender: "여",
    age: 21,
    time: "4시간 전",
    views: 94,
    likes: 18,
    cmtCount: 13,
    body: "친한 친구인데, 만날 때마다 저랑 비교하는 말을 해요.\n악의는 없는 것 같은데 들을 때마다 기분이 나빠지고 자존감이 떨어져요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "의도가 없어도 상처는 상처예요. 한번 솔직하게 이야기해보는 게 좋을 것 같아요.", date: "2시간 전" },
    ],
  },
  {
    id: 5,
    tag: "스트레스",
    title: "과제 마감이 다 겹쳐서 멘탈이 터지기 직전이에요",
    author: "마감지옥",
    gender: "남",
    age: 23,
    time: "6시간 전",
    views: 203,
    likes: 41,
    cmtCount: 28,
    body: "이번 주에 레포트 3개, 발표 1개, 퀴즈 2개가 다 겹쳤어요.\n어디서부터 시작해야 할지 모르겠어서 오히려 아무것도 못 하고 있어요.",
    comments: [
      { av: "⏰", name: "시간관리꾼", role: "", text: "마감 순서대로 할 일 목록 쓰고 딱 한 가지만 시작하는 거예요.", date: "5시간 전" },
    ],
  },
  {
    id: 6,
    tag: "학교",
    title: "수업 중에 발표할 때 목소리가 떨려요",
    author: "소심한대학생",
    gender: "여",
    age: 19,
    time: "5시간 전",
    views: 112,
    likes: 22,
    cmtCount: 17,
    body: "신입생인데 수업 시간에 발표나 질문 받을 때마다 목소리가 떨리고 얼굴이 빨개져요.",
    comments: [
      { av: "🎤", name: "발표왕", role: "", text: "저도 1학년 때 엄청 심했어요. 소모임 스터디에서 작은 발표부터 연습하다 보니 많이 좋아졌어요.", date: "4시간 전" },
    ],
  },
  {
    id: 7,
    tag: "고민",
    title: "부모님이 원하는 진로랑 제가 하고 싶은 게 달라요",
    author: "방황중인",
    gender: "남",
    age: 22,
    time: "1일 전",
    views: 221,
    likes: 44,
    cmtCount: 31,
    body: "부모님은 공무원이나 대기업을 원하시는데, 저는 콘텐츠 창작 쪽으로 가고 싶어요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "부모님의 걱정은 사랑에서 나오는 거예요. 구체적인 계획을 가지고 대화해보면 좀 더 열린 대화가 될 수 있어요.", date: "15시간 전" },
    ],
  },
];
```

- [ ] **Step 2: `app/(shell)/test/data.ts` 작성**

```ts
export type TestType = "stress" | "selfesteem" | "depression";

export type TestCard = {
  type: TestType;
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  label: string;
  title: string;
  sub: string;
};

export type TestResult = { label: string; desc: string; color: string };

export type TestDef = {
  title: string;
  intro: string;
  reverseIdx: number[];
  cols: string[];
  questions: string[];
  getResult(score: number): TestResult;
};

export const TEST_CARDS: TestCard[] = [
  { type: "stress", gradientFrom: "#e07b8b", gradientTo: "#c45c7a", emoji: "💔", label: "PSS · 10문항", title: "스트레스 검사", sub: "최근 한 달의 스트레스" },
  { type: "selfesteem", gradientFrom: "#6aab9c", gradientTo: "#3d8c7a", emoji: "🤲", label: "로젠버그 · 10문항", title: "자존감 검사", sub: "나를 얼마나 사랑하나요" },
  { type: "depression", gradientFrom: "#7a9cc5", gradientTo: "#4a72a8", emoji: "💙", label: "PHQ-9 · 9문항", title: "우울증 검사", sub: "지난 2주간의 기분" },
];

export const TEST_DATA: Record<TestType, TestDef> = {
  stress: {
    title: "스트레스 검사 (PSS)",
    intro: "지난 1개월 동안 각 문항의 내용을 얼마나 자주 느꼈는지 선택해주세요.",
    reverseIdx: [3, 4, 6, 7],
    cols: ["전혀 없었다", "거의 없었다", "때때로 있었다", "자주 있었다", "매우 자주 있었다"],
    questions: [
      "최근 1개월 동안, 예상치 못했던 일 때문에 당황했던 적이 얼마나 있었습니까?",
      "최근 1개월 동안, 인생에서 중요한 일들을 조절할 수 없다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 신경이 예민해지고 스트레스를 받고 있다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 당신의 개인적 문제들을 다루는 데 있어서 얼마나 자주 자신감을 느끼셨습니까?",
      "최근 1개월 동안, 일상의 일들이 당신의 생각대로 진행되고 있다는 느낌을 얼마나 경험하였습니까?",
      "최근 1개월 동안, 당신이 꼭 해야 하는 일을 처리할 수 없다고 생각한 적이 얼마나 있었습니까?",
      "최근 1개월 동안, 일상생활의 짜증을 얼마나 자주 잘 다스릴 수 있었습니까?",
      "최근 1개월 동안, 최상의 컨디션이라고 얼마나 자주 느끼셨습니까?",
      "최근 1개월 동안, 당신이 통제할 수 없는 일 때문에 화가 난 경험이 얼마나 있었습니까?",
      "최근 1개월 동안, 어려운 일들이 너무 많이 쌓여서 극복하지 못할 것 같은 느낌을 얼마나 자주 경험하였습니까?",
    ],
    getResult(score) {
      if (score <= 13) return { label: "낮은 스트레스", desc: "현재 스트레스 수준이 낮은 편이에요. 지금처럼 건강하게 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 26) return { label: "보통 스트레스", desc: "적당한 수준의 스트레스가 있어요. 가끔 휴식을 취하며 스트레스를 관리해보세요.", color: "#F5C842" };
      return { label: "높은 스트레스", desc: "스트레스 수준이 높은 편이에요. 전문가의 도움이나 상담을 받아보시는 게 좋을 것 같아요.", color: "#E05252" };
    },
  },
  selfesteem: {
    title: "자존감 검사 (로젠버그)",
    intro: "각 문항에 대해 자신에게 해당하는 정도를 선택해주세요.",
    reverseIdx: [],
    cols: ["대체로 그렇지 않다", "보통이다", "대체로 그렇다", "항상 그렇다"],
    questions: [
      "나는 내가 다른 사람들 만큼 가치 있는 사람이라고 생각한다.",
      "나는 가끔 내가 꽤 좋은 성품을 가졌다고 본다.",
      "나는 좋은 자질을 여럿 가지고 있다고 생각한다.",
      "나는 대부분의 사람들과 같이 잘 일 할 수 있다.",
      "나는 내가 자랑할 것이 많은 사람이라고 생각한다.",
      "나는 내가 쓸모있는 사람이라고 느낀다.",
      "나는 적어도 내가 다른 사람들과 평등하게 가치있는 사람이라고 생각한다.",
      "나는 나 자신을 아끼고 존중하는 사람이다.",
      "결과적으로 나는 성공할 사람이란 느낌이 든다.",
      "나는 긍정적인 마음으로 나를 대한다.",
    ],
    getResult(score) {
      if (score >= 34) return { label: "높은 자존감", desc: "자신을 가치 있게 여기고 긍정적인 자아상을 가지고 있어요 😊", color: "#50D9A0" };
      if (score >= 25) return { label: "보통 자존감", desc: "평균적인 수준의 자존감을 갖고 있어요. 스스로를 더 인정해주면 좋을 것 같아요.", color: "#F5C842" };
      return { label: "낮은 자존감", desc: "자존감이 낮을 수 있어요. 상담을 통해 자신을 더 사랑하는 방법을 찾아보세요 💙", color: "#9EB9E6" };
    },
  },
  depression: {
    title: "우울증 검사 (PHQ-9)",
    intro: "지난 2주 동안 다음 문제들로 얼마나 자주 방해를 받았는지 선택해주세요.",
    reverseIdx: [],
    cols: ["아니오", "예"],
    questions: [
      "거의 매일 또는 하루 종일 우울하고 슬프다.",
      "흥미나 즐거움이 눈에 띄게 줄었다.",
      "의도하지 않았는데도 체중이 눈에 띄게 줄거나 늘었다.",
      "거의 매일 잠을 못 자거나 반대로 잠을 너무 많이 잔다.",
      "불안해서 잠시도 가만히 있지 못하거나 몸의 움직임이 느려진다.",
      "늘 피곤하고 무기력하다.",
      "늘 자기를 못났다고 자책하고 죄책감을 많이 느낀다.",
      "집중을 못하며, 어떤 결정을 내리지 못하고 늘 망설인다.",
      "자살을 반복적으로 생각하고, 자살을 시도하거나 계획을 세운다.",
    ],
    getResult(score) {
      if (score === 0) return { label: "우울증 없음", desc: "현재 우울 증상이 거의 없어요. 좋은 상태를 유지해보세요 😊", color: "#50D9A0" };
      if (score <= 3) return { label: "경미한 우울", desc: "가벼운 우울 증상이 있어요. 규칙적인 생활과 사람들과의 소통이 도움이 될 수 있어요.", color: "#F5C842" };
      if (score <= 6) return { label: "중등도 우울", desc: "중간 수준의 우울 증상이 있어요. 전문 상담사와 이야기해보시는 걸 권장드려요.", color: "#F5930A" };
      return { label: "심한 우울", desc: "심한 우울 증상이 있어요. 가능한 빨리 전문가의 도움을 받으시길 강력히 권장드려요.", color: "#E05252" };
    },
  },
};
```

- [ ] **Step 3: `app/(shell)/chat/mock.ts` 작성**

```ts
export type ChatMessage = {
  id: number;
  from: "me" | "counselor";
  text: string;
  time: string;
};

export type ChatRoom = {
  id: string;
  counselorName: string;
  counselorRole: string;
  avatarBg: string;
  avatarColor: string;
  avatarLabel: string;
  lastMessage: string;
  unread: number;
  messages: ChatMessage[];
};

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: "room-1",
    counselorName: "이지원",
    counselorRole: "상담심리학과 4학년",
    avatarBg: "#e8eff9",
    avatarColor: "#7a9cc5",
    avatarLabel: "지",
    lastMessage: "네, 편하게 이야기해주세요 :)",
    unread: 1,
    messages: [
      { id: 1, from: "counselor", text: "안녕하세요! 솜잇에서 매칭된 이지원이에요 😊", time: "오후 2:01" },
      { id: 2, from: "counselor", text: "어떤 이야기든 편하게 나눠주시면 돼요.", time: "오후 2:01" },
      { id: 3, from: "me", text: "안녕하세요, 요즘 시험 때문에 너무 불안해서요...", time: "오후 2:03" },
      { id: 4, from: "counselor", text: "네, 편하게 이야기해주세요 :)", time: "오후 2:04" },
    ],
  },
  {
    id: "room-2",
    counselorName: "박재현",
    counselorRole: "청소년상담 전공 3학년",
    avatarBg: "#e1f5ee",
    avatarColor: "#0F6E56",
    avatarLabel: "박",
    lastMessage: "상담이 완료됐어요",
    unread: 0,
    messages: [
      { id: 1, from: "counselor", text: "오늘 상담은 여기까지 할게요. 고생하셨어요!", time: "어제" },
      { id: 2, from: "me", text: "감사합니다 덕분에 마음이 편해졌어요", time: "어제" },
    ],
  },
];
```

- [ ] **Step 4: `app/(shell)/notifications/mock.ts` 작성**

```ts
export type NotificationItem = {
  id: number;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
};

export const NOTIFICATIONS: NotificationItem[] = [
  { id: 1, icon: "🌿", title: "솜잇 상담 매칭 완료", desc: "이지원 상담사와 매칭됐어요. 채팅을 시작해보세요!", time: "방금 전", unread: true },
  { id: 2, icon: "📋", title: "심리검사 결과 안내", desc: "스트레스 검사를 완료하셨어요. 결과를 확인해보세요.", time: "10분 전", unread: true },
  { id: 3, icon: "🌊", title: "솜잇에 오신 걸 환영해요!", desc: "오늘 하루도 솜잇이 함께할게요 💙", time: "30분 전", unread: false },
];
```

- [ ] **Step 5: 검증**

```bash
npm run lint
```

Expected: 에러 없음(이 태스크는 아직 이 파일들을 import하는 화면이 없으므로 미사용 export 경고가 나올 수 있는데, ESLint의 `no-unused-vars`는 export된 값에는 적용되지 않아 문제없다).

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/community/mock.ts" "app/(shell)/test/data.ts" "app/(shell)/chat/mock.ts" "app/(shell)/notifications/mock.ts"
git commit -m "feat: 커뮤니티/심리검사/채팅/알림 더미 데이터 모듈 추가"
```

---

## Task 5: 홈 화면

**Files:**
- Modify: `app/(shell)/page.tsx` (Task 3의 임시 자리표시자를 실제 콘텐츠로 교체)

**Interfaces:**
- Consumes: `Card`, `SectionTitle`(Task 2), `TEST_CARDS`(Task 4 `test/data.ts`), `COMMUNITY_POSTS`(Task 4 `community/mock.ts`).

- [ ] **Step 1: `app/(shell)/page.tsx` 전체 교체**

```tsx
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import SectionTitle from "@/app/components/ui/SectionTitle";
import { TEST_CARDS } from "./test/data";
import { COMMUNITY_POSTS } from "./community/mock";

const QUOTES = [
  { text: "어둠 속을 걷고 있다면, 그냥 계속 걸어라.", src: "— 윈스턴 처칠" },
  { text: "넘어지는 것이 실패가 아니다. 넘어진 채로 머무는 것이 실패다.", src: "— 메리 피커드" },
  { text: "지금 이 순간도 괜찮다. 천천히 가도 된다. 멈춰있어도 된다.", src: "— 채사장" },
];

export default function HomePage() {
  const popularPosts = [...COMMUNITY_POSTS]
    .filter((p) => p.likes >= 15)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);
  const quote = QUOTES[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark via-primary to-[#b8d4f0] px-8 py-9">
        <div className="relative z-10 max-w-md">
          <h1 className="text-2xl font-black leading-snug text-white">
            마음이 힘들 때
            <br />
            솜잇이 함께해요 💙
          </h1>
          <p className="mt-2 text-sm text-white/80">또래 상담사와 1:1로 이야기를 나눠보세요</p>
          <Link
            href="/chat"
            className="mt-5 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-primary-dark transition-shadow hover:shadow-card-md"
          >
            AI 맞춤 상담 시작하기 →
          </Link>
        </div>
        <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-7xl opacity-20">
          🌊
        </div>
      </div>

      <div>
        <SectionTitle action={<Link href="/test">전체보기 ›</Link>}>🧪 나를 위한 심리검사</SectionTitle>
        <div className="grid grid-cols-1 gap-3.5 shell:grid-cols-3">
          {TEST_CARDS.map((t) => (
            <Link
              key={t.type}
              href="/test"
              className="relative flex min-h-[130px] flex-col gap-2.5 overflow-hidden rounded-2xl p-5 text-white transition-transform hover:-translate-y-1"
              style={{ background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})` }}
            >
              <div className="text-[11px] font-bold text-white/75">{t.label}</div>
              <div className="text-lg font-extrabold leading-snug">{t.title}</div>
              <div className="mt-auto text-xs text-white/70">{t.sub}</div>
              <div className="absolute bottom-3.5 right-4 text-4xl opacity-85">{t.emoji}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 shell:grid-cols-[2fr_1fr]">
        <div>
          <SectionTitle action={<Link href="/community">더보기 ›</Link>}>⭐ 인기 글</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {popularPosts.map((p) => (
              <Link
                key={p.id}
                href={`/community/${p.id}`}
                className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0 hover:bg-primary-xlight"
              >
                <span className="w-12 flex-shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-center text-[10px] font-bold text-primary-dark">
                  {p.tag}
                </span>
                <span className="flex-1 truncate text-sm text-text-2">{p.title}</span>
                <span className="flex flex-shrink-0 items-center gap-2 text-xs text-text-faint">
                  <span className="font-bold text-primary-dark">👍 {p.likes}</span>
                  <span>💬 {p.cmtCount}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <SectionTitle>💬 오늘의 한마디</SectionTitle>
          <Card className="relative overflow-hidden">
            <div className="text-sm font-semibold leading-relaxed text-text-2">{quote.text}</div>
            <div className="mt-3 text-right text-xs italic text-text-muted">{quote.src}</div>
          </Card>
          <Link href="/chat" className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 hover:bg-primary-xlight">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-xl">💬</div>
            <div>
              <div className="text-sm font-bold text-text">AI 맞춤 1:1 상담</div>
              <div className="mt-0.5 text-xs text-text-muted">나에게 맞는 상담사를 연결해드려요</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `http://localhost:3000`을 열어 히어로 배너, 심리검사 카드 3개(클릭 시 `/test`로 이동), 인기 글 목록(클릭 시 `/community/[id]`로 이동, 아직 그 페이지가 없으므로 404가 떠도 정상 — 다음 태스크에서 만듦), 오늘의 한마디 카드가 보이는지 확인한다. 900px 미만에서는 그리드가 1열로 쌓이는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/page.tsx"
git commit -m "feat: 홈 화면 콘텐츠 구현"
```

---

## Task 6: 커뮤니티 목록 화면

**Files:**
- Create: `app/(shell)/community/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Chip`(Task 2), `COMMUNITY_POSTS`, `NOTICE_POSTS`, `TOPICS`, `TOPIC_EMOJI`(Task 4 `community/mock.ts`).
- Produces: `/community` 라우트. 게시글 카드는 `/community/[id]`로 링크(Task 7에서 생성).

- [ ] **Step 1: `app/(shell)/community/page.tsx` 작성**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { COMMUNITY_POSTS, NOTICE_POSTS, TOPICS, TOPIC_EMOJI } from "./mock";

type Tab = "best" | "all" | "notice";

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("best");
  const [search, setSearch] = useState("");

  const posts = useMemo(() => {
    let list =
      tab === "best"
        ? [...COMMUNITY_POSTS].filter((p) => p.likes >= 15).sort((a, b) => b.likes - a.likes)
        : [...COMMUNITY_POSTS];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    return list;
  }, [tab, search]);

  return (
    <div className="grid grid-cols-1 gap-6 shell:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(["best", "all", "notice"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t ? "bg-primary-dark text-white" : "text-text-muted"
                }`}
              >
                {t === "best" ? "인기글" : t === "all" ? "전체글" : "공지사항"}
              </button>
            ))}
          </div>
          <Link
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </Link>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {tab === "notice" ? (
          <div className="flex flex-col gap-2">
            {NOTICE_POSTS.map((n) => (
              <Card key={n.id}>
                <div className="text-sm font-bold text-primary-dark">공지</div>
                <div className="mt-1 font-bold text-text">{n.title}</div>
                <div className="mt-1 text-xs text-text-faint">{n.time}</div>
              </Card>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-text-faint">해당하는 글이 없어요</div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                      {p.tag}
                    </span>
                    {p.likes >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{p.body}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-faint">
                    <span>
                      {p.author} · {p.time}
                    </span>
                    <span>👍 {p.likes}</span>
                    <span>💬 {p.cmtCount}</span>
                    <span>👁 {p.views}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-3 font-extrabold text-text">🔥 주목받는 주제</div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <Chip key={t}>
                {TOPIC_EMOJI[t]} {t}
              </Chip>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          <div className="flex flex-col divide-y divide-border">
            {NOTICE_POSTS.map((n) => (
              <div key={n.id} className="py-2 text-[13px] text-text-muted">
                {n.title}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/community`를 열어 탭 전환(인기글/전체글/공지사항), 검색창에 입력 시 목록이 필터링되는지, 오른쪽 "주목받는 주제"/"공지사항" 카드가 보이는지, "✍️ 글쓰기" 클릭 시 `/community/write`로 이동을 시도하는지 확인한다(그 페이지 자체는 Task 8에서 만들므로 이 시점엔 404가 떠도 정상).

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/community/page.tsx"
git commit -m "feat: 커뮤니티 목록 화면 구현"
```

---

## Task 7: 게시글 상세 화면

**Files:**
- Create: `app/(shell)/community/[id]/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Chip`(Task 2), `COMMUNITY_POSTS`, `TOPICS`, `TOPIC_EMOJI`(Task 4).

- [ ] **Step 1: `app/(shell)/community/[id]/page.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { COMMUNITY_POSTS, TOPICS, TOPIC_EMOJI, type CommunityComment } from "../mock";

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const post = COMMUNITY_POSTS.find((p) => p.id === Number(params.id));

  const [likes, setLikes] = useState(post?.likes ?? 0);
  const [voted, setVoted] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommunityComment[]>(post?.comments ?? []);

  if (!post) {
    return (
      <div className="py-16 text-center text-text-faint">
        게시글을 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/community" className="font-bold text-primary-dark">
            커뮤니티로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  function toggleVote() {
    if (voted) {
      setLikes((n) => n - 1);
      setVoted(false);
    } else {
      setLikes((n) => n + 1);
      setVoted(true);
    }
  }

  function submitComment() {
    if (!comment.trim()) return;
    setComments((c) => [...c, { av: "💬", name: "나", role: "", text: comment.trim(), date: "방금 전" }]);
    setComment("");
  }

  return (
    <div className="grid grid-cols-1 gap-6 shell:grid-cols-[1fr_300px]">
      <div>
        <button
          onClick={() => router.push("/community")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-text-muted"
        >
          ← 커뮤니티로 돌아가기
        </button>
        <Card>
          <div className="mb-3 flex gap-2">
            <span className="rounded-md bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary-dark">
              {post.tag}
            </span>
            {post.likes >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
          <h1 className="mb-3 text-2xl font-black text-text">{post.title}</h1>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.author} · {post.gender}성 {post.age}세 · {post.time} · 조회 {post.views}
          </div>
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>

          <div className="my-6 flex justify-center border-y border-border py-6">
            <button
              onClick={toggleVote}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-6 py-3 font-bold transition-colors ${
                voted ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-xl">👍</span>
              <span className="text-sm text-text">{likes}</span>
            </button>
          </div>

          <div className="mb-3 font-extrabold text-text">
            댓글 <span className="text-primary-dark">{comments.length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {comments.map((c, i) => (
              <div key={i} className="flex gap-3 border-b border-border pb-3 last:border-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary-dark">
                  {c.av}
                </div>
                <div>
                  <div className="text-[13px] font-bold text-text">
                    {c.name}
                    {c.role && (
                      <span className="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-dark">
                        {c.role}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[13px] text-text-2">{c.text}</div>
                  <div className="mt-1 text-[11px] text-text-faint">{c.date}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="따뜻한 댓글을 남겨보세요 💙"
              rows={2}
              className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-[13px] outline-none focus:border-primary"
            />
            <button onClick={submitComment} className="rounded-xl bg-primary-dark px-4 py-2.5 text-[13px] font-bold text-white">
              올리기
            </button>
          </div>
        </Card>
      </div>
      <div>
        <Card>
          <div className="mb-3 font-extrabold text-text">🔥 주목받는 주제</div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <Chip key={t}>
                {TOPIC_EMOJI[t]} {t}
              </Chip>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

`CommunityComment` 타입은 Task 4에서 만든 `community/mock.ts`에 정의돼 있으므로 export 여부를 확인하고, 없다면 `export type CommunityComment = ...`가 이미 `mock.ts`에 있는지 다시 확인한다(Step 1에서 이미 export 되어 있음).

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/community`에서 게시글 카드를 클릭해 `/community/0` 등으로 이동, 본문/댓글이 보이고 👍 버튼을 누르면 숫자가 오르내리는지, 댓글 입력 후 "올리기"를 누르면 목록에 즉시 추가되는지 확인한다. 존재하지 않는 `/community/999`로 직접 이동하면 "게시글을 찾을 수 없어요" 문구가 보이는지도 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/community/[id]/page.tsx"
git commit -m "feat: 게시글 상세 화면 구현"
```

---

## Task 8: 글쓰기 화면

**Files:**
- Create: `app/(shell)/community/write/page.tsx`

**Interfaces:**
- Consumes: `Chip`(Task 2), `TOPICS`(Task 4 `community/mock.ts`). 로그인하지 않아도 볼 수는 있지만, 실제로 필요한 건 아니므로 `RequireAuth`로 감싸지 않는다(스펙상 로그인 필요 화면은 `/chat`, `/mypage`, `/notifications`뿐).

- [ ] **Step 1: `app/(shell)/community/write/page.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { TOPICS } from "../mock";

export default function CommunityWritePage() {
  const router = useRouter();
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="py-16 text-center">
        <div className="mb-2 text-2xl">✍️💙</div>
        <div className="mb-1 font-bold text-text">글이 올라갔어요 (임시 저장, 실제 저장은 아직 연결 전이에요)</div>
        <button onClick={() => router.push("/community")} className="mt-4 font-bold text-primary-dark">
          커뮤니티로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <Chip key={t} active={category === t} onClick={() => setCategory(t)}>
            {t}
          </Chip>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목을 입력하세요"
        maxLength={50}
        className="mb-3 w-full border-b border-border pb-3 text-xl font-bold text-text outline-none placeholder:text-text-faint"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="고민이나 이야기를 자유롭게 적어보세요 💙"
        rows={8}
        className="w-full resize-none text-sm leading-relaxed text-text-2 outline-none placeholder:text-text-faint"
      />
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim()}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          ✍️ 올리기
        </button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/community/write`를 열어 카테고리 칩 선택, 제목/본문 입력 후 "올리기"를 누르면 완료 메시지가 뜨고 "커뮤니티로 돌아가기"로 `/community`에 돌아가는지 확인한다. 제목/본문이 비어있으면 버튼이 비활성화되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/community/write/page.tsx"
git commit -m "feat: 글쓰기 화면 구현(로컬 state, 저장 미연결)"
```

---

## Task 9: 채팅 목록 + 채팅방 화면 (로그인 필요)

**Files:**
- Create: `app/(shell)/chat/page.tsx`
- Create: `app/(shell)/chat/[id]/page.tsx`

**Interfaces:**
- Consumes: `RequireAuth`(Task 2), `CHAT_ROOMS`, `type ChatMessage`, `type ChatRoom`(Task 4 `chat/mock.ts`).

- [ ] **Step 1: `app/(shell)/chat/page.tsx` 작성**

```tsx
"use client";

import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { CHAT_ROOMS } from "./mock";

export default function ChatListPage() {
  return (
    <RequireAuth>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shell:grid-cols-[300px_1fr]">
        <div className="border-b border-border shell:border-b-0 shell:border-r">
          <div className="border-b border-border px-4 py-4 font-extrabold text-text">상담 목록</div>
          <div>
            {CHAT_ROOMS.map((r) => (
              <Link
                key={r.id}
                href={`/chat/${r.id}`}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-primary-xlight"
              >
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
                  style={{ background: r.avatarBg, color: r.avatarColor }}
                >
                  {r.avatarLabel}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-text">
                    {r.counselorName}
                    {r.unread > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{r.unread}</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-text-muted">{r.lastMessage}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="hidden items-center justify-center py-24 text-text-faint shell:flex">
          왼쪽에서 상담을 선택해주세요
        </div>
      </div>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: `app/(shell)/chat/[id]/page.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { CHAT_ROOMS, type ChatMessage } from "../mock";

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const room = CHAT_ROOMS.find((r) => r.id === params.id);
  const [messages, setMessages] = useState<ChatMessage[]>(room?.messages ?? []);
  const [input, setInput] = useState("");

  if (!room) {
    return (
      <RequireAuth>
        <div className="py-16 text-center text-text-faint">채팅방을 찾을 수 없어요.</div>
      </RequireAuth>
    );
  }

  function send() {
    if (!input.trim()) return;
    setMessages((m) => [...m, { id: m.length + 1, from: "me", text: input.trim(), time: "방금" }]);
    setInput("");
  }

  return (
    <RequireAuth>
      <div className="flex h-[calc(100vh-160px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <button onClick={() => router.push("/chat")} className="text-text-muted">
            ←
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: room.avatarBg, color: room.avatarColor }}
          >
            {room.avatarLabel}
          </div>
          <div>
            <div className="font-bold text-text">{room.counselorName}</div>
            <div className="text-xs text-text-muted">{room.counselorRole}</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-5">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[420px] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                  m.from === "me"
                    ? "rounded-br-md bg-primary-dark text-white"
                    : "rounded-bl-md border border-border bg-surface text-text-2"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t border-border bg-surface px-5 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="메시지를 입력하세요"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={send}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white"
          >
            ↑
          </button>
        </div>
      </div>
    </RequireAuth>
  );
}
```

- [ ] **Step 3: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 로그인하지 않은 상태에서 `/chat`에 직접 접속하면 `/login`으로 리다이렉트되는지 확인한다. 로그인 후(기존 로그인 페이지 사용) `/chat`에 접속해 채팅방 목록이 보이고, `/chat/room-1`을 클릭하면 대화 내용이 보이며, 메시지를 입력하고 Enter를 누르면 오른쪽에 내 말풍선으로 추가되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/chat/page.tsx" "app/(shell)/chat/[id]/page.tsx"
git commit -m "feat: 채팅 목록/채팅방 화면 구현(로그인 필요)"
```

---

## Task 10: 심리검사 화면

**Files:**
- Create: `app/(shell)/test/page.tsx`

**Interfaces:**
- Consumes: `TEST_CARDS`, `TEST_DATA`, `type TestType`, `type TestResult`(Task 4 `test/data.ts`).

- [ ] **Step 1: `app/(shell)/test/page.tsx` 작성**

```tsx
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
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/test`를 열어 카드 3개 중 하나(예: 스트레스 검사)를 클릭 → 문항 10개가 순서대로 보이고 각 문항에 답을 선택하면 강조되는지 확인한다. 일부만 답한 채 "결과 보기"를 누르면 버튼이 비활성화 상태(disabled)인지, 전부 답하면 활성화되어 점수/등급/설명이 뜨는지 확인한다. 우울증 검사(9문항, 아니오/예 2개 선택지)와 자존감 검사(10문항, 4개 선택지)도 각각 열어 정상 동작하는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/test/page.tsx"
git commit -m "feat: 심리검사 화면 구현(스트레스/자존감/우울증 채점 로직 포함)"
```

---

## Task 11: 마이페이지 화면 (로그인 필요)

**Files:**
- Create: `app/(shell)/mypage/page.tsx`

**Interfaces:**
- Consumes: `RequireAuth`(Task 2, 함수 children 형태로 로그인 사용자 정보를 받음).

- [ ] **Step 1: `app/(shell)/mypage/page.tsx` 작성**

```tsx
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";

export default function MypagePage() {
  return (
    <RequireAuth>
      {(auth) => (
        <div className="grid grid-cols-1 gap-6 shell:grid-cols-[280px_1fr]">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark to-primary-darker p-7 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25 text-2xl font-extrabold text-white">
              {auth.name.slice(0, 1)}
            </div>
            <div className="mb-1 font-extrabold text-white">{auth.name}</div>
            <div className="text-xs text-white/75">{auth.role === "counselor" ? "상담사" : "고민 청소년"}</div>
            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl bg-white/15">
              <div className="border-r border-white/15 py-3 text-center">
                <div className="font-extrabold text-white">0</div>
                <div className="mt-0.5 text-[10px] text-white/70">작성한 글</div>
              </div>
              <div className="border-r border-white/15 py-3 text-center">
                <div className="font-extrabold text-white">0</div>
                <div className="mt-0.5 text-[10px] text-white/70">저장한 글</div>
              </div>
              <div className="py-3 text-center">
                <div className="font-extrabold text-white">0</div>
                <div className="mt-0.5 text-[10px] text-white/70">상담 횟수</div>
              </div>
            </div>
            <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/settings"
              className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 hover:bg-primary-xlight"
            >
              <span className="font-bold text-text">⚙️ 설정</span>
              <span className="text-text-faint">›</span>
            </Link>
            <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
              프로필 상세 정보(전공/학년/연령대 등) 입력은 곧 추가될 예정이에요.
            </div>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. 로그인하지 않은 상태로 `/mypage`에 접속하면 `/login`으로 리다이렉트되는지, 로그인 후 접속하면 프로필 카드에 실제 이름/역할이 보이는지("상담사" 또는 "고민 청소년"), "⚙️ 설정" 클릭 시 `/settings`로 이동하는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/mypage/page.tsx"
git commit -m "feat: 마이페이지 화면 구현(로그인 필요)"
```

---

## Task 12: 알림 화면 (로그인 필요)

**Files:**
- Create: `app/(shell)/notifications/page.tsx`

**Interfaces:**
- Consumes: `RequireAuth`(Task 2, 일반 children), `NOTIFICATIONS`, `type NotificationItem`(Task 4 `notifications/mock.ts`).

- [ ] **Step 1: `app/(shell)/notifications/page.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import RequireAuth from "@/app/components/RequireAuth";
import { NOTIFICATIONS, type NotificationItem } from "./mock";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>(NOTIFICATIONS);

  return (
    <RequireAuth>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-extrabold text-text">🔔 알림</div>
          <button
            onClick={() => setItems((prev) => prev.map((n) => ({ ...n, unread: false })))}
            className="text-[13px] font-bold text-text-muted"
          >
            모두 읽음
          </button>
        </div>
        {items.length === 0 ? (
          <div className="py-16 text-center text-text-faint">알림이 없어요</div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3.5 border-b border-border px-5 py-4 last:border-0 ${n.unread ? "bg-primary-light" : ""}`}
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-lg">
                {n.icon}
              </div>
              <div className="flex-1">
                <div className="mb-0.5 font-bold text-text">{n.title}</div>
                <div className="text-[13px] leading-relaxed text-text-muted">{n.desc}</div>
                <div className="mt-1 text-[11px] text-text-faint">{n.time}</div>
              </div>
              {n.unread && <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-danger" />}
            </div>
          ))
        )}
      </div>
    </RequireAuth>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. 로그인하지 않은 상태로 `/notifications`에 접속하면 `/login`으로 리다이렉트, 로그인 후 접속하면 알림 3개가 보이고(안 읽은 항목은 배경이 다르고 오른쪽에 빨간 점) "모두 읽음"을 누르면 전부 읽음 처리(배경/점 사라짐)되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/notifications/page.tsx"
git commit -m "feat: 알림 화면 구현(로그인 필요)"
```

---

## Task 13: 설정 화면 (SystemStatus 재배치 포함)

**Files:**
- Create: `app/(shell)/settings/page.tsx`
- Modify: `app/components/SystemStatus.tsx` (로직은 그대로, className만 새 토큰으로 교체)

**Interfaces:**
- Consumes: `useAuthStatus`(Task 2), `SystemStatus`(기존, 이 태스크에서 색만 재적용).
- 이 화면은 로그인하지 않아도 볼 수 있다(스펙상 로그인 필요 화면은 `/chat`, `/mypage`, `/notifications`뿐 — `/settings`는 아님). 로그아웃 버튼은 로그인 상태일 때만 보인다.

- [ ] **Step 1: `app/components/SystemStatus.tsx`의 className을 새 토큰으로 교체(로직 변경 없음)**

기존 `useState`/`useEffect`/`fetch` 로직은 한 글자도 바꾸지 않는다. 마지막 `return` 블록의 className과 `dotColor` 분기만 아래로 바꾼다:

```tsx
  const dotColor =
    state.phase === "ok" && state.mongoConnected
      ? "bg-success"
      : state.phase === "loading"
        ? "bg-text-faint"
        : "bg-danger";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </div>
  );
```

- [ ] **Step 2: `app/(shell)/settings/page.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SystemStatus from "@/app/components/SystemStatus";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { apiFetch } from "@/lib/api";

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
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border bg-bg px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-faint">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [auth, setAuth] = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAuth({ phase: "out" });
    router.push("/");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <SectionCard title="알림">
        <ToggleRow label="새 메시지 알림" defaultOn />
        <ToggleRow label="알림음" defaultOn />
        <ToggleRow label="채팅 알림" defaultOn />
      </SectionCard>

      <SectionCard title="개인정보">
        <ToggleRow label="닉네임 익명 표시" defaultOn />
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">대화 내용 암호화</span>
          <span className="text-xs font-bold text-success">적용 중</span>
        </div>
      </SectionCard>

      <SectionCard title="앱 정보">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">버전</span>
          <span className="text-xs text-text-muted">1.0.0 (Web)</span>
        </div>
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">백엔드 연결 상태</span>
          <SystemStatus />
        </div>
      </SectionCard>

      {auth.phase === "in" && (
        <SectionCard title="계정">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
          >
            로그아웃
          </button>
        </SectionCard>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/settings`를 열어(로그인 없이도 접속 가능) 토글들이 클릭할 때마다 켜짐/꺼짐 상태가 바뀌는지, "앱 정보" 카드에 `SystemStatus` 배지("백엔드 · DB 정상 연결" 등)가 새 파스텔 톤으로 보이는지 확인한다. 로그인 후 다시 `/settings`에 접속하면 "계정" 카드에 로그아웃 버튼이 나타나고, 클릭하면 로그아웃되어 홈으로 이동하는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/settings/page.tsx" app/components/SystemStatus.tsx
git commit -m "feat: 설정 화면 구현, SystemStatus 새 디자인 톤 적용"
```

---

## Task 14: 로그인 화면 재디자인

**Files:**
- Modify: `app/login/page.tsx` (기존 `handleSubmit`/state 로직은 그대로, JSX/className만 교체)

**Interfaces:**
- Consumes: 없음(기존 `apiFetch`, `useRouter`만 그대로 사용). `app/(shell)/` 밖에 있으므로 `AppShell`에 감싸이지 않는다 — 독립된 풀페이지.

- [ ] **Step 1: `app/login/page.tsx` 전체 교체(로직은 기존과 동일, `handleSubmit` 내부는 한 글자도 바꾸지 않는다)**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "로그인에 실패했습니다");
        return;
      }

      router.push("/");
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col shell:flex-row">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary-darker to-primary px-8 py-16 text-center shell:flex-1">
        <div className="mb-2 text-4xl font-black text-white">솜잇 💙</div>
        <p className="max-w-xs text-sm leading-relaxed text-white/80">
          고민이 있는 청소년과
          <br />
          상담 전공 대학생을 연결하는
          <br />
          또래 상담 플랫폼
        </p>
        <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 text-[200px] opacity-10">
          🌊
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16 shell:max-w-[480px]">
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="text-2xl font-black text-text">로그인</h2>
          <p className="text-sm text-text-muted">솜잇에 오신 걸 환영해요 🌊</p>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-text-muted">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="이메일을 입력하세요"
              className="w-full rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-text-muted">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="비밀번호를 입력하세요"
              className="w-full rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
            />
          </div>

          {error && <p className="text-xs font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p className="text-center text-xs text-text-muted">
            아직 계정이 없으신가요?{" "}
            <Link href="/signup" className="font-bold text-primary-dark">
              회원가입
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/login`을 열어 900px 이상에서는 좌우 분할(왼쪽 브랜드 패널 + 오른쪽 폼), 900px 미만에서는 위아래로 쌓이는지 확인한다. 잘못된 비밀번호로 로그인을 시도하면 기존과 동일하게 에러 메시지가 뜨는지, 올바른 계정으로 로그인하면 `/`로 이동하고 상단바에 로그아웃 버튼이 뜨는지 확인해 기존 auth 기능이 회귀 없이 동작하는지 검증한다.

- [ ] **Step 3: 커밋**

```bash
git add app/login/page.tsx
git commit -m "design: 로그인 화면 재디자인(기능 변경 없음)"
```

---

## Task 15: 회원가입 화면 재디자인

**Files:**
- Modify: `app/signup/page.tsx` (기존 `handleSubmit`/state 로직은 그대로, JSX/className만 교체)

**Interfaces:**
- Consumes: 없음(기존 `apiFetch`, `useRouter`만 그대로 사용).

- [ ] **Step 1: `app/signup/page.tsx` 전체 교체(로직은 기존과 동일, `handleSubmit` 내부는 한 글자도 바꾸지 않는다)**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"counselor" | "client">("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "회원가입에 실패했습니다");
        return;
      }

      router.push("/");
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-surface p-8 shadow-card"
      >
        <div className="mb-1 text-2xl font-black text-text">솜잇 회원가입 💙</div>
        <p className="mb-2 text-sm text-text-muted">몇 가지만 알려주시면 바로 시작할 수 있어요</p>

        <div className="flex gap-2 rounded-xl border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => setRole("client")}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              role === "client" ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            내담자
          </button>
          <button
            type="button"
            onClick={() => setRole("counselor")}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              role === "counselor" ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            상담사
          </button>
        </div>

        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />
        <input
          type="password"
          placeholder="비밀번호 (4자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />

        {error && <p className="text-xs font-semibold text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>

        <p className="text-center text-xs text-text-muted">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-bold text-primary-dark">
            로그인
          </Link>
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 검증**

```bash
npm run lint
```

Expected: 에러 없음. `npm run dev`로 `/signup`을 열어 "내담자"/"상담사" 탭 전환이 되는지, 4자 미만 비밀번호로 제출하면 브라우저 기본 유효성 검사(`minLength`)로 막히는지, 정상 가입 시 `/`로 이동하고 로그인 상태가 되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add app/signup/page.tsx
git commit -m "design: 회원가입 화면 재디자인(기능 변경 없음)"
```

---

## Task 16: 전체 회귀 확인 및 반응형 최종 점검

**Files:** 없음(코드 변경 없이 검증만) — 문제가 발견되면 해당 태스크의 파일을 직접 고친다.

- [ ] **Step 1: 백엔드 회귀 테스트**

```bash
cd server
npm test
cd ..
```

Expected: 18/18 통과(이번 UI 작업은 `server/` 디렉터리를 전혀 건드리지 않았으므로 실패하면 안 된다. 실패 시 어떤 태스크가 실수로 `server/`를 건드렸는지 `git log --stat`으로 확인한다).

- [ ] **Step 2: 프론트엔드 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러/빌드 에러 없이 성공. `app/(shell)/*`, `app/login`, `app/signup`을 포함한 모든 라우트가 정적/동적으로 정상 생성되는지 출력에서 확인한다.

- [ ] **Step 3: 데스크탑 뷰포트(1280px 이상) 수동 점검**

`npm run dev`로 각 라우트를 직접 열어 다음을 확인한다: `/`(홈), `/community`, `/community/0`, `/community/write`, `/test`, `/login`, `/signup`, 로그인 후 `/chat`, `/chat/room-1`, `/mypage`, `/notifications`, `/settings`. 왼쪽 사이드바가 항상 보이고, 활성 라우트에 해당하는 nav 항목이 강조 표시되는지 확인한다.

- [ ] **Step 4: 모바일 뷰포트(400px 전후) 수동 점검**

브라우저 개발자도구의 기기 툴바(또는 창 너비를 900px 미만으로 줄이기)로 같은 라우트들을 다시 열어, 사이드바 대신 하단 탭바가 보이고 모든 화면이 가로 스크롤 없이 1열로 쌓이는지 확인한다. 특히 `/chat/[id]`의 메시지 입력창이 화면 아래 하단 탭바에 가려지지 않는지 확인한다(가려진다면 `app/(shell)/chat/[id]/page.tsx`의 높이 계산(`h-[calc(100vh-160px)]`)을 조정한다).

- [ ] **Step 5: 링크 무결성 확인**

사이드바/하단탭의 5개 항목, 상단바의 알림 아이콘, 홈의 모든 카드 링크, 커뮤니티 글쓰기/게시글 상세 링크, 마이페이지의 설정 링크를 전부 한 번씩 클릭해 404나 콘솔 에러가 없는지 확인한다.

- [ ] **Step 6: 최종 커밋(문제를 고쳤다면)**

이 태스크 자체는 코드 변경이 없는 것이 이상적이다. 점검 중 문제를 발견해 고쳤다면 해당 수정 내용을 원인이 된 태스크의 성격에 맞는 커밋 메시지로 별도 커밋한다(예: `fix: 모바일에서 채팅방 입력창이 하단 탭바에 가려지는 문제 수정`).

---

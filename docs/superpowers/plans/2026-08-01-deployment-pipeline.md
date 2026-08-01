# 배포 파이프라인 구축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** create-club("솜잇") 프로젝트를 Vercel(프론트) / Railway(백엔드) / MongoDB Atlas(DB)에 GitHub 연동 자동배포로 스켈레톤 상태부터 배포하고, 세 산출물이 실제로 연결되어 동작함을 헬스체크로 증명한다.

**Architecture:** 기존 저장소(`hoi256678-cpu/createClub`) 루트에 Next.js 프론트엔드(변경 없음), `/server`에 신규 Express+Mongoose 백엔드. 프론트는 `NEXT_PUBLIC_API_URL`로 백엔드의 `/api/health`를 호출해 DB 연결 상태를 화면에 보여준다. Vercel과 Railway 모두 GitHub 저장소에 연결해 `main` push 시 자동 재배포.

**Tech Stack:** Next.js 16 canary / React 19 / Tailwind v4 (기존), Node.js + Express + Mongoose + cors + dotenv (신규, 순수 JavaScript, 빌드 단계 없음)

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-08-01-deployment-pipeline-design.md` (커밋 `0fdd77f`)
- 백엔드는 TypeScript가 아닌 **순수 JavaScript** (빌드 단계 없이 `node index.js`로 바로 실행)
- 프론트엔드는 DB에 직접 접근하지 않고 반드시 백엔드(`/api/health`)를 거친다
- 이 단계는 로직 없는 배관(plumbing) 검증이므로 **자동화 테스트를 만들지 않는다** — 각 태스크는 대신 curl/브라우저를 이용한 수동 검증 스텝으로 끝난다 (스펙의 테스트 전략 결정을 따름)
- 시크릿(`MONGODB_URI` 등)은 절대 git에 커밋하지 않는다 — `.env*`는 이미 루트 `.gitignore`에 있어 `/server/.env`도 자동으로 무시됨
- MongoDB Atlas / Railway 대시보드 가입·설정처럼 브라우저 작업이 필요한 단계는 사용자가 직접 하거나, 사용자 동의 하에 claude-in-chrome으로 동행 진행한다 (계정 생성 자체를 에이전트가 임의로 자동화하지 않는다)

---

## Task 1: 백엔드 스캐폴드 (Express + Mongoose 헬스체크)

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/.env.example`

**Interfaces:**
- Produces: `GET /api/health` → `{ status: "ok", mongoConnected: boolean, timestamp: string }` (HTTP 200 항상, DB 연결 실패해도 서버는 계속 응답)
- Consumes 환경변수: `MONGODB_URI`, `FRONTEND_URL`, `PORT` (기본값 4000)

- [ ] **Step 1: `server/package.json` 작성**

```json
{
  "name": "create-club-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "mongoose": "^8.8.0"
  }
}
```

- [ ] **Step 2: `server/index.js` 작성**

```javascript
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL }));

app.get("/api/health", (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  res.json({
    status: "ok",
    mongoConnected,
    timestamp: new Date().toISOString(),
  });
});

async function start() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI가 설정되지 않았습니다. DB 없이 서버만 기동합니다.");
  } else {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log("MongoDB 연결 성공");
    } catch (err) {
      console.error("MongoDB 연결 실패:", err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
  });
}

start();
```

- [ ] **Step 3: `server/.env.example` 작성**

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/somit?retryWrites=true&w=majority
FRONTEND_URL=http://localhost:3000
PORT=4000
```

- [ ] **Step 4: 의존성 설치**

Run: `cd server && npm install`
Expected: `server/package-lock.json` 생성, 에러 없이 종료

- [ ] **Step 5: MONGODB_URI 없이 기동 확인 (DB 없어도 서버는 죽지 않아야 함)**

Run (in `server/`): `npm start`
Expected: 콘솔에 `MONGODB_URI가 설정되지 않았습니다...`와 `서버 실행 중: http://localhost:4000` 둘 다 출력. Ctrl+C로 종료.

- [ ] **Step 6: `/api/health` 응답 형태 확인**

Run: `npm start` (백그라운드) 후 새 터미널에서 `curl http://localhost:4000/api/health`
Expected: `{"status":"ok","mongoConnected":false,"timestamp":"..."}` — `mongoConnected`가 `false`인 것이 정상 (아직 DB 연결 전)

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json server/index.js server/.env.example
git commit -m "backend: Express+Mongoose 헬스체크 스캐폴드 추가"
```

---

## Task 2: MongoDB Atlas 클러스터 생성

**Files:** 없음 (외부 서비스 대시보드 작업)

**Interfaces:**
- Produces: `MONGODB_URI` 연결 문자열 (Task 3, 5에서 사용)

- [ ] **Step 1: Atlas 가입/로그인**

https://cloud.mongodb.com 에서 계정 없으면 가입 (GitHub 계정으로 가입 가능). 카드 등록 없이 Free Tier(M0) 사용 가능.
사용자가 직접 진행하거나, 원하면 claude-in-chrome으로 화면 보면서 같이 진행.

- [ ] **Step 2: M0 무료 클러스터 생성**

Organization/Project 생성 → "Create" → **M0 Free** 선택 → 리전은 아무 곳(가까운 곳, 예: AWS Seoul) → 클러스터 이름 예: `somit-cluster` → Create.

- [ ] **Step 3: Database User 생성**

Security → Database Access → Add New Database User → Username/Password 방식으로 생성 (비밀번호는 특수문자 `@`, `:`, `/` 피하기 — 연결 문자열에서 인코딩 문제 방지).

- [ ] **Step 4: Network Access 설정**

Security → Network Access → Add IP Address → **"Allow Access from Anywhere" (0.0.0.0/0)** 선택.
(Railway는 고정 IP가 아니라 매번 다른 아웃바운드 IP를 쓰므로, 학교 과제 스코프에서는 전체 허용이 실용적인 선택. 프로덕션이었다면 Private Endpoint를 검토했을 것.)

- [ ] **Step 5: 연결 문자열 확보**

Database → Connect → "Drivers" → Node.js 선택 → `mongodb+srv://...` 문자열 복사 → `<password>` 부분을 Step 3에서 만든 비밀번호로 교체 → DB 이름을 `/somit`으로 지정 (예: `.../somit?retryWrites=true&w=majority`).

- [ ] **Step 6: 로컬 `.env` 파일에 반영 (커밋 금지)**

`server/.env` 파일을 새로 만들어 (git-ignored) Step 5의 문자열을 `MONGODB_URI=`로 저장. `FRONTEND_URL=http://localhost:3000`, `PORT=4000`도 함께.

이 태스크는 커밋할 코드가 없음 — Task 3에서 실제 연결을 검증한다.

---

## Task 3: 로컬에서 백엔드 ↔ Atlas 연결 검증

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1의 `server/index.js`, Task 2의 `server/.env`

- [ ] **Step 1: 로컬 서버를 실제 Atlas 연결로 기동**

Run (in `server/`): `npm start`
Expected: 콘솔에 `MongoDB 연결 성공` 출력 (에러 없이)

- [ ] **Step 2: 헬스체크로 실제 DB 연결 확인**

Run: `curl http://localhost:4000/api/health`
Expected: `{"status":"ok","mongoConnected":true,"timestamp":"..."}` — `mongoConnected`가 `true`

- [ ] **Step 3: 문제 있으면 디버깅**

`mongoConnected: false`가 나오면: Atlas Network Access에 0.0.0.0/0이 저장됐는지, `.env`의 비밀번호에 특수문자가 URL 인코딩 안 된 건 아닌지, DB 이름 오타는 없는지 확인. 커밋할 코드 변경 없음.

(이 태스크는 로컬 검증이라 git 커밋 없음 — Task 1의 커밋에 이미 포함된 코드로 확인만 하는 단계)

---

## Task 4: 프론트엔드 시스템 상태 컴포넌트

**Files:**
- Create: `app/components/SystemStatus.tsx`
- Modify: `app/page.tsx:44-49`
- Create: `.env.example` (루트)
- Create: `.env.local` (루트, git-ignored)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_API_URL` 환경변수, Task 1의 `GET /api/health` 응답 형태 `{ status, mongoConnected, timestamp }`
- Produces: `<SystemStatus />` 컴포넌트 (props 없음, 내부에서 fetch)

- [ ] **Step 1: `app/components/SystemStatus.tsx` 작성**

```tsx
"use client";

import { useEffect, useState } from "react";

type HealthState =
  | { phase: "loading" }
  | { phase: "ok"; mongoConnected: boolean }
  | { phase: "error" };

export default function SystemStatus() {
  const [state, setState] = useState<HealthState>({ phase: "loading" });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setState({ phase: "error" });
      return;
    }

    let cancelled = false;

    fetch(`${apiUrl}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((data: { mongoConnected: boolean }) => {
        if (!cancelled) {
          setState({ phase: "ok", mongoConnected: data.mongoConnected });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state.phase === "loading"
      ? "연결 확인 중..."
      : state.phase === "error"
        ? "백엔드 연결 실패"
        : state.mongoConnected
          ? "백엔드 · DB 정상 연결"
          : "백엔드 연결됨 · DB 연결 안 됨";

  const dotColor =
    state.phase === "ok" && state.mongoConnected
      ? "bg-accent-2"
      : state.phase === "loading"
        ? "bg-muted"
        : "bg-accent";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-4 py-1.5 font-mono text-xs tracking-wide text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </div>
  );
}
```

- [ ] **Step 2: `app/page.tsx`에 컴포넌트 삽입**

`app/page.tsx` 상단에 import 추가:

```tsx
import SystemStatus from "./components/SystemStatus";
```

44번째 줄(구분선 `<div className="my-12 h-px w-24 ...`)과 46번째 줄(버전 정보) 사이, 즉 기존:

```tsx
        <div className="my-12 h-px w-24 bg-gradient-to-r from-transparent via-line to-transparent" />

        <div className="flex w-full items-center justify-between font-mono text-xs text-muted">
```

를 아래로 교체:

```tsx
        <div className="my-12 h-px w-24 bg-gradient-to-r from-transparent via-line to-transparent" />

        <SystemStatus />

        <div className="mt-10 flex w-full items-center justify-between font-mono text-xs text-muted">
```

- [ ] **Step 3: 루트 `.env.example` 작성**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 4: 루트 `.env.local` 작성 (git-ignored, 로컬 개발용)**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 5: 타입체크/린트 확인**

Run: `npm run lint`
Expected: 에러 없음 (경고는 무방)

- [ ] **Step 6: Commit**

```bash
git add app/components/SystemStatus.tsx app/page.tsx .env.example
git commit -m "frontend: 백엔드 헬스체크 상태 표시 컴포넌트 추가"
```

(`.env.local`은 `.gitignore`에 의해 자동 제외되므로 add 대상에서 빠짐 — `git status`로 확인)

---

## Task 5: 로컬 풀스택 검증 (프론트 + 백엔드 + Atlas)

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~4에서 만든 모든 것

- [ ] **Step 1: 백엔드 로컬 기동 (터미널 1)**

Run (in `server/`): `npm start`
Expected: `MongoDB 연결 성공`, `서버 실행 중: http://localhost:4000`

- [ ] **Step 2: 프론트엔드 로컬 기동 (터미널 2)**

Run (repo 루트): `npm run dev`
Expected: `http://localhost:3000`에서 Next.js dev 서버 기동

- [ ] **Step 3: 브라우저로 확인**

`http://localhost:3000` 접속.
Expected: "Hello, World." 아래에 "백엔드 · DB 정상 연결" 배지가 뜸 (처음 잠깐 "연결 확인 중..."이었다가 바뀜)

- [ ] **Step 4: 에러 케이스도 한번 확인**

터미널 1에서 백엔드를 Ctrl+C로 종료 → 브라우저 새로고침 → Expected: "백엔드 연결 실패" 배지로 바뀜. 확인 후 백엔드 다시 `npm start`로 재기동 (다음 태스크를 위해 계속 켜둘 필요는 없음).

이 태스크는 검증만 하는 단계라 커밋 없음.

---

## Task 6: Railway에 백엔드 배포 (GitHub 연동)

**Files:** 없음 (외부 서비스 대시보드 작업 + 코드는 이미 Task 1에서 커밋됨)

**Interfaces:**
- Produces: Railway 공개 URL (예: `https://xxxx.up.railway.app`) — Task 7에서 `NEXT_PUBLIC_API_URL`로 사용

- [ ] **Step 1: 지금까지의 커밋을 GitHub에 push**

Run: `git push origin main`
Expected: `hoi256678-cpu/createClub` 저장소의 `main`에 반영됨

- [ ] **Step 2: Railway 가입/로그인**

https://railway.app 에서 "Login with GitHub"로 가입 (계정 없음 — 새로 진행). 가입 시 결제 정보 요구 여부는 가입 화면에서 직접 확인 (정책이 바뀔 수 있음 — 요구하지 않는 플랜으로 진행). 사용자가 직접 하거나 claude-in-chrome으로 동행.

- [ ] **Step 3: 새 프로젝트 생성 및 GitHub 저장소 연결**

"New Project" → "Deploy from GitHub repo" → `hoi256678-cpu/createClub` 선택 → Railway가 GitHub App 권한 요청하면 승인.

- [ ] **Step 4: Root Directory를 `/server`로 지정**

생성된 서비스 → Settings → "Root Directory"에 `server` 입력 (Nixpacks가 `server/package.json`을 보고 Node 앱으로 자동 인식, Start Command는 `npm start`로 자동 감지됨).

- [ ] **Step 5: 환경변수 설정**

서비스 → Variables → 추가:
- `MONGODB_URI` = Task 2에서 확보한 연결 문자열
- `FRONTEND_URL` = 일단 `http://localhost:3000` (Task 7에서 실제 Vercel URL로 갱신 예정)
- `PORT`는 Railway가 자체적으로 주입하므로 설정하지 않음 (Express 코드가 `process.env.PORT`를 우선 사용하도록 이미 작성돼 있음)

- [ ] **Step 6: 배포 & Public URL 발급**

Deploy 완료 대기 → Settings → Networking → "Generate Domain" 클릭 → `https://xxxx.up.railway.app` 형태의 URL 확보.

- [ ] **Step 7: 배포된 헬스체크 검증**

Run: `curl https://<railway-url>/api/health`
Expected: `{"status":"ok","mongoConnected":true,"timestamp":"..."}`

커밋할 코드 변경 없음 (이미 Task 1에서 커밋됨) — 이 태스크는 배포 설정 자체가 산출물.

---

## Task 7: Vercel에 프론트엔드 배포 (GitHub 연동)

**Files:** 없음 (외부 서비스 대시보드 작업)

**Interfaces:**
- Consumes: Task 6의 Railway URL
- Produces: Vercel 공개 URL

- [ ] **Step 1: Vercel 대시보드에서 새 프로젝트 생성**

https://vercel.com/new → 이미 있는 Vercel 계정으로 로그인 → "Import Git Repository" → `hoi256678-cpu/createClub` 선택 (GitHub 연동 안 돼 있으면 먼저 GitHub App 권한 부여).

- [ ] **Step 2: 프로젝트 설정 확인**

Framework Preset: Next.js (자동 감지) / Root Directory: `.` (저장소 루트, `/server`가 아님 — 프론트엔드는 리포 루트에 있으므로 기본값 그대로 둠).

- [ ] **Step 3: 환경변수 설정**

"Environment Variables"에 추가:
- `NEXT_PUBLIC_API_URL` = Task 6에서 확보한 Railway URL (예: `https://xxxx.up.railway.app`, 끝에 슬래시 없이)

- [ ] **Step 4: Deploy**

"Deploy" 클릭 → 빌드 완료 대기 → 배포 URL 확보 (예: `https://createclub.vercel.app` 또는 `https://create-club-xxxx.vercel.app`).

- [ ] **Step 5: 배포된 프론트에서 상태 확인**

배포 URL을 브라우저로 접속.
Expected: 처음엔 CORS 때문에 "백엔드 연결 실패"로 뜰 수 있음 (Railway의 `FRONTEND_URL`이 아직 `localhost:3000`이라서) — 정상, Task 8에서 고침.

커밋할 코드 변경 없음.

---

## Task 8: CORS 마무리 + 최종 엔드투엔드 검증 + 산출물 기록

**Files:**
- Modify: `README.md`

**Interfaces:** 없음

- [ ] **Step 1: Railway의 `FRONTEND_URL`을 실제 Vercel URL로 갱신**

Railway 대시보드 → 백엔드 서비스 → Variables → `FRONTEND_URL`을 Task 7에서 확보한 Vercel URL로 수정 (예: `https://createclub.vercel.app`, 끝 슬래시 없이) → 저장하면 Railway가 자동 재배포.

- [ ] **Step 2: 재배포 완료 후 헬스체크 재확인**

Run: `curl https://<railway-url>/api/health`
Expected: 여전히 `{"status":"ok","mongoConnected":true,...}`

- [ ] **Step 3: Vercel URL을 브라우저로 재접속해 최종 확인**

Expected: "백엔드 · DB 정상 연결" 배지가 정상적으로 뜸 (CORS 에러 없음). 브라우저 개발자도구 Console에도 CORS 에러가 없는지 확인.

- [ ] **Step 4: `README.md`에 배포 정보 섹션 추가**

기존 `README.md` 맨 아래("## Deploy on Vercel" 섹션 다음)에 추가:

```markdown

## 배포 현황 (솜잇 과제 산출물)

- 프론트엔드 (Vercel): <Task 7에서 확보한 실제 URL>
- 백엔드 (Railway): <Task 6에서 확보한 실제 URL>
- DB: MongoDB Atlas M0 Free Tier (백엔드를 통해서만 접근, `/api/health`로 연결 상태 확인 가능)
```

(각 `<...>` 자리에는 실제 확보한 URL 문자열을 그대로 채워 넣는다 — placeholder로 커밋하지 않는다.)

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: 배포 URL(Vercel/Railway/Atlas) README에 기록"
git push origin main
```

- [ ] **Step 6: push가 각 서비스의 자동 재배포를 트리거하는지 확인**

Vercel/Railway 대시보드에서 방금 push한 커밋으로 새 배포가 시작되는지 확인 (README만 바뀌었으니 실패할 이유는 없음 — 이 확인 자체가 "git push만으로 자동 재배포"라는 스펙의 핵심 요구사항이 실제로 동작하는지 증명하는 마지막 검증).

---

## Self-Review

**Spec coverage:** 스펙의 아키텍처(3-tier, `/server` 서브폴더, GitHub 연동 자동배포), 컴포넌트(프론트 상태 섹션, 백엔드 헬스체크), 데이터 흐름, 에러 처리(백엔드 계속 기동/프론트 에러 배지), 테스트 전략(자동화 테스트 없이 수동 검증) 모두 Task 1~8에 반영됨. Out of scope로 명시된 매칭 기능/브랜딩/인증은 포함하지 않음.

**Placeholder scan:** 모든 코드 블록에 실제 내용 채움. Task 8의 README `<...>` 자리는 실행 시점에 실제 값으로 채우도록 명시(placeholder로 커밋 금지 지시 포함)했으므로 계획 문서 자체의 결함이 아님.

**Type consistency:** 백엔드 헬스체크 응답 형태 `{ status, mongoConnected, timestamp }` (Task 1)가 프론트 `SystemStatus.tsx`(Task 4)의 `data.mongoConnected` 접근과 일치. 환경변수 이름(`MONGODB_URI`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `PORT`)이 Task 1/2/4/6/7/8 전체에서 동일하게 사용됨.

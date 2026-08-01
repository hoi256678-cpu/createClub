# 회원가입/로그인 (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담사-내담자 매칭 앱의 첫 번째 수직 슬라이스인 회원가입/로그인을 프론트(Next.js)와 백엔드(Express) 양쪽에 구현하고, 기존 배포 파이프라인(Vercel/Railway/MongoDB Atlas)을 통해 실제로 배포·검증한다.

**Architecture:** 백엔드(`server/`)에 `User` Mongoose 모델, JWT 서명/검증 유틸, 인증 미들웨어, `/api/auth/*` 라우터(signup/login/logout/me)를 추가한다. 로그인 성공 시 JWT를 httpOnly 쿠키로 내려주고, 프론트는 모든 API 호출에 `credentials:'include'`를 사용해 이 쿠키를 주고받는다. 프론트에는 회원가입/로그인 페이지와, 홈페이지에 삽입할 로그인 상태 표시 컴포넌트를 추가한다.

**Tech Stack:** Express, Mongoose, bcryptjs, jsonwebtoken, cookie-parser (백엔드) / Next.js App Router, React (프론트) / node:test + supertest + mongodb-memory-server (백엔드 테스트)

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-08-01-auth-slice-design.md` (커밋 `67d0ccc`)
- 회원가입 필드는 이름/이메일/비밀번호/역할뿐 — 상담사·내담자 전용 프로필 필드(전공/학년/상담분야/자기소개, 연령대/고민카테고리)는 스키마에 optional로만 존재, 이번 슬라이스에서 입력 폼 없음
- 이메일 인증 없음. 가입 즉시 로그인 상태
- 비밀번호 최소 4자, 그 외 제약 없음
- 인증 토큰은 httpOnly + Secure + SameSite=None 쿠키로 전달 (프론트 Vercel ↔ 백엔드 Railway가 서로 다른 도메인)
- 로그인 실패 시(이메일 없음/비밀번호 틀림) 항상 동일한 메시지 `"이메일 또는 비밀번호가 올바르지 않습니다"` — 어느 쪽이 틀렸는지 구분해서 알려주지 않는다
- **백엔드 라우트만 자동화 테스트(node:test + supertest)로 커버한다 — 프론트엔드는 자동화 테스트 없음(수동 검증), 스펙에서 명시적으로 결정된 범위**
- 시크릿(`JWT_SECRET`, `MONGODB_URI`)은 절대 git에 커밋하지 않는다 — 루트 `.gitignore`의 `.env*` 규칙이 `server/.env`도 커버함
- 쿠키 이름은 정확히 `somit_token`

---

## Task 1: User 모델 + 백엔드 의존성

**Files:**
- Create: `server/models/User.js`
- Modify: `server/package.json` (전체 교체)
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `server/models/User.js`의 default export `User` — Mongoose 모델. 필드: `name(String, required)`, `email(String, required, unique, lowercase)`, `passwordHash(String, required)`, `role(String, required, enum:['counselor','client'])`, `counselorProfile{major,year,specialties:[String],bio}`, `clientProfile{ageGroup,concerns:[String]}`, `createdAt(Date, default now)`

- [ ] **Step 1: `server/models/User.js` 작성**

```javascript
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ["counselor", "client"] },
  counselorProfile: {
    major: String,
    year: String,
    specialties: [String],
    bio: String,
  },
  clientProfile: {
    ageGroup: String,
    concerns: [String],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
```

- [ ] **Step 2: `server/package.json` 교체**

```json
{
  "name": "create-club-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.8.0"
  },
  "devDependencies": {
    "mongodb-memory-server": "^10.1.2",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 3: `server/.env.example`에 `JWT_SECRET` 추가**

기존 `server/.env.example` 맨 아래에 한 줄 추가:

```
JWT_SECRET=<openssl rand -hex 32 등으로 생성한 랜덤 문자열>
```

- [ ] **Step 4: 의존성 설치**

Run: `cd server && npm install`
Expected: 에러 없이 종료, `server/node_modules`에 `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `mongodb-memory-server`, `supertest` 생성됨

- [ ] **Step 5: 모델 문법 확인**

Run: `cd server && node -e "require('./models/User'); console.log('OK')"`
Expected: `OK` 출력 (require 에러 없음 — 실제 DB 연결은 아직 안 함)

- [ ] **Step 6: Commit**

```bash
git add server/models/User.js server/package.json server/package-lock.json server/.env.example
git commit -m "backend: User 모델 및 인증 관련 의존성 추가"
```

---

## Task 2: JWT 토큰 유틸

**Files:**
- Create: `server/lib/token.js`
- Test: `server/tests/token.test.js`

**Interfaces:**
- Consumes: `process.env.JWT_SECRET`
- Produces: `signToken(payload: object): string`, `verifyToken(token: string): object` (payload + jwt의 `iat`/`exp` 포함, 실패 시 throw), `COOKIE_NAME: "somit_token"`, `COOKIE_OPTIONS: { httpOnly:true, secure:true, sameSite:"none", maxAge:604800000, path:"/" }`

- [ ] **Step 1: 실패하는 테스트 작성 — `server/tests/token.test.js`**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
const { signToken, verifyToken } = require("../lib/token");

test("signToken/verifyToken은 페이로드를 왕복시킨다", () => {
  const token = signToken({ id: "abc123", role: "counselor" });
  const decoded = verifyToken(token);

  assert.equal(decoded.id, "abc123");
  assert.equal(decoded.role, "counselor");
});

test("잘못된 토큰을 verifyToken에 넘기면 에러를 던진다", () => {
  assert.throws(() => verifyToken("not-a-real-token"));
});

test("JWT_SECRET이 없으면 signToken이 에러를 던진다", () => {
  const original = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => signToken({ id: "x" }));
  } finally {
    process.env.JWT_SECRET = original;
  }
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && node --test tests/token.test.js`
Expected: FAIL — `Cannot find module '../lib/token'`

- [ ] **Step 3: `server/lib/token.js` 작성**

```javascript
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "somit_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET이 설정되지 않았습니다.");
  }
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken, COOKIE_NAME, COOKIE_OPTIONS };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && node --test tests/token.test.js`
Expected: PASS, 3/3 테스트 통과

- [ ] **Step 5: Commit**

```bash
git add server/lib/token.js server/tests/token.test.js
git commit -m "backend: JWT 토큰 유틸 추가"
```

---

## Task 3: 인증 미들웨어

**Files:**
- Create: `server/middleware/auth.js`
- Test: `server/tests/auth-middleware.test.js`

**Interfaces:**
- Consumes: Task 2의 `verifyToken(token)`, `COOKIE_NAME`
- Produces: `requireAuth(req, res, next)` — `req.cookies[COOKIE_NAME]`를 검증해 성공 시 `req.user = {id, role, iat, exp}`를 채우고 `next()` 호출, 실패 시 `res.status(401).json({error:"로그인이 필요합니다"})`

- [ ] **Step 1: 실패하는 테스트 작성 — `server/tests/auth-middleware.test.js`**

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
const { requireAuth } = require("../middleware/auth");
const { signToken, COOKIE_NAME } = require("../lib/token");

test("유효한 쿠키가 있으면 req.user를 설정하고 next를 호출한다", () => {
  const token = signToken({ id: "abc123", role: "counselor" });
  const req = { cookies: { [COOKIE_NAME]: token } };
  let nextCalled = false;
  const res = {};

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.id, "abc123");
  assert.equal(req.user.role, "counselor");
});

test("쿠키가 없으면 401을 반환하고 next를 호출하지 않는다", () => {
  const req = { cookies: {} };
  let statusCode;
  let body;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { error: "로그인이 필요합니다" });
});

test("잘못된 토큰이면 401을 반환한다", () => {
  const req = { cookies: { [COOKIE_NAME]: "invalid-token" } };
  let statusCode;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  requireAuth(req, res, () => {});

  assert.equal(statusCode, 401);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && node --test tests/auth-middleware.test.js`
Expected: FAIL — `Cannot find module '../middleware/auth'`

- [ ] **Step 3: `server/middleware/auth.js` 작성**

```javascript
const { verifyToken, COOKIE_NAME } = require("../lib/token");

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
}

module.exports = { requireAuth };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && node --test tests/auth-middleware.test.js`
Expected: PASS, 3/3 테스트 통과

- [ ] **Step 5: Commit**

```bash
git add server/middleware/auth.js server/tests/auth-middleware.test.js
git commit -m "backend: 인증 미들웨어(requireAuth) 추가"
```

---

## Task 4: auth 라우터 + index.js 통합

**Files:**
- Create: `server/routes/auth.js`
- Modify: `server/index.js` (전체 교체)
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `User` 모델, Task 2의 `signToken`/`COOKIE_NAME`/`COOKIE_OPTIONS`, Task 3의 `requireAuth`
- Produces: Express 라우터(`/api/auth` 마운트) — `POST /signup`(201, `{name,role}`, 실패시 400/409), `POST /login`(200, `{name,role}`, 실패시 400/401), `POST /logout`(200, `{}`), `GET /me`(200 `{name,role}`, 실패시 401). `server/index.js`는 이제 `module.exports = app`으로 앱 객체를 내보내고, `require.main === module`일 때만 `start()`를 실행(테스트에서 앱만 import해서 실제 포트를 열지 않고 쓸 수 있게)

- [ ] **Step 1: 실패하는 통합 테스트 작성 — `server/tests/auth-routes.test.js`**

```javascript
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test("회원가입 성공 시 201과 쿠키를 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
  assert.ok(res.headers["set-cookie"][0].includes("somit_token="));
});

test("이미 가입된 이메일로 회원가입하면 409를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "다른사람", email: "hong@test.com", password: "5678", role: "client" });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "이미 가입된 이메일입니다");
});

test("비밀번호가 4자 미만이면 400을 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "short@test.com", password: "123", role: "client" });

  assert.equal(res.status, 400);
});

test("로그인 성공 시 200과 쿠키를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "1234" });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
  assert.ok(res.headers["set-cookie"][0].includes("somit_token="));
});

test("잘못된 비밀번호로 로그인하면 401과 통일된 메시지를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "wrong" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, "이메일 또는 비밀번호가 올바르지 않습니다");
});

test("존재하지 않는 이메일로 로그인해도 동일한 401 메시지를 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "nobody@test.com", password: "whatever" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, "이메일 또는 비밀번호가 올바르지 않습니다");
});

test("로그인한 상태에서 /me는 사용자 정보를 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.get("/api/auth/me");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
});

test("로그인하지 않은 상태에서 /me는 401을 반환한다", async () => {
  const res = await request(app).get("/api/auth/me");
  assert.equal(res.status, 401);
});

test("로그아웃 후에는 /me가 다시 401을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  await agent.post("/api/auth/logout");
  const res = await agent.get("/api/auth/me");

  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && node --test tests/auth-routes.test.js`
Expected: FAIL — `Cannot find module '../routes/auth'` (mongodb-memory-server가 처음 실행되면 MongoDB 바이너리를 다운로드하느라 첫 실행에 30~60초 정도 걸릴 수 있음 — 정상)

- [ ] **Step 3: `server/routes/auth.js` 작성**

```javascript
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken, COOKIE_NAME, COOKIE_OPTIONS } = require("../lib/token");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ error: "이름, 이메일, 비밀번호, 역할을 모두 입력해주세요" });
  }
  if (!["counselor", "client"].includes(role)) {
    return res
      .status(400)
      .json({ error: "역할은 counselor 또는 client여야 합니다" });
  }
  if (password.length < 4) {
    return res
      .status(400)
      .json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: "이미 가입된 이메일입니다" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role });

  const token = signToken({ id: user._id.toString(), role: user.role });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.status(201).json({ name: user.name, role: user.role });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "이메일과 비밀번호를 입력해주세요" });
  }

  const genericError = { error: "이메일 또는 비밀번호가 올바르지 않습니다" };
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json(genericError);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json(genericError);
  }

  const token = signToken({ id: user._id.toString(), role: user.role });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ name: user.name, role: user.role });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.json({});
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  res.json({ name: user.name, role: user.role });
});

module.exports = router;
```

- [ ] **Step 4: `server/index.js` 전체 교체**

```javascript
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const authRouter = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  res.json({
    status: "ok",
    mongoConnected,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);

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

if (require.main === module) {
  start();
}

module.exports = app;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && node --test tests/auth-routes.test.js`
Expected: PASS, 9/9 테스트 통과

- [ ] **Step 6: 전체 백엔드 테스트 스위트 확인**

Run: `cd server && npm test`
Expected: `tests/token.test.js`, `tests/auth-middleware.test.js`, `tests/auth-routes.test.js` 전부 PASS (총 15개 테스트)

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js server/index.js server/tests/auth-routes.test.js
git commit -m "backend: auth 라우터(signup/login/logout/me) 추가 및 index.js 통합"
```

---

## Task 5: 프론트 공통 fetch 래퍼 + 로그인 상태 컴포넌트

**Files:**
- Create: `lib/api.ts`
- Create: `app/components/AuthStatus.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `apiFetch(path: string, options?: RequestInit): Promise<Response>` at `lib/api.ts` (항상 `credentials:'include'` 포함, `NEXT_PUBLIC_API_URL` 접두사) — Task 6, 7이 이걸 사용
- Produces: `<AuthStatus />` 컴포넌트 (props 없음) — 로그인 상태를 `GET /api/auth/me`로 확인해 표시, 로그아웃 버튼 포함

- [ ] **Step 1: `lib/api.ts` 작성**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function apiFetch(path: string, options: RequestInit = {}) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되지 않았습니다");
  }
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
```

- [ ] **Step 2: `app/components/AuthStatus.tsx` 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | { phase: "in"; name: string; role: "counselor" | "client" };

export default function AuthStatus() {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState({ phase: "out" });
          return;
        }
        const data = (await res.json()) as {
          name: string;
          role: "counselor" | "client";
        };
        if (!cancelled) {
          setState({ phase: "in", name: data.name, role: data.role });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "out" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setState({ phase: "out" });
  }

  if (state.phase === "loading") {
    return null;
  }

  if (state.phase === "in") {
    return (
      <div className="mt-6 flex items-center gap-3 font-mono text-xs text-muted">
        <span>{state.name}님 환영합니다</span>
        <button
          onClick={handleLogout}
          className="rounded-full border border-line px-3 py-1 text-muted transition-colors hover:border-accent hover:text-paper"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-3 font-mono text-xs text-muted">
      <Link href="/login" className="hover:text-paper">
        로그인
      </Link>
      <span>·</span>
      <Link href="/signup" className="hover:text-paper">
        회원가입
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: `app/page.tsx`에 `AuthStatus` 삽입**

기존:
```tsx
        <SystemStatus />

        <div className="mt-10 flex w-full items-center justify-between font-mono text-xs text-muted">
```

를 아래로 교체 (import도 추가):
```tsx
        <SystemStatus />

        <AuthStatus />

        <div className="mt-10 flex w-full items-center justify-between font-mono text-xs text-muted">
```

파일 상단 import 블록:
```tsx
import SystemStatus from "./components/SystemStatus";
import AuthStatus from "./components/AuthStatus";
```

- [ ] **Step 4: 린트 확인**

Run: `npm run lint`
Expected: 에러 없음 (`lib/api.ts`, `app/components/AuthStatus.tsx` 포함해서)

- [ ] **Step 5: Commit**

```bash
git add lib/api.ts app/components/AuthStatus.tsx app/page.tsx
git commit -m "frontend: 공통 API 래퍼 및 로그인 상태 표시 컴포넌트 추가"
```

---

## Task 6: 회원가입 페이지

**Files:**
- Create: `app/signup/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `apiFetch`
- Produces: `/signup` 라우트 — 성공 시 `router.push("/")`

- [ ] **Step 1: `app/signup/page.tsx` 작성**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-display text-3xl font-medium text-paper">회원가입</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRole("client")}
            className={`flex-1 rounded-lg border px-4 py-2 font-mono text-xs transition-colors ${
              role === "client" ? "border-accent text-paper" : "border-line text-muted"
            }`}
          >
            내담자
          </button>
          <button
            type="button"
            onClick={() => setRole("counselor")}
            className={`flex-1 rounded-lg border px-4 py-2 font-mono text-xs transition-colors ${
              role === "counselor" ? "border-accent text-paper" : "border-line text-muted"
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
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />
        <input
          type="password"
          placeholder="비밀번호 (4자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />

        {error && <p className="font-mono text-xs text-accent">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 font-mono text-xs text-ink disabled:opacity-50"
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/signup/page.tsx
git commit -m "frontend: 회원가입 페이지 추가"
```

---

## Task 7: 로그인 페이지

**Files:**
- Create: `app/login/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `apiFetch`
- Produces: `/login` 라우트 — 성공 시 `router.push("/")`

- [ ] **Step 1: `app/login/page.tsx` 작성**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-display text-3xl font-medium text-paper">로그인</h1>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />

        {error && <p className="font-mono text-xs text-accent">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 font-mono text-xs text-ink disabled:opacity-50"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "frontend: 로그인 페이지 추가"
```

---

## Task 8: 로컬 풀스택 검증 + 배포 + 프로덕션 검증

**Files:** 없음 (검증 및 외부 서비스 설정)

**Interfaces:** 없음

- [ ] **Step 1: 로컬 `server/.env` 작성 (git-ignored, 커밋 금지)**

`server/.env`가 없으면 새로 생성 (이전 배포 세션에서 쓰던 워크트리와 함께 삭제되었을 수 있음):

```
MONGODB_URI=<이전 배포 세션에서 검증된 이 PC용 mongodb:// 표준 형식 연결 문자열 — mongodb+srv:// 형식은 이 PC의 Node DNS 리졸버 문제로 동작 안 함>
FRONTEND_URL=http://localhost:3000
PORT=4000
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 로 생성>
```

- [ ] **Step 2: 로컬 백엔드 기동**

Run: `cd server && npm start`
Expected: `MongoDB 연결 성공`, `서버 실행 중: http://localhost:4000`

- [ ] **Step 3: curl로 회원가입/로그인/me/로그아웃 흐름 확인**

```bash
curl -c /tmp/cookies.txt -s -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트","email":"test@example.com","password":"1234","role":"client"}'
# Expected: {"name":"테스트","role":"client"}

curl -b /tmp/cookies.txt -s http://localhost:4000/api/auth/me
# Expected: {"name":"테스트","role":"client"}

curl -b /tmp/cookies.txt -s -X POST http://localhost:4000/api/auth/logout
curl -b /tmp/cookies.txt -s http://localhost:4000/api/auth/me
# Expected: {"error":"로그인이 필요합니다"}
```

- [ ] **Step 4: 프론트 로컬 기동 후 브라우저로 실제 플로우 확인**

Run: `npm run dev` (repo 루트, 별도 터미널)
`.env.local`에 `NEXT_PUBLIC_API_URL=http://localhost:4000` 있는지 확인 (Task 4 계획의 배포 파이프라인 슬라이스에서 이미 만들어져 있어야 함)

브라우저로 `http://localhost:3000` 접속 → `/signup`에서 회원가입 → 홈으로 리다이렉트되고 "OO님 환영합니다" 표시 확인 → 로그아웃 → 로그인/회원가입 링크로 바뀌는지 확인 → `/login`에서 방금 만든 계정으로 재로그인 확인

- [ ] **Step 5: Railway에 `JWT_SECRET` 환경변수 추가**

Railway 대시보드 → createClub 서비스 → Variables → `JWT_SECRET` 추가 (Step 1과 같은 값을 써도 되고, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`로 새로 생성해도 됨 — 저장하면 자동 재배포됨)

- [ ] **Step 6: main에 push하여 자동 배포 트리거**

```bash
git push origin main
```

Expected: Railway와 Vercel 모두 새 커밋으로 자동 재배포 시작 (기존 배포 파이프라인이 이미 두 서비스 모두 `main`을 추적하도록 설정되어 있음)

- [ ] **Step 7: 배포된 프로덕션에서 최종 검증**

```bash
curl -c /tmp/prod-cookies.txt -s -X POST https://createclub-production.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"프로덕션테스트","email":"prod-test@example.com","password":"1234","role":"client"}'
# Expected: {"name":"프로덕션테스트","role":"client"}
```

`https://create-club-5kro.vercel.app`을 브라우저로 열어 회원가입/로그인/로그아웃이 실제로 동작하는지 확인. 브라우저 콘솔에 CORS 에러 없는지도 확인.

이 태스크는 검증/배포 설정이 산출물이라 커밋할 코드 변경은 없음(이미 Task 1~7에서 커밋됨).

---

## Self-Review

**Spec coverage:** 스펙의 결정 사항(최소 필드 회원가입, 이메일 인증 없음, 비밀번호 4자, httpOnly/Secure/SameSite=None 쿠키, 통일된 로그인 실패 메시지, 로그인 후 홈 화면 반영, 백엔드만 자동화 테스트) 모두 Task 1~8에 반영됨. Out of scope(상담사 리스트, 매칭 신청, 프로필 상세 입력, 이메일 인증/비밀번호 재설정/소셜 로그인)는 포함하지 않음.

**Placeholder scan:** 모든 코드 블록에 실제 내용을 채움. Task 8의 `server/.env` 값은 실행 시점에 실제 값으로 채우도록 명시(placeholder 커밋 금지 지시 포함)했으므로 계획 문서 자체의 결함이 아님.

**Type consistency:** 백엔드 응답 형태(`{name, role}` 성공 시, `{error}` 실패 시)가 Task 4의 라우터와 Task 5~7의 프론트 코드(`data.error`, `data.name`, `data.role` 접근)에서 일관됨. 쿠키 이름 `somit_token`이 Task 2/3/4 전체에서 `COOKIE_NAME` 상수로 일관되게 사용됨. `apiFetch` 시그니처가 Task 5에서 정의된 그대로 Task 6/7에서 동일하게 사용됨.

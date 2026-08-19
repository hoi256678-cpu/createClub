# 관리자 페이지(코어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 로그인과 사용자/커뮤니티/신고/상담사 인증 관리 기능을 갖춘 관리자 페이지를 만든다.

**Architecture:** 기존 `User.role`에 `"admin"`을 추가하고 기존 JWT 쿠키 인증을 그대로 재사용한다. 백엔드에 `requireAdmin` 미들웨어와 `/api/admin/*` 라우트를 신규 추가하고, 프론트엔드에 `(shell)` 밖의 독립된 `/admin` 라우트 그룹을 신규 추가한다. 관리자 계정은 회원가입으로 만들 수 없고 1회성 스크립트로 기존 계정을 승격시킨다.

**Tech Stack:** Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4 (프론트), Express + Mongoose (백엔드), `mongodb-memory-server` + `supertest` + Node 내장 `node:test` (백엔드 테스트).

**Spec:** `docs/superpowers/specs/2026-08-20-admin-panel-design.md`

## Global Constraints

- 관리자 계정은 `/api/auth/signup`으로 만들 수 없다 (역할은 `counselor`/`client`만 계속 허용).
- `/api/admin/*`의 모든 라우트는 `requireAuth, requireAdmin` 순서로 체이닝한다.
- 정지(`suspended: true`)된 계정은 로그인만 막는다 (기존 세션 강제 종료는 이번 범위 아님).
- 상담사 인증은 "승인"만 있고 "거절" 액션은 없다 (승인 안 하면 대기 상태로 남음).
- 프론트엔드는 이 프로젝트에 테스트 러너가 없으므로(백엔드만 `node --test` 보유) 타입체크(`npx tsc --noEmit -p .`) + 린트(`npx eslint <파일>`) + 빌드(`npm run build`)로 검증한다. 백엔드는 TDD로 작성한다.
- 커밋은 각 태스크 완료 시 바로 만든다. `main`에 직접 커밋하는 게 이 프로젝트의 방식이지만, 이 실행 계획 자체는 태스크 단위로 커밋만 하고 배포/푸시는 사용자가 전체 플랜 완료 후 한 번에 판단한다 (기존 세션에서 반복된 "커밋→푸시→배포확인" 루프를 매 태스크마다 돌리지 않기 위함 — 실행자는 배포하지 말 것).

---

## Task 1: 관리자 기반 — User 모델, requireAdmin 미들웨어, 사용자 관리 라우트

**Files:**
- Modify: `server/models/User.js`
- Modify: `server/middleware/auth.js`
- Create: `server/routes/admin.js`
- Modify: `server/index.js`
- Test: `server/tests/admin-routes.test.js`

**Interfaces:**
- Produces: `requireAdmin(req, res, next)` 미들웨어 (`server/middleware/auth.js`에서 export). `req.user.role !== "admin"`이면 403.
- Produces: `GET /api/admin/users` (`?role=` 필터 가능), `POST /api/admin/users/:id/suspend` (토글, 응답 `{ suspended }`)
- Produces: `server/tests/admin-routes.test.js`의 `createAdmin()`, `adminCookie(admin)` 헬퍼 — 이후 태스크(2~4)의 테스트에서도 이 파일에 이어서 재사용한다.

- [ ] **Step 1: User 모델에 admin 역할과 suspended 필드 추가**

`server/models/User.js`에서 `role`과 `passwordHash` 사이(또는 바로 아래)에 있는 필드를 수정:

```js
  role: { type: String, required: true, enum: ["counselor", "client", "admin"] },
  suspended: { type: Boolean, default: false },
```

(`role` 필드를 이 줄로 교체하고, `suspended` 필드를 바로 아래에 새로 추가한다.)

- [ ] **Step 2: requireAdmin 미들웨어 추가**

`server/middleware/auth.js`의 `optionalAuth` 함수 뒤, `module.exports` 앞에 추가:

```js
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "관리자만 접근할 수 있어요" });
  }
  next();
}
```

`module.exports` 줄을 다음으로 교체:

```js
module.exports = { requireAuth, optionalAuth, requireAdmin };
```

- [ ] **Step 3: 실패하는 테스트 작성 (사용자 목록/정지 토글)**

`server/tests/admin-routes.test.js` 새로 작성:

```js
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;
let User;
let signToken;
let COOKIE_NAME;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  ({ signToken, COOKIE_NAME } = require("../lib/token"));
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function createAdmin(overrides = {}) {
  return User.create({
    name: "관리자",
    email: overrides.email ?? "admin@test.com",
    passwordHash: "x",
    role: "admin",
  });
}

function adminCookie(admin) {
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  return `${COOKIE_NAME}=${token}`;
}

async function signupClient(agent, overrides = {}) {
  const payload = {
    name: "고민청소년",
    email: overrides.email ?? "client@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("비로그인 상태로 사용자 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/users");
  assert.equal(res.status, 401);
});

test("admin이 아닌 로그인 사용자가 사용자 목록을 조회하면 403을 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent.get("/api/admin/users");
  assert.equal(res.status, 403);
});

test("admin은 전체 사용자 목록을 조회할 수 있고 passwordHash는 없다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app).get("/api/admin/users").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.ok(res.body.every((u) => u.passwordHash === undefined));
  const client = res.body.find((u) => u.email === "c1@test.com");
  assert.equal(client.role, "client");
  assert.equal(client.suspended, false);
});

test("role 쿼리로 사용자 목록을 필터링할 수 있다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app)
    .get("/api/admin/users?role=client")
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].email, "c1@test.com");
});

test("admin이 사용자를 정지시키면 suspended가 true가 되고, 다시 누르면 false로 돌아간다", async () => {
  const admin = await createAdmin();
  const client = await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const suspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(suspendRes.status, 200);
  assert.deepEqual(suspendRes.body, { suspended: true });

  const unsuspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.deepEqual(unsuspendRes.body, { suspended: false });
});

test("존재하지 않는 사용자를 정지시키면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/users/${missingId}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 4: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 라우트가 없어서 전부 404로 실패 (401/403 기대했지만 404가 나옴)

- [ ] **Step 5: admin.js 라우트 작성 및 index.js에 마운트**

`server/routes/admin.js` 새로 작성:

```js
const express = require("express");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    suspended: !!user.suspended,
    createdAt: user.createdAt,
  };
}

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json(users.map(serializeUser));
  } catch (err) {
    console.error("사용자 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/users/:id/suspend", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없어요" });
    }
    user.suspended = !user.suspended;
    await user.save();
    res.json({ suspended: user.suspended });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "사용자를 찾을 수 없어요" });
    }
    console.error("사용자 정지 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

`server/index.js`에서 다른 라우터 require 아래에 추가:

```js
const adminRouter = require("./routes/admin");
```

`app.use("/api/test", testRouter);` 바로 아래에 추가:

```js
app.use("/api/admin", adminRouter);
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 7: 전체 백엔드 테스트 스위트 실행 (회귀 확인)**

Run: `cd server && npm test`
Expected: 기존 테스트 포함 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add server/models/User.js server/middleware/auth.js server/routes/admin.js server/index.js server/tests/admin-routes.test.js
git commit -m "feat: 관리자 기반 추가 - User admin 역할, requireAdmin, 사용자 관리 API"
```

---

## Task 2: 관리자 — 커뮤니티 관리 (게시글/댓글 삭제)

**Files:**
- Modify: `server/routes/admin.js`
- Test: `server/tests/admin-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `createAdmin()`, `adminCookie(admin)` 테스트 헬퍼
- Produces: `GET /api/admin/posts` (댓글 포함), `DELETE /api/admin/posts/:id`, `DELETE /api/admin/posts/:id/comments/:commentId`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/admin-routes.test.js` 맨 위 import 구역에 `Post` 모델 require 추가:

```js
const Post = require("../models/Post");
```

(파일 상단, `let COOKIE_NAME;` 아래 아무 곳에 추가해도 된다.)

파일 끝에 이어서 추가:

```js
async function createPost(overrides = {}) {
  const author =
    overrides.authorId ??
    (await User.create({ name: "글쓴이", email: "author@test.com", passwordHash: "x", role: "client" }))._id;
  return Post.create({
    author,
    tag: "고민",
    title: overrides.title ?? "제목",
    body: overrides.body ?? "내용",
    ...overrides.rest,
  });
}

test("비로그인 상태로 관리자 게시글 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/posts");
  assert.equal(res.status, 401);
});

test("admin은 전체 게시글 목록을 댓글과 함께 조회할 수 있다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "댓글입니다" });
  await post.save();

  const res = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "제목");
  assert.equal(res.body[0].comments.length, 1);
  assert.equal(res.body[0].comments[0].text, "댓글입니다");
});

test("admin이 게시글을 삭제하면 목록에서 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(listRes.body.length, 0);
});

test("존재하지 않는 게시글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .delete(`/api/admin/posts/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("admin이 댓글 하나를 삭제하면 게시글에는 남고 그 댓글만 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "지울 댓글" });
  post.comments.push({ author: commenter._id, text: "남길 댓글" });
  await post.save();
  const toDelete = post.comments[0]._id.toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${toDelete}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const updated = await Post.findById(post._id);
  assert.equal(updated.comments.length, 1);
  assert.equal(updated.comments[0].text, "남길 댓글");
});

test("존재하지 않는 댓글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const missingCommentId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${missingCommentId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 새로 추가한 6개 테스트가 404(라우트 없음)로 실패

- [ ] **Step 3: admin.js에 게시글/댓글 관리 라우트 추가**

`server/routes/admin.js` 상단 require에 `Post` 추가:

```js
const Post = require("../models/Post");
```

`module.exports = router;` 바로 위에 추가:

```js
function serializeAdminComment(comment) {
  return { id: comment._id.toString(), authorId: comment.author.toString(), text: comment.text, createdAt: comment.createdAt };
}

function serializeAdminPost(post) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorId: post.author.toString(),
    createdAt: post.createdAt,
    comments: post.comments.map(serializeAdminComment),
  };
}

router.get("/posts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts.map(serializeAdminPost));
  } catch (err) {
    console.error("관리자 게시글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/posts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/posts/:id/comments/:commentId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: "댓글을 찾을 수 없어요" });
    }
    comment.deleteOne();
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("댓글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 5: 전체 백엔드 테스트 스위트 실행**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add server/routes/admin.js server/tests/admin-routes.test.js
git commit -m "feat: 관리자 게시글/댓글 삭제 API 추가"
```

---

## Task 3: 관리자 — 상담 신고 처리

**Files:**
- Modify: `server/routes/admin.js`
- Test: `server/tests/admin-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `createAdmin()`, `adminCookie(admin)`
- Produces: `GET /api/admin/reports` (`?status=` 필터 가능), `POST /api/admin/reports/:id/review`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/admin-routes.test.js` 상단에 `Report`, `ChatRoom` require 추가:

```js
const Report = require("../models/Report");
const ChatRoom = require("../models/ChatRoom");
```

파일 끝에 이어서 추가:

```js
async function createReport(overrides = {}) {
  const reporter = await User.create({ name: "신고자", email: overrides.reporterEmail ?? "reporter@test.com", passwordHash: "x", role: "client" });
  const counselor = await User.create({ name: "상담사", email: overrides.counselorEmail ?? "reported@test.com", passwordHash: "x", role: "counselor" });
  const room = await ChatRoom.create({ client: reporter._id, counselor: counselor._id, status: "reported" });
  return Report.create({
    reporter: reporter._id,
    room: room._id,
    counselor: counselor._id,
    reason: overrides.reason ?? "부적절한 발언",
    status: overrides.status ?? "open",
  });
}

test("비로그인 상태로 신고 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/reports");
  assert.equal(res.status, 401);
});

test("admin은 신고 목록을 조회할 수 있다", async () => {
  const admin = await createAdmin();
  await createReport();

  const res = await request(app).get("/api/admin/reports").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].reason, "부적절한 발언");
  assert.equal(res.body[0].status, "open");
  assert.equal(res.body[0].reporterName, "신고자");
  assert.equal(res.body[0].counselorName, "상담사");
});

test("status 쿼리로 신고 목록을 필터링할 수 있다", async () => {
  const admin = await createAdmin();
  await createReport({ reporterEmail: "r1@test.com", counselorEmail: "c1@test.com", status: "open" });
  await createReport({ reporterEmail: "r2@test.com", counselorEmail: "c2@test.com", status: "reviewed" });

  const res = await request(app).get("/api/admin/reports?status=open").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "open");
});

test("admin이 신고를 처리 완료로 표시하면 status가 reviewed로 바뀐다", async () => {
  const admin = await createAdmin();
  const report = await createReport();

  const res = await request(app)
    .post(`/api/admin/reports/${report._id}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "reviewed");

  const updated = await Report.findById(report._id);
  assert.equal(updated.status, "reviewed");
});

test("존재하지 않는 신고를 처리하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/reports/${missingId}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 새로 추가한 5개 테스트가 404로 실패

- [ ] **Step 3: admin.js에 신고 처리 라우트 추가**

`server/routes/admin.js` 상단 require에 추가:

```js
const Report = require("../models/Report");
```

`module.exports = router;` 바로 위에 추가:

```js
function serializeReport(report) {
  return {
    id: report._id.toString(),
    reporterName: report.reporter.name,
    counselorName: report.counselor.name,
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt,
  };
}

router.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate("reporter", "name")
      .populate("counselor", "name");
    res.json(reports.map(serializeReport));
  } catch (err) {
    console.error("신고 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/reports/:id/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    report.status = "reviewed";
    await report.save();
    res.json({ status: report.status });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    console.error("신고 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 5: 전체 백엔드 테스트 스위트 실행**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add server/routes/admin.js server/tests/admin-routes.test.js
git commit -m "feat: 관리자 상담 신고 처리 API 추가"
```

---

## Task 4: 관리자 — 상담사 인증 승인 플로우

**중요 컨텍스트:** `POST /api/counselors/register`는 지금 신규 등록과 "이미 승인된 프로필 수정"을 같은 라우트로 처리한다 (`server/routes/counseling.js:63-112`). 단순히 `verified = true`를 `verified = false`로 바꾸면, 이미 승인된 상담사가 프로필을 수정할 때마다 매번 미승인 상태로 되돌아가는 회귀가 생긴다. 그래서 "이미 승인된 상태면 그대로 유지, 아니면(신규/미승인) 대기 상태로 시작"하도록 조건부로 고친다.

**Files:**
- Modify: `server/routes/counseling.js`
- Modify: `server/routes/admin.js`
- Test: `server/tests/counseling-routes.test.js`
- Test: `server/tests/admin-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `createAdmin()`, `adminCookie(admin)`
- Produces: `GET /api/admin/counselors/pending`, `POST /api/admin/counselors/:id/approve`
- Produces: `POST /counselors/register` 응답에 실제 `verified` 값 포함 (기존엔 하드코딩된 `true`)

- [ ] **Step 1: counseling.js 등록 플로우에 대한 실패하는 테스트 작성**

`server/tests/counseling-routes.test.js`에 이미 있는 `createFreshCounselor(overrides)`와 `counselorCookie(counselor)` 헬퍼(파일 하단부, "갓 가입한(미등록) 상담사는..." 테스트 근처)를 그대로 재사용한다.

파일에서 다음 기존 테스트(690번째 줄 근처)를 찾는다:

```js
test("상담사가 등록하면 이름/verified가 바뀌고 목록에 노출된다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({
      name: "새이름상담사",
      major: "심리학과 2학년",
      year: "2학년",
      bio: "천천히 들어드릴게요",
      specialties: ["학업", "관계"],
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);
  assert.equal(res.body.id, counselor._id.toString());
  assert.equal(res.body.name, "새이름상담사");

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].name, "새이름상담사");
  assert.equal(listRes.body[0].major, "심리학과 2학년");
  assert.equal(listRes.body[0].intro, "천천히 들어드릴게요");
  assert.deepEqual(listRes.body[0].tags, ["학업", "관계"]);

  const meRes = await request(app).get("/api/counselors/me").set("Cookie", counselorCookie(counselor));
  assert.equal(meRes.body.name, "새이름상담사");
  assert.equal(meRes.body.major, "심리학과 2학년");
  assert.equal(meRes.body.verified, true);
});
```

이 테스트는 "신규 등록 = 즉시 노출"을 검증하고 있어서 이번 변경(신규 등록은 승인 대기)과 정면으로 충돌한다. 이 테스트 전체를 아래 내용으로 교체한다 (이름도 바꾼다):

```js
test("신규 상담사가 등록하면 verified가 false로 대기 상태가 되고 목록에 노출되지 않는다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({
      name: "새이름상담사",
      major: "심리학과 2학년",
      year: "2학년",
      bio: "천천히 들어드릴게요",
      specialties: ["학업", "관계"],
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, false);
  assert.equal(res.body.id, counselor._id.toString());
  assert.equal(res.body.name, "새이름상담사");

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 0);

  const meRes = await request(app).get("/api/counselors/me").set("Cookie", counselorCookie(counselor));
  assert.equal(meRes.body.name, "새이름상담사");
  assert.equal(meRes.body.major, "심리학과 2학년");
  assert.equal(meRes.body.verified, false);
});

test("이미 승인된 상담사가 프로필을 수정해도 verified가 유지된다", async () => {
  const counselor = await createFreshCounselor({ email: "verified-counselor@test.com" });
  await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "기존상담사", major: "심리학과 3학년", year: "3학년", bio: "소개", specialties: ["학업"] });

  const User = require("../models/User");
  await User.findByIdAndUpdate(counselor._id, { "counselorProfile.verified": true });

  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({
      name: "기존상담사",
      major: "심리학과 3학년",
      year: "3학년",
      bio: "수정된 소개",
      specialties: ["학업", "진로"],
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].intro, "수정된 소개");
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/counseling-routes.test.js`
Expected: 새/수정된 테스트가 실패 (현재 코드는 항상 `verified: true`를 반환하므로 `assert.equal(res.body.verified, false)`가 실패)

- [ ] **Step 3: counseling.js 등록 라우트 수정**

`server/routes/counseling.js`의 `/counselors/register` 핸들러에서 다음 줄:

```js
    user.counselorProfile.verified = true;
```

을 다음으로 교체:

```js
    // 이미 승인된 상담사가 프로필을 수정하는 경우엔 승인 상태를 유지한다.
    // 신규 등록이거나 아직 미승인인 경우에만 대기 상태로 (재)설정한다.
    if (user.counselorProfile.verified !== true) {
      user.counselorProfile.verified = false;
    }
```

그리고 바로 아래 응답 줄:

```js
    res.json({ id: user._id.toString(), name: user.name, verified: true });
```

을 다음으로 교체:

```js
    res.json({ id: user._id.toString(), name: user.name, verified: user.counselorProfile.verified });
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/counseling-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 5: 관리자 승인 API에 대한 실패하는 테스트 작성**

`server/tests/admin-routes.test.js` 파일 끝에 추가:

```js
async function createPendingCounselor(overrides = {}) {
  return User.create({
    name: overrides.name ?? "대기상담사",
    email: overrides.email ?? "pending@test.com",
    passwordHash: "x",
    role: "counselor",
    counselorProfile: {
      major: "심리학과 2학년",
      bio: "소개글",
      specialties: ["학업"],
      verified: false,
      ...overrides.counselorProfile,
    },
  });
}

test("비로그인 상태로 승인 대기 상담사 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/counselors/pending");
  assert.equal(res.status, 401);
});

test("admin은 등록 폼을 제출한(major가 있는) 미승인 상담사만 조회한다", async () => {
  const admin = await createAdmin();
  await createPendingCounselor();
  // 가입만 하고 등록 폼은 제출하지 않은 상담사 (major 없음) — 대기 목록에 나오면 안 됨
  await User.create({ name: "미등록상담사", email: "unregistered@test.com", passwordHash: "x", role: "counselor" });
  // 이미 승인된 상담사 — 대기 목록에 나오면 안 됨
  await createPendingCounselor({ email: "verified@test.com", counselorProfile: { verified: true } });

  const res = await request(app).get("/api/admin/counselors/pending").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "대기상담사");
  assert.equal(res.body[0].major, "심리학과 2학년");
  assert.deepEqual(res.body[0].specialties, ["학업"]);
});

test("admin이 승인하면 verified가 true가 되고 상담사 목록에 노출된다", async () => {
  const admin = await createAdmin();
  const pending = await createPendingCounselor();

  const res = await request(app)
    .post(`/api/admin/counselors/${pending._id}/approve`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].name, "대기상담사");
});

test("존재하지 않는 상담사를 승인하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/counselors/${missingId}/approve`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 6: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 새로 추가한 4개 테스트가 404로 실패

- [ ] **Step 7: admin.js에 상담사 승인 라우트 추가**

`server/routes/admin.js` 상단 require에 추가:

```js
const User = require("../models/User");
```

(이미 있으면 생략)

`module.exports = router;` 바로 위에 추가:

```js
function serializePendingCounselor(user) {
  const p = user.counselorProfile || {};
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    major: p.major || "",
    year: p.year || "",
    bio: p.bio || "",
    specialties: p.specialties || [],
  };
}

router.get("/counselors/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pending = await User.find({
      role: "counselor",
      "counselorProfile.verified": false,
      "counselorProfile.major": { $exists: true, $ne: "" },
    }).sort({ createdAt: -1 });
    res.json(pending.map(serializePendingCounselor));
  } catch (err) {
    console.error("승인 대기 상담사 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counselors/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: "counselor" });
    if (!user) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    user.counselorProfile.verified = true;
    await user.save();
    res.json({ verified: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담사 승인 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 8: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 9: 전체 백엔드 테스트 스위트 실행**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 10: 커밋**

```bash
git add server/routes/counseling.js server/routes/admin.js server/tests/counseling-routes.test.js server/tests/admin-routes.test.js
git commit -m "feat: 상담사 등록을 승인제로 전환하고 관리자 승인 API 추가"
```

---

## Task 5: 정지된 계정 로그인 차단

**Files:**
- Modify: `server/routes/auth.js`
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `User.suspended` 필드

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/auth-routes.test.js`에서 로그인 관련 테스트들 근처에 추가:

```js
test("정지된 계정으로 로그인하면 403을 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "정지될사람", email: "suspended@test.com", password: "1234", role: "client" });

  const User = require("../models/User");
  await User.findOneAndUpdate({ email: "suspended@test.com" }, { suspended: true });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "suspended@test.com", password: "1234" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "정지된 계정이에요. 관리자에게 문의해주세요.");
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/auth-routes.test.js`
Expected: 403을 기대했지만 200(로그인 성공)이 나와서 실패

- [ ] **Step 3: auth.js 로그인 라우트 수정**

`server/routes/auth.js`의 `/login` 핸들러에서 다음 줄:

```js
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json(genericError);
    }
```

바로 아래에 추가:

```js
    if (user.suspended) {
      return res.status(403).json({ error: "정지된 계정이에요. 관리자에게 문의해주세요." });
    }
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/auth-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 5: 전체 백엔드 테스트 스위트 실행**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add server/routes/auth.js server/tests/auth-routes.test.js
git commit -m "feat: 정지된 계정 로그인 차단"
```

---

## Task 6: 관리자 승격 스크립트

**Files:**
- Create: `server/scripts/promote-admin.js`

**Interfaces:**
- Consumes: Task 1의 `User.role` (admin 값 허용)

- [ ] **Step 1: 스크립트 작성**

`server/scripts/promote-admin.js` 새로 작성 (`seed-counselors.js`와 동일한 실행 패턴):

```js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function promote() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("사용법: node scripts/promote-admin.js <email>");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI가 설정되지 않았습니다. server/.env를 확인하거나 환경변수로 넘겨주세요.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { role: "admin" },
    { new: true },
  );

  if (!user) {
    throw new Error(`해당 이메일의 계정을 찾을 수 없습니다: ${email}`);
  }

  console.log(`관리자로 승격 완료: ${user.name} (${user.email})`);
  await mongoose.disconnect();
}

promote()
  .then(() => console.log("완료"))
  .catch((err) => {
    console.error("관리자 승격 중 오류:", err.message);
    process.exit(1);
  });
```

- [ ] **Step 2: 커밋**

```bash
git add server/scripts/promote-admin.js
git commit -m "feat: 계정을 관리자로 승격시키는 1회성 스크립트 추가"
```

(이 스크립트는 자동 테스트 대상이 아니다 — `seed-counselors.js`와 마찬가지로 실제 DB에 대해 사용자가 직접 실행하는 운영 스크립트다. 실행 예시: `cd server && node scripts/promote-admin.js hoi256678@gmail.com` — `MONGODB_URI`가 로컬 `.env`나 환경변수에 실제 운영 DB를 가리키도록 설정된 상태에서 실행해야 한다.)

---

## Task 7: 프론트엔드 기반 — 인증 타입, RequireAdmin, 로그인 리다이렉트

**Files:**
- Modify: `app/hooks/useAuthStatus.tsx`
- Create: `app/components/RequireAdmin.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Produces: `LoggedInUser.role`에 `"admin"` 포함
- Produces: `RequireAdmin` 컴포넌트 — `RequireAuth`와 동일한 children 함수 패턴 (`{(auth) => ...}` 또는 plain children)

- [ ] **Step 1: useAuthStatus의 role 타입에 admin 추가**

`app/hooks/useAuthStatus.tsx`에서 다음 줄:

```ts
export type LoggedInUser = { name: string; role: "counselor" | "client" };
```

을 다음으로 교체:

```ts
export type LoggedInUser = { name: string; role: "counselor" | "client" | "admin" };
```

- [ ] **Step 2: 타입체크로 영향 범위 확인**

Run: `npx tsc --noEmit -p .`
Expected: `role === "counselor" ? ... : ...` 같은 2분기 삼항 연산 자체는 타입 에러가 나지 않는다 (여전히 유효한 문자열 비교). 에러가 나는 곳이 있다면 그 파일과 줄을 기록해두고 다음 단계에서 함께 고친다. (현재 이 코드베이스 확인 결과 이 시점에 에러가 나지 않을 것으로 예상되지만, 만약 난다면 무시하지 말고 실제 값을 반영하도록 고칠 것 — 예: `admin` 계정이 표시될 일이 없는 화면이면 그대로 두고, 표시될 수 있는 화면이면 문구를 추가.)

- [ ] **Step 3: RequireAdmin 컴포넌트 작성**

`app/components/RequireAdmin.tsx` 새로 작성 (`app/components/RequireAuth.tsx`를 참고한 동일 패턴):

```tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStatus, type AuthState } from "@/app/hooks/useAuthStatus";
import { loginHref } from "@/app/components/RequireAuth";

type LoggedInAdminState = Extract<AuthState, { phase: "in" }>;

export default function RequireAdmin({
  children,
}: {
  children: React.ReactNode | ((auth: LoggedInAdminState) => React.ReactNode);
}) {
  const { state } = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.phase === "loading") return;
    if (state.phase === "out") {
      const search = typeof window === "undefined" ? "" : window.location.search;
      router.replace(loginHref(`${pathname}${search}`));
      return;
    }
    if (state.role !== "admin") {
      router.replace("/");
    }
  }, [state, router, pathname]);

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-text-muted">
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary-dark"
        />
        로그인 상태를 확인하고 있어요...
      </div>
    );
  }

  if (state.phase === "out" || state.role !== "admin") {
    return (
      <div className="px-6 py-24 text-center text-sm leading-relaxed text-text-muted">
        관리자만 접근할 수 있는 페이지예요.
        <span className="mt-1 block text-text-faint">이동 중이에요...</span>
      </div>
    );
  }

  return <>{typeof children === "function" ? children(state) : children}</>;
}
```

- [ ] **Step 4: login/page.tsx에 admin 리다이렉트 추가**

`app/login/page.tsx`에서 다음 줄:

```ts
      const data = (await res.json()) as {
        error?: string;
        name?: string;
        role?: "counselor" | "client";
      };
```

을 다음으로 교체:

```ts
      const data = (await res.json()) as {
        error?: string;
        name?: string;
        role?: "counselor" | "client" | "admin";
      };
```

그리고 다음 줄:

```ts
      setLoggedIn({ name: data.name!, role: data.role! });
      router.replace(nextPath);
```

을 다음으로 교체:

```ts
      setLoggedIn({ name: data.name!, role: data.role! });
      // next 파라미터가 명시되지 않은 채로(기본값 "/") 로그인한 admin은 관리자 페이지로 보낸다.
      const target = !searchParams.get("next") && data.role === "admin" ? "/admin" : nextPath;
      router.replace(target);
```

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/hooks/useAuthStatus.tsx app/components/RequireAdmin.tsx app/login/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add app/hooks/useAuthStatus.tsx app/components/RequireAdmin.tsx "app/login/page.tsx"
git commit -m "feat: admin 역할 타입과 RequireAdmin, 로그인 후 관리자 리다이렉트 추가"
```

---

## Task 8: 상담사 등록 페이지 — 승인 대기 안내 문구

**Files:**
- Modify: `app/(shell)/counselor-register/page.tsx`

**Interfaces:**
- Consumes: `POST /api/counselors/register` 응답의 `verified` 필드 (Task 4에서 실제 값 반환하도록 이미 수정됨)

- [ ] **Step 1: 제출 후 분기 처리**

`app/(shell)/counselor-register/page.tsx`의 `RegisterForm` 함수에서, state 선언부 (`const [error, setError] = useState<string | null>(null);` 바로 아래)에 추가:

```tsx
  const [submitted, setSubmitted] = useState(false);
```

`handleSubmit` 함수에서 다음 부분:

```tsx
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했어요");
        return;
      }
      // 이름이 바뀌었을 수 있으니 상단바/사이드바에 보이는 로그인 이름도 새로 받아온다.
      await refreshAuth();
      router.push("/");
```

을 다음으로 교체:

```tsx
      const data = (await res.json()) as { verified: boolean };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "등록에 실패했어요");
        return;
      }
      // 이름이 바뀌었을 수 있으니 상단바/사이드바에 보이는 로그인 이름도 새로 받아온다.
      await refreshAuth();
      if (data.verified) {
        router.push("/");
      } else {
        setSubmitted(true);
      }
```

`return` 문의 최상단, `if (loading) { ... }` 바로 아래에 추가:

```tsx
  if (submitted) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-lg font-extrabold text-text">제출 완료</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            관리자 승인 후 상담사 찾기 목록에 노출돼요. 조금만 기다려주세요.
          </p>
        </Card>
      </div>
    );
  }
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint "app/(shell)/counselor-register/page.tsx"`
Expected: 둘 다 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(shell)/counselor-register/page.tsx"
git commit -m "feat: 상담사 등록 후 승인 대기 안내 화면 추가"
```

---

## Task 9: 관리자 레이아웃 + 랜딩 페이지

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/AdminNav.tsx`
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: Task 7의 `RequireAdmin`
- Produces: `/admin`이 4개 관리 화면(사용자/커뮤니티/신고/상담사 인증)으로 가는 메뉴를 보여줌

- [ ] **Step 1: 관리자 사이드바 컴포넌트 작성**

`app/admin/AdminNav.tsx` 새로 작성:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/reports", label: "상담 신고" },
  { href: "/admin/counselors", label: "상담사 인증" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { setLoggedOut } = useAuthStatus();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggedOut();
      router.push("/");
    }
  }

  return (
    <div className="flex h-full w-[220px] flex-shrink-0 flex-col border-r border-border bg-surface p-4">
      <div className="mb-6 px-2 text-lg font-extrabold text-text">솜잇 관리자</div>
      <nav className="flex flex-1 flex-col gap-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                active ? "bg-primary-light text-primary-dark" : "text-text-muted hover:bg-bg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <Link href="/" className="rounded-xl px-3 py-2.5 text-sm font-bold text-text-muted hover:bg-bg">
          메인 사이트로
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger hover:bg-bg"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 레이아웃 작성**

`app/admin/layout.tsx` 새로 작성:

```tsx
import RequireAdmin from "@/app/components/RequireAdmin";
import AdminNav from "./AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <div className="flex min-h-screen bg-bg">
        <AdminNav />
        <main className="flex-1 p-8">
          <div className="mx-auto w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
    </RequireAdmin>
  );
}
```

- [ ] **Step 3: 랜딩 페이지 작성**

`app/admin/page.tsx` 새로 작성:

```tsx
import Link from "next/link";
import Card from "@/app/components/ui/Card";

const SECTIONS = [
  { href: "/admin/users", title: "사용자 관리", desc: "전체 사용자 조회, 계정 정지/해제" },
  { href: "/admin/community", title: "커뮤니티 관리", desc: "게시글/댓글 조회 및 삭제" },
  { href: "/admin/reports", title: "상담 신고", desc: "접수된 상담 신고 확인 및 처리" },
  { href: "/admin/counselors", title: "상담사 인증", desc: "등록 신청한 상담사 승인" },
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-text">관리자 대시보드</h1>
      <div className="grid grid-cols-1 gap-4 shell:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="cursor-pointer transition-shadow hover:shadow-card">
              <div className="font-bold text-text">{s.title}</div>
              <div className="mt-1 text-[13px] text-text-muted">{s.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/admin/layout.tsx app/admin/AdminNav.tsx app/admin/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/admin/layout.tsx app/admin/AdminNav.tsx app/admin/page.tsx
git commit -m "feat: 관리자 레이아웃과 대시보드 랜딩 페이지 추가"
```

---

## Task 10: 관리자 — 사용자 관리 화면

**Files:**
- Create: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/users`, `POST /api/admin/users/:id/suspend` (Task 1)

- [ ] **Step 1: 페이지 작성**

`app/admin/users/page.tsx` 새로 작성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "counselor" | "client" | "admin";
  suspended: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<AdminUser["role"], string> = {
  counselor: "상담사",
  client: "고민 청소년",
  admin: "관리자",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"" | AdminUser["role"]>("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const query = roleFilter ? `?role=${roleFilter}` : "";
    apiFetch(`/api/admin/users${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: AdminUser[]) => setUsers(data))
      .catch(() => setError("불러오는 중 오류가 발생했어요"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [roleFilter]);

  async function toggleSuspend(id: string) {
    const res = await apiFetch(`/api/admin/users/${id}/suspend`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { suspended: boolean };
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, suspended: data.suspended } : u)));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">사용자 관리</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {(["", "client", "counselor", "admin"] as const).map((r) => (
          <button
            key={r || "all"}
            onClick={() => setRoleFilter(r)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              roleFilter === r ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            {r === "" ? "전체" : ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm font-semibold text-danger">{error}</p>}

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-text-faint">사용자가 없어요</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-bg text-[11px] font-bold uppercase text-text-faint">
              <tr>
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">이메일</th>
                <th className="px-4 py-2.5">역할</th>
                <th className="px-4 py-2.5">상태</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-text">{u.name}</td>
                  <td className="px-4 py-3 text-text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-text-muted">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-3">
                    {u.suspended ? (
                      <span className="rounded-full bg-[#fff0f0] px-2 py-0.5 text-xs font-bold text-danger">정지됨</span>
                    ) : (
                      <span className="rounded-full bg-[#eafaf5] px-2 py-0.5 text-xs font-bold text-success">정상</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => toggleSuspend(u.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                          u.suspended
                            ? "border-border text-text-muted"
                            : "border-danger text-danger hover:bg-[#fff0f0]"
                        }`}
                      >
                        {u.suspended ? "정지 해제" : "정지"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/admin/users/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: 관리자 사용자 관리 화면 추가"
```

---

## Task 11: 관리자 — 커뮤니티 관리 화면

**Files:**
- Create: `app/admin/community/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/posts`, `DELETE /api/admin/posts/:id`, `DELETE /api/admin/posts/:id/comments/:commentId` (Task 2)

- [ ] **Step 1: 페이지 작성**

`app/admin/community/page.tsx` 새로 작성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminComment = { id: string; authorId: string; text: string; createdAt: string };
type AdminPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  authorId: string;
  createdAt: string;
  comments: AdminComment[];
};

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    apiFetch("/api/admin/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deletePost(id: string) {
    const res = await apiFetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function deleteComment(postId: string, commentId: string) {
    const res = await apiFetch(`/api/admin/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p)),
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">커뮤니티 관리</h1>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center text-text-faint">게시글이 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  {post.tag}
                </span>
                <span className="text-[11px] text-text-faint">댓글 {post.comments.length}개</span>
              </div>
              <div className="mb-1.5 font-bold text-text">{post.title}</div>
              <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{post.body}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleExpand(post.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                >
                  {expanded.has(post.id) ? "댓글 숨기기" : "댓글 보기"}
                </button>
                <button
                  onClick={() => deletePost(post.id)}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-bold text-danger hover:bg-[#fff0f0]"
                >
                  게시글 삭제
                </button>
              </div>

              {expanded.has(post.id) && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  {post.comments.length === 0 ? (
                    <div className="text-xs text-text-faint">댓글이 없어요</div>
                  ) : (
                    post.comments.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">{c.text}</span>
                        <button
                          onClick={() => deleteComment(post.id, c.id)}
                          className="flex-shrink-0 text-xs font-bold text-danger"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/admin/community/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/admin/community/page.tsx
git commit -m "feat: 관리자 커뮤니티 관리 화면 추가"
```

---

## Task 12: 관리자 — 상담 신고 화면

**Files:**
- Create: `app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/reports`, `POST /api/admin/reports/:id/review` (Task 3)

- [ ] **Step 1: 페이지 작성**

`app/admin/reports/page.tsx` 새로 작성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminReport = {
  id: string;
  reporterName: string;
  counselorName: string;
  reason: string;
  status: "open" | "reviewed";
  createdAt: string;
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "reviewed">("open");

  function load() {
    setLoading(true);
    const query = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch(`/api/admin/reports${query}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminReport[]) => setReports(data))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  async function markReviewed(id: string) {
    const res = await apiFetch(`/api/admin/reports/${id}/review`, { method: "POST" });
    if (!res.ok) return;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: "reviewed" } : r)));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">상담 신고</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {(["open", "reviewed", ""] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === s ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            {s === "open" ? "미처리" : s === "reviewed" ? "처리완료" : "전체"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : reports.length === 0 ? (
        <div className="py-16 text-center text-text-faint">신고 내역이 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-text">
                  {r.reporterName} → {r.counselorName}
                </span>
                {r.status === "reviewed" ? (
                  <span className="rounded-full bg-[#eafaf5] px-2 py-0.5 text-xs font-bold text-success">처리완료</span>
                ) : (
                  <span className="rounded-full bg-[#fff0f0] px-2 py-0.5 text-xs font-bold text-danger">미처리</span>
                )}
              </div>
              <p className="mb-3 text-sm text-text-2">{r.reason}</p>
              {r.status === "open" && (
                <button
                  onClick={() => markReviewed(r.id)}
                  className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
                >
                  처리완료로 표시
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/admin/reports/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/admin/reports/page.tsx
git commit -m "feat: 관리자 상담 신고 처리 화면 추가"
```

---

## Task 13: 관리자 — 상담사 인증 화면 + 전체 빌드 검증

**Files:**
- Create: `app/admin/counselors/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/counselors/pending`, `POST /api/admin/counselors/:id/approve` (Task 4)

- [ ] **Step 1: 페이지 작성**

`app/admin/counselors/page.tsx` 새로 작성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PendingCounselor = {
  id: string;
  name: string;
  email: string;
  major: string;
  year: string;
  bio: string;
  specialties: string[];
};

export default function AdminCounselorsPage() {
  const [pending, setPending] = useState<PendingCounselor[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    apiFetch("/api/admin/counselors/pending")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PendingCounselor[]) => setPending(data))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function approve(id: string) {
    const res = await apiFetch(`/api/admin/counselors/${id}/approve`, { method: "POST" });
    if (!res.ok) return;
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">상담사 인증</h1>
      <p className="mb-4 text-sm text-text-muted">등록 폼을 제출하고 승인을 기다리는 상담사예요.</p>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : pending.length === 0 ? (
        <div className="py-16 text-center text-text-faint">승인 대기 중인 상담사가 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-bold text-text">{c.name}</span>
                <span className="text-xs text-text-faint">{c.email}</span>
              </div>
              <div className="mb-2 text-[13px] text-text-muted">
                {c.major} {c.year && `· ${c.year}`}
              </div>
              <p className="mb-3 text-sm text-text-2">{c.bio}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {c.specialties.map((tag) => (
                  <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-text-muted">
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => approve(c.id)}
                className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
              >
                승인
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Run: `npx eslint app/admin/counselors/page.tsx`
Expected: 둘 다 에러 없음

- [ ] **Step 3: 전체 프로젝트 빌드**

Run: `npm run build`
Expected: 성공, `Route (app)` 목록에 `/admin`, `/admin/users`, `/admin/community`, `/admin/reports`, `/admin/counselors`가 나타남

- [ ] **Step 4: 전체 백엔드 테스트 스위트 재실행 (최종 회귀 확인)**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add app/admin/counselors/page.tsx
git commit -m "feat: 관리자 상담사 인증 화면 추가"
```

---

## 구현 완료 후 (실행자가 하지 않음, 사용자가 직접)

- `git push origin main` — 이 플랜은 태스크별로 로컬 커밋만 한다. 전체 태스크 완료 후 사용자가 검토하고 push/배포 여부를 결정한다.
- 배포 후 `node server/scripts/promote-admin.js <본인 이메일>`을 운영 `MONGODB_URI`에 대해 실행해서 실제 관리자 계정을 만든다.
- 라이브에서 로그인 → `/admin` 리다이렉트 → 4개 화면 모두 실제로 클릭해서 확인.

# 기분 기록 상담사 공유 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기분 기록을 서버에 저장하고, 클라이언트가 동의했을 때만 활성 상담방의 담당 상담사가 최근 14개 기록을 실제로 볼 수 있게 만든다. 지금은 로컬스토리지에만 저장되고 "상담사에게 보여줄게요" 체크박스가 아무 데도 연결 안 된 장식용 기능이다.

**Architecture:** 백엔드에 `MoodEntry` 모델과 `User.moodShareEnabled` 필드를 추가하고, 본인 기록 CRUD(`server/routes/mood.js`, 신규)와 상담사 조회(`server/routes/counseling.js`에 라우트 추가) 두 축으로 나눈다. 프론트엔드는 `/mood` 페이지를 "로컬스토리지 우선 렌더 + 백그라운드 서버 동기화" 방식으로 바꾸고(오프라인 폴백 유지), 상담 채팅방(`/chat/[id]`)에 상담사 전용 펼침 섹션을 추가한다.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind v4(프론트엔드).

**Spec:** `docs/superpowers/specs/2026-08-22-mood-counselor-sharing-design.md`

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 새 npm 의존성 없음.
- `GET /api/mood/entries`가 반환하는 `entries` 배열은 반드시 `date` 내림차순(최신이 먼저)이어야 한다 — 프론트엔드의 `lowStreak` 계산이 "배열의 앞이 최신"이라는 순서에 의존한다.
- `PUT /api/mood/entries/:date`는 "오늘 날짜만" 같은 제약을 두지 않는다 — 과거 날짜 백필(마이그레이션)에도 그대로 쓰인다.
- 상담사 조회는 활성(active) 상담방에서만 허용한다. 종료/신고된 방에서는 상담사가 볼 수 없다.

---

## Task 1: `MoodEntry` 모델 + 본인 기록 CRUD (`GET`/`PUT /api/mood/entries`)

**Files:**
- Create: `server/models/MoodEntry.js`
- Modify: `server/models/User.js`
- Create: `server/routes/mood.js`
- Modify: `server/index.js`
- Create: `server/tests/mood-routes.test.js`

**Interfaces:**
- Produces: `MoodEntry` 모델(`{user, date, score, note, checks}`, `{user,date}` 유니크 인덱스), `User.moodShareEnabled: Boolean`(기본 `false`), `GET /api/mood/entries` → `{ shareEnabled: boolean, entries: {date,score,note,checks}[] }`(date 내림차순), `PUT /api/mood/entries/:date` → 저장된 `{date,score,note,checks}`. Task 2가 `User.moodShareEnabled`를, Task 3이 `MoodEntry` 모델을, Task 4가 이 두 엔드포인트를 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/mood-routes.test.js` 신규 생성:

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
let MoodEntry;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  MoodEntry = require("../models/MoodEntry");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function signup(agent, overrides = {}) {
  const payload = {
    name: "기분테스트",
    email: "mood-user@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("로그인하지 않은 상태로 기분 기록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/mood/entries");
  assert.equal(res.status, 401);
});

test("기록이 없으면 빈 배열과 기본 공유설정(false)을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.get("/api/mood/entries");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { shareEnabled: false, entries: [] });
});

test("PUT으로 오늘 기록을 저장하면 GET에 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const putRes = await agent
    .put("/api/mood/entries/2026-08-22")
    .send({ score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.body, { date: "2026-08-22", score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.status, 200);
  assert.deepEqual(getRes.body.entries, [{ date: "2026-08-22", score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] }]);
});

test("같은 날짜에 다시 PUT하면 덮어쓴다(하루 1개만 유지)", async () => {
  const agent = request.agent(app);
  await signup(agent);

  await agent.put("/api/mood/entries/2026-08-22").send({ score: 2, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-22").send({ score: 5, note: "수정", checks: ["worth"] });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.body.entries.length, 1);
  assert.deepEqual(getRes.body.entries[0], { date: "2026-08-22", score: 5, note: "수정", checks: ["worth"] });
});

test("기록은 날짜 내림차순(최신 먼저)으로 반환된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  await agent.put("/api/mood/entries/2026-08-01").send({ score: 3, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-15").send({ score: 4, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-10").send({ score: 2, note: "", checks: [] });

  const getRes = await agent.get("/api/mood/entries");
  assert.deepEqual(
    getRes.body.entries.map((e) => e.date),
    ["2026-08-15", "2026-08-10", "2026-08-01"]
  );
});

test("날짜 형식이 잘못되면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.put("/api/mood/entries/2026-8-1").send({ score: 3, note: "", checks: [] });
  assert.equal(res.status, 400);
});

test("score가 1~5 범위를 벗어나면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.put("/api/mood/entries/2026-08-22").send({ score: 7, note: "", checks: [] });
  assert.equal(res.status, 400);
});

test("다른 사용자의 기록은 보이지 않는다", async () => {
  const agentA = request.agent(app);
  await signup(agentA, { email: "a@test.com" });
  await agentA.put("/api/mood/entries/2026-08-22").send({ score: 3, note: "", checks: [] });

  const agentB = request.agent(app);
  await signup(agentB, { email: "b@test.com" });

  const res = await agentB.get("/api/mood/entries");
  assert.deepEqual(res.body.entries, []);
});

test("로그인하지 않은 상태로 PUT하면 401을 반환한다", async () => {
  const res = await request(app).put("/api/mood/entries/2026-08-22").send({ score: 3, note: "", checks: [] });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/mood-routes.test.js
```

Expected: FAIL (모듈/라우트가 없어 요청이 404 또는 에러).

- [ ] **Step 3: `MoodEntry` 모델 생성**

`server/models/MoodEntry.js` 신규 생성:

```js
const mongoose = require("mongoose");

const moodEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    note: { type: String, default: "", maxlength: 200 },
    checks: { type: [String], default: [] },
  },
  { timestamps: true }
);

moodEntrySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("MoodEntry", moodEntrySchema);
```

- [ ] **Step 4: `User` 모델에 `moodShareEnabled` 필드 추가**

`server/models/User.js`의 `notificationPrefs: {...},` 블록 다음 줄에 추가한다:

```js
  moodShareEnabled: { type: Boolean, default: false },
```

- [ ] **Step 5: 라우트 구현**

`server/routes/mood.js` 신규 생성:

```js
const express = require("express");
const MoodEntry = require("../models/MoodEntry");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serializeEntry(entry) {
  return { date: entry.date, score: entry.score, note: entry.note, checks: entry.checks };
}

router.get("/entries", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    const entries = await MoodEntry.find({ user: req.user.id }).sort({ date: -1 });
    res.json({ shareEnabled: !!user.moodShareEnabled, entries: entries.map(serializeEntry) });
  } catch (err) {
    console.error("기분 기록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.put("/entries/:date", requireAuth, async (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: "날짜 형식이 올바르지 않습니다" });
    }
    const { score, note, checks } = req.body || {};
    if (typeof score !== "number" || score < 1 || score > 5) {
      return res.status(400).json({ error: "점수는 1~5 사이여야 합니다" });
    }

    const entry = await MoodEntry.findOneAndUpdate(
      { user: req.user.id, date },
      { score, note: typeof note === "string" ? note : "", checks: Array.isArray(checks) ? checks : [] },
      { new: true, upsert: true }
    );

    res.json(serializeEntry(entry));
  } catch (err) {
    console.error("기분 기록 저장 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

`server/index.js`에서 다른 라우터들과 같은 자리에 추가한다:

```js
const moodRouter = require("./routes/mood");
```

(다른 `require("./routes/...")` 줄들 바로 아래에)

```js
app.use("/api/mood", moodRouter);
```

(`app.use("/api/notifications", notificationsRouter);` 다음 줄에)

- [ ] **Step 6: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/mood-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 7: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/models/MoodEntry.js server/models/User.js server/routes/mood.js server/index.js server/tests/mood-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 기분 기록을 서버에 저장하는 API 추가 (GET/PUT /api/mood/entries)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 공유 설정 변경 (`PATCH /api/mood/share`)

**Files:**
- Modify: `server/routes/mood.js`
- Modify: `server/tests/mood-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `User.moodShareEnabled`.
- Produces: `PATCH /api/mood/share` — body `{enabled: boolean}` → `{enabled: boolean}`. Task 4(프론트 공유 토글)와 Task 3(상담사 조회 시 이 값을 읽음 — 이미 Task 1에서 필드는 존재하므로 Task 3은 이 엔드포인트 자체엔 의존하지 않는다)가 관련된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/mood-routes.test.js` 끝에 추가:

```js
test("공유 설정을 켜면 /entries 응답에도 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const patchRes = await agent.patch("/api/mood/share").send({ enabled: true });
  assert.equal(patchRes.status, 200);
  assert.deepEqual(patchRes.body, { enabled: true });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.body.shareEnabled, true);
});

test("enabled가 boolean이 아니면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.patch("/api/mood/share").send({ enabled: "yes" });
  assert.equal(res.status, 400);
});

test("로그인하지 않은 상태로 공유 설정을 변경하면 401을 반환한다", async () => {
  const res = await request(app).patch("/api/mood/share").send({ enabled: true });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/mood-routes.test.js
```

Expected: FAIL (404, 라우트가 없음).

- [ ] **Step 3: 엔드포인트 구현**

`server/routes/mood.js`의 `/entries/:date` 라우트 다음(`module.exports = router;` 이전)에 추가한다:

```js
router.patch("/share", requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled는 boolean이어야 합니다" });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    user.moodShareEnabled = enabled;
    await user.save();
    res.json({ enabled: user.moodShareEnabled });
  } catch (err) {
    console.error("기분 공유 설정 변경 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/mood-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

```bash
git add server/routes/mood.js server/tests/mood-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 기분 기록 공유 설정 변경 엔드포인트 추가 (PATCH /api/mood/share)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 상담사용 조회 (`GET /api/counseling/rooms/:id/mood`)

**Files:**
- Modify: `server/routes/counseling.js`
- Modify: `server/tests/counseling-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `MoodEntry` 모델, `User.moodShareEnabled`.
- Produces: `GET /api/counseling/rooms/:id/mood` → 성공 시 `{ entries: {date,score,note,checks}[] }`(시간순, 오래된 것부터). 공유 꺼짐이면 403 `{ error, shareDisabled: true }`. Task 5(프론트 상담사 패널)가 이 응답 형태를 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/counseling-routes.test.js` 끝에 추가한다(파일에 이미 있는 `createCounselor`, `signupClient`, `counselorCookie` 헬퍼 사용):

```js
const MoodEntry = require("../models/MoodEntry");

test("상담사는 활성 상담방에서 공유 동의한 클라이언트의 최근 기분 기록을 볼 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  await agent.patch("/api/mood/share").send({ enabled: true });
  const client = await User.findOne({ email: "client@test.com" });
  await MoodEntry.create({ user: client._id, date: "2026-08-20", score: 3, note: "", checks: [] });
  await MoodEntry.create({ user: client._id, date: "2026-08-21", score: 5, note: "좋았다", checks: ["sleep"] });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.entries.map((e) => e.date),
    ["2026-08-20", "2026-08-21"]
  );
  assert.equal(res.body.entries[1].note, "좋았다");
});

test("클라이언트가 공유하지 않았으면 403과 shareDisabled를 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 403);
  assert.equal(res.body.shareDisabled, true);
});

test("종료된 상담방에서는 상담사가 기분 기록을 볼 수 없다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.patch("/api/mood/share").send({ enabled: true });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 403);
  assert.notEqual(res.body.shareDisabled, true);
});

test("클라이언트 본인은 이 엔드포인트로 조회할 수 없다(상담사 전용)", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.patch("/api/mood/share").send({ enabled: true });

  const res = await agent.get(`/api/counseling/rooms/${createRes.body.id}/mood`);
  assert.equal(res.status, 403);
});

test("존재하지 않는 방을 조회하면 404를 반환한다", async () => {
  const counselor = await createCounselor();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .get(`/api/counseling/rooms/${missingId}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/counseling-routes.test.js
```

Expected: FAIL (404, 라우트가 없음).

- [ ] **Step 3: 엔드포인트 구현**

`server/routes/counseling.js` 상단 import에 `MoodEntry`를 추가한다:

```js
const MoodEntry = require("../models/MoodEntry");
```

`GET /counseling/rooms/:id` 라우트 다음에 추가한다:

```js
router.get("/counseling/rooms/:id/mood", requireAuth, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.counselor.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(403).json({ error: "활성 상담방에서만 볼 수 있어요" });
    }

    const client = await User.findById(room.client);
    if (!client || !client.moodShareEnabled) {
      return res.status(403).json({ error: "클라이언트가 기분 기록 공유에 동의하지 않았어요", shareDisabled: true });
    }

    const entries = await MoodEntry.find({ user: room.client }).sort({ date: -1 }).limit(14);
    const ordered = entries.reverse().map((e) => ({ date: e.date, score: e.score, note: e.note, checks: e.checks }));
    res.json({ entries: ordered });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("상담사용 기분 기록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/counseling-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

```bash
git add server/routes/counseling.js server/tests/counseling-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 상담사가 활성 상담방에서 클라이언트의 공유된 기분 기록을 조회하는 API 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — 기분 페이지 서버 동기화

**Files:**
- Modify: `app/(shell)/mood/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `GET/PUT /api/mood/entries`, Task 2의 `PATCH /api/mood/share`.
- Produces: `export const MOODS`, `export const CHECKS`, `export type MoodEntry`(기존엔 파일 내부 전용이었던 것을 export로 바꿈). Task 5(상담사 패널)가 `MOODS`/`CHECKS`를 그대로 import해서 쓴다.

- [ ] **Step 1: import 추가 + `MOODS`/`CHECKS`/`MoodEntry` export**

```tsx
import { readJSON, writeJSON } from "@/lib/storage";
```

를:

```tsx
import { readJSON, writeJSON } from "@/lib/storage";
import { apiFetch } from "@/lib/api";
```

로 교체한다.

```tsx
/** 이모지는 기분을 고르는 입력 수단이라 남긴다. 장식용 이모지는 쓰지 않는다. */
const MOODS = [
```

를:

```tsx
/** 이모지는 기분을 고르는 입력 수단이라 남긴다. 장식용 이모지는 쓰지 않는다. */
export const MOODS = [
```

로, 그리고:

```tsx
/** 5문항 간단 체크. 길면 매일 하지 않는다. */
const CHECKS = [
```

를:

```tsx
/** 5문항 간단 체크. 길면 매일 하지 않는다. */
export const CHECKS = [
```

로, 그리고:

```tsx
type MoodEntry = {
```

를:

```tsx
export type MoodEntry = {
```

로 교체한다.

- [ ] **Step 2: 마운트 시 서버 동기화**

```tsx
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
  }, []);
```

를 다음으로 교체한다:

```tsx
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
```

- [ ] **Step 3: `save()`가 서버에도 저장**

```tsx
  function save() {
    if (score === null) return;
    const entry: MoodEntry = { date: todayKey(), score, note: note.trim(), checks };
    const next = [entry, ...entries.filter((e) => e.date !== entry.date)].slice(0, 90);
    setEntries(next);
    writeJSON(KEY, next);
    const today = new Date();
    setViewMonth({ y: today.getFullYear(), m: today.getMonth() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
```

를:

```tsx
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
```

로 교체한다.

- [ ] **Step 4: `toggleShare()`가 서버에도 반영**

```tsx
  function toggleShare(value: boolean) {
    setShare(value);
    writeJSON(SHARE_KEY, value);
  }
```

를:

```tsx
  function toggleShare(value: boolean) {
    setShare(value);
    writeJSON(SHARE_KEY, value);
    apiFetch("/api/mood/share", {
      method: "PATCH",
      body: JSON.stringify({ enabled: value }),
    }).catch(() => {});
  }
```

로 교체한다.

- [ ] **Step 5: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/mood/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 6: 브라우저에서 확인**

```bash
npm run dev
```

로그인 후 `http://localhost:3000/mood`에서 기분을 기록하고 새로고침한다 — 개발자도구 Network 탭에서 `PUT /api/mood/entries/...` 요청이 나가는지, 새로고침 후에도 오늘 기록이 남아있는지(이번엔 서버에서 온 값) 확인한다. 공유 체크박스를 켜고 새로고침해도 켜진 채로 유지되는지(Network에서 `PATCH /api/mood/share` 확인) 검증한다. 로그인 전에 개발자도구 콘솔에서 `localStorage.setItem("somit:mood", JSON.stringify([{date:"2026-08-01",score:3,note:"",checks:[]}]))`로 로컬 전용 기록을 만든 뒤 새로고침하면, 잠시 후 그 날짜가 서버에도 올라가는지(같은 계정으로 다시 로그아웃 후 로그인해도 남아있는지) 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add "app/(shell)/mood/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 기분 기록을 서버와 동기화 (로컬스토리지는 오프라인 폴백으로 유지)

첫 로딩 시 로컬 전용 기록을 서버로 백필하고, 이후 저장/공유 설정
변경은 서버에도 반영한다. 네트워크 실패 시엔 기존처럼 로컬스토리지만
사용해 동작이 깨지지 않는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 프론트엔드 — 상담 채팅방에 상담사용 기분 기록 패널 추가

**Files:**
- Modify: `app/(shell)/chat/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `GET /api/counseling/rooms/:id/mood`, Task 4가 export한 `MOODS`, `CHECKS`, `MoodEntry`(`app/(shell)/mood/page.tsx`에서 import — 새 `MoodEntry` 타입을 만들지 않고 이미 있는 `MoodEntry`를 그대로 재사용한다).

- [ ] **Step 1: import 추가**

```tsx
import { usePolling } from "@/app/hooks/usePolling";
```

를:

```tsx
import { usePolling } from "@/app/hooks/usePolling";
import { MOODS, CHECKS, type MoodEntry } from "@/app/(shell)/mood/page";
```

로 교체한다.

- [ ] **Step 2: 헤더 아래에 패널 삽입**

`ChatRoomPage` 함수의 return문에서, 헤더 `<div className="flex items-center gap-3 border-b border-border px-5 py-3">...</div>` 블록이 끝나는 지점(그 다음 줄, `{room.status !== "active" && (` 블록 바로 앞)에 추가한다:

```tsx
        {room.viewerSide === "counselor" && room.status === "active" && <MoodShareSection roomId={room.id} />}

```

- [ ] **Step 3: `MoodShareSection` 컴포넌트 추가**

파일 맨 끝(`ReportModal` 함수 다음)에 추가한다:

```tsx
function MoodShareSection({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [shareDisabled, setShareDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function load() {
    if (loaded) return;
    try {
      const res = await apiFetch(`/api/counseling/rooms/${roomId}/mood`);
      if (res.ok) {
        const data = (await res.json()) as { entries: MoodEntry[] };
        setEntries(data.entries);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.shareDisabled) {
          setShareDisabled(true);
        } else {
          setError("불러오지 못했어요");
        }
      }
    } catch {
      setError("불러오지 못했어요");
    } finally {
      setLoaded(true);
    }
  }

  function toggleOpen() {
    setOpen((v) => !v);
    if (!open) load();
  }

  const selected = entries.find((e) => e.date === selectedDate);

  return (
    <div className="border-b border-border px-5 py-2.5">
      <button onClick={toggleOpen} className="text-xs font-bold text-text-muted">
        최근 2주 기분 기록 {open ? "접기 ▴" : "보기 ▾"}
      </button>
      {open && (
        <div className="mt-2">
          {!loaded ? (
            <p className="text-xs text-text-faint">불러오는 중...</p>
          ) : shareDisabled ? (
            <p className="text-xs text-text-faint">클라이언트가 기분 기록 공유를 켜지 않았어요</p>
          ) : error ? (
            <p className="text-xs text-text-faint">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-text-faint">아직 기록이 없어요</p>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {entries.map((e) => {
                  const mood = MOODS.find((m) => m.score === e.score);
                  return (
                    <button
                      key={e.date}
                      onClick={() => setSelectedDate((prev) => (prev === e.date ? null : e.date))}
                      className={`flex flex-shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 ${
                        selectedDate === e.date ? "border-primary-dark bg-primary-light" : "border-border"
                      }`}
                    >
                      <span>{mood ? mood.emoji : "·"}</span>
                      <span className="text-[9px] text-text-faint">{e.date.slice(5)}</span>
                    </button>
                  );
                })}
              </div>
              {selected && (
                <div className="mt-2 rounded-xl border border-border bg-bg px-3 py-2.5">
                  <div className="flex flex-col gap-1">
                    {CHECKS.map((c) => {
                      const on = selected.checks.includes(c.id);
                      return (
                        <div key={c.id} className="flex items-center gap-2 text-[11px]">
                          <span className={on ? "text-primary-dark" : "text-text-faint"}>{on ? "✓" : "○"}</span>
                          <span className={on ? "text-text" : "text-text-faint"}>{c.text}</span>
                        </div>
                      );
                    })}
                  </div>
                  {selected.note && <p className="mt-2 text-[12px] leading-relaxed text-text-2">{selected.note}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/chat/[id]/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 5: 브라우저에서 확인**

클라이언트 계정으로 `/mood`에서 기분을 몇 개 기록하고 공유를 켠 뒤, 그 클라이언트와 활성 상담방이 있는 상담사 계정으로 로그인해서 `/chat/[방ID]`에 들어가 "최근 2주 기분 기록 보기"를 펼친다. 이모지 타일이 뜨는지, 클릭하면 체크리스트/메모가 보이는지 확인한다. 클라이언트가 공유를 끄면 상담사 쪽에서 "공유를 켜지 않았어요"로 바뀌는지, 상담을 종료하면 그 섹션 자체가 안 보이는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/chat/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 상담 채팅방에 상담사용 클라이언트 기분 기록 패널 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~5가 모두 커밋된 상태의 `main` 브랜치.

- [ ] **Step 1: 백엔드 전체 테스트**

```bash
cd server && node --test
```

Expected: 전부 PASS.

- [ ] **Step 2: 프론트엔드 빌드 재확인**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 3: main 푸시**

```bash
git push origin main
```

- [ ] **Step 4: 배포 상태 확인**

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<위에서 나온 커밋 해시>/status"
```

Expected: Vercel + Railway 모두 `"state": "success"`.

- [ ] **Step 5: 프로덕션에서 수동 확인**

`https://create-club.vercel.app`에서 클라이언트 계정으로 기분 기록 + 공유 켜기, 상담사 계정으로 활성 상담방에서 "최근 2주 기분 기록 보기"가 실제로 뜨는지 확인한다.

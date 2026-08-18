# 상담사 배정/채팅 시스템 (1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 또래상담사 목록을 실제 계정(User) 기반으로 전환하고, 상담 신청 시 실제 배정+채팅방이 생성되며, 한 번에 한 명의 상담사만 배정 가능하고, 채팅방에서 종료(평점)/신고를 할 수 있게 만든다.

**Architecture:** Express + Mongoose 백엔드에 `User.counselorProfile` 확장 필드와 `ChatRoom`(메시지 embed) · `Report` 모델을 추가하고 `server/routes/counseling.js`에 상담사 조회 + 채팅방 생명주기 라우트를 만든다. 프론트엔드는 `app/(shell)/counselors/**`와 `app/(shell)/chat/**`, `app/hooks/useChatRooms.tsx`에서 mock 데이터/localStorage를 걷어내고 API 호출로 교체한다. 상담사가 직접 로그인해 답장하는 화면은 2단계로 분리 — 이번 범위에는 없다.

**Tech Stack:** Node.js/Express/Mongoose (기존 서버), Next.js App Router 클라이언트 컴포넌트 (기존 프론트), 서버 테스트는 `node:test` + `supertest` + `mongodb-memory-server` (기존 `community-routes.test.js`와 동일 패턴).

**Design doc:** `docs/superpowers/specs/2026-08-18-counseling-assignment-design.md`

## Global Constraints

- 상담사 목록 조회(`GET /api/counselors`, `GET /api/counselors/:id`)는 비로그인도 가능(`optionalAuth`). 그 외 모든 `/api/counseling/*` 엔드포인트는 로그인 필요(`requireAuth`).
- 클라이언트 한 명은 동시에 `status:"active"`인 채팅방을 하나만 가질 수 있다. 위반 시 서버가 409를 반환한다.
- 채팅방 메시지의 `from`은 1단계에서 `"client"`만 허용한다 (상담사 답장은 2단계).
- 후기(텍스트) 기능은 만들지 않는다. 평점은 숫자만 남긴다.
- 신고(`report`)는 사유 제출과 동시에 방을 `status:"reported"`로 만들어 자동 종료한다 (평점 갱신 없음).
- 종료(`end`)는 `rating`(1~5)이 선택값이다. 넘기면 상담사 `rating`을 running average로, 안 넘기면 갱신 없이 종료만 한다.
- 서버 코드는 CommonJS(`require`)를 그대로 사용한다.
- 에러 메시지는 기존 라우트처럼 한글로 작성한다.
- 이 프로젝트는 프론트엔드 테스트 러너가 없다 — 프론트 태스크는 `tsc`/`eslint`/`npm run build` + 브라우저 수동 확인으로 검증한다.
- 커밋은 브랜치 없이 `main`에 직접 한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 새 npm 의존성을 추가하지 않는다 (이미 있는 `bcryptjs`, `mongoose`, `express`만 사용).

---

## Task 1: 백엔드 — 상담사 디렉토리 (User 확장 + 조회 라우트 + 시드)

**Files:**
- Modify: `server/models/User.js` (`counselorProfile` 서브스키마에 필드 추가)
- Create: `server/routes/counseling.js` (이번 태스크에서는 `/counselors`, `/counselors/:id` 두 라우트만 작성 — 나머지는 Task 2에서 같은 파일에 추가)
- Modify: `server/index.js` (`app.use("/api/community", communityRouter);` 아래에 `app.use("/api", counselingRouter);` 추가)
- Create: `server/scripts/seed-counselors.js`
- Test: `server/tests/counseling-routes.test.js`

**Interfaces:**
- Consumes: 기존 `server/models/User.js`, `server/middleware/auth.js`의 `optionalAuth`.
- Produces:
  - `GET /api/counselors` → `200` + `CounselorJSON[]`
  - `GET /api/counselors/:id` → `200` + `CounselorJSON` 또는 `404`
  - `CounselorJSON = { id: string, name: string, major: string, intro: string, avatarBg: string, avatarColor: string, tags: string[], rating: number, reviewCount: number, sessionCount: number, recentSessions: number, online: boolean }`
  - `serializeCounselor(user)` 함수 — Task 2가 `ChatRoom` 응답 안에서 상담사 정보를 직렬화할 때 이 함수의 필드 매핑(`counselorProfile.bio → intro`, `counselorProfile.ratingCount → reviewCount` 등)을 그대로 참고한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/counseling-routes.test.js` 파일을 아래 내용으로 생성한다.

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

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function createCounselor(overrides = {}) {
  return User.create({
    name: "이지원",
    email: overrides.email ?? "counselor1@test.com",
    passwordHash: "x",
    role: "counselor",
    counselorProfile: {
      major: "상담심리학과 4학년",
      bio: "시험 불안과 진로 고민을 많이 들어왔어요.",
      avatarBg: "#e8eff9",
      avatarColor: "#7a9cc5",
      specialties: ["학업", "진로"],
      rating: 4.9,
      ratingCount: 38,
      sessionCount: 112,
      recentSessions: 9,
      online: true,
      ...overrides.counselorProfile,
    },
  });
}

test("상담사 목록은 비로그인 상태로도 조회할 수 있다", async () => {
  await createCounselor();
  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "이지원");
  assert.equal(res.body[0].major, "상담심리학과 4학년");
  assert.equal(res.body[0].intro, "시험 불안과 진로 고민을 많이 들어왔어요.");
  assert.deepEqual(res.body[0].tags, ["학업", "진로"]);
  assert.equal(res.body[0].rating, 4.9);
  assert.equal(res.body[0].reviewCount, 38);
  assert.equal(res.body[0].sessionCount, 112);
  assert.equal(res.body[0].recentSessions, 9);
  assert.equal(res.body[0].online, true);
});

test("client 역할 User는 상담사 목록에 나오지 않는다", async () => {
  await createCounselor();
  await User.create({ name: "내담자", email: "client@test.com", passwordHash: "x", role: "client" });

  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
});

test("상담사 상세를 id로 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const res = await request(app).get(`/api/counselors/${counselor._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "이지원");
});

test("존재하지 않는 상담사 id를 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/counselors/${missingId}`);
  assert.equal(res.status, 404);
});

test("형식이 잘못된 상담사 id를 조회하면 404를 반환한다", async () => {
  const res = await request(app).get("/api/counselors/not-an-id");
  assert.equal(res.status, 404);
});

test("client 역할 User의 id로 상담사 상세를 조회하면 404를 반환한다", async () => {
  const client = await User.create({ name: "내담자", email: "client2@test.com", passwordHash: "x", role: "client" });
  const res = await request(app).get(`/api/counselors/${client._id}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && npm test`
Expected: `counseling-routes.test.js`의 모든 테스트가 실패 (`/api/counselors`가 아직 없어 404). 기존 `auth-routes.test.js`, `community-routes.test.js` 테스트는 그대로 통과해야 한다.

- [ ] **Step 3: `User.counselorProfile` 확장**

`server/models/User.js`를 아래처럼 수정한다 (기존 `major`, `year`, `specialties`, `bio`는 그대로 두고 필드를 추가):

```js
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
    avatarBg: String,
    avatarColor: String,
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    sessionCount: { type: Number, default: 0 },
    recentSessions: { type: Number, default: 0 },
    online: { type: Boolean, default: false },
  },
  clientProfile: {
    ageGroup: String,
    concerns: [String],
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
```

- [ ] **Step 4: `server/routes/counseling.js` 작성 (상담사 조회 라우트)**

```js
const express = require("express");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function serializeCounselor(user) {
  const p = user.counselorProfile || {};
  return {
    id: user._id.toString(),
    name: user.name,
    major: p.major || "",
    intro: p.bio || "",
    avatarBg: p.avatarBg || "#e8eff9",
    avatarColor: p.avatarColor || "#7a9cc5",
    tags: p.specialties || [],
    rating: p.rating || 0,
    reviewCount: p.ratingCount || 0,
    sessionCount: p.sessionCount || 0,
    recentSessions: p.recentSessions || 0,
    online: !!p.online,
  };
}

router.get("/counselors", optionalAuth, async (req, res) => {
  try {
    const counselors = await User.find({ role: "counselor" });
    res.json(counselors.map(serializeCounselor));
  } catch (err) {
    console.error("상담사 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counselors/:id", optionalAuth, async (req, res) => {
  try {
    const counselor = await User.findOne({ _id: req.params.id, role: "counselor" });
    if (!counselor) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    res.json(serializeCounselor(counselor));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담사 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = { router, serializeCounselor };
```

`serializeCounselor`를 `module.exports`에 함께 내보내는 이유: Task 2에서 `ChatRoom` 목록/상세 응답에 상담사 이름/아바타를 넣을 때 이 함수를 재사용하지 않고 별도로 populate된 필드만 뽑아 쓸 것이므로 사실 Task 2는 이 export에 의존하지 않는다. 다만 향후 확장 시 재사용할 수 있도록 내보내 둔다.

- [ ] **Step 5: `server/index.js`에 라우터 마운트**

`server/index.js`의 `app.use("/api/community", communityRouter);` 아래 줄에 추가한다:

```js
const { router: counselingRouter } = require("./routes/counseling");
```

이 줄은 파일 상단, 기존 `const communityRouter = require("./routes/community");` 아래에 추가한다. 그리고:

```js
app.use("/api/community", communityRouter);
app.use("/api", counselingRouter);
```

`counselingRouter`는 `/api` 바로 아래(별도 prefix 없이)에 마운트한다 — 라우터 내부 경로가 이미 `/counselors`, `/counseling/rooms` 등 전체 경로를 포함하고 있기 때문이다.

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd server && npm test`
Expected: `counseling-routes.test.js`의 6개 테스트 전부 통과. 기존 테스트들도 여전히 통과.

- [ ] **Step 7: 시드 스크립트 작성**

`server/scripts/seed-counselors.js` 파일을 생성한다 — 기존 `counselors/mock.ts`의 5명을 실제 `User` 문서로 옮기는 1회성 스크립트.

```js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const COUNSELORS = [
  {
    name: "이지원", email: "counselor1@example.com", major: "상담심리학과 4학년",
    bio: "시험 불안과 진로 고민을 많이 들어왔어요. 답을 주기보다 함께 정리해볼게요.",
    avatarBg: "#e8eff9", avatarColor: "#7a9cc5", specialties: ["학업", "진로", "감정"],
    rating: 4.9, ratingCount: 38, sessionCount: 112, recentSessions: 9, online: true,
  },
  {
    name: "박재현", email: "counselor2@example.com", major: "청소년상담 전공 3학년",
    bio: "친구 관계, 가족과의 갈등을 주로 다뤄요. 편하게 말 걸어주세요.",
    avatarBg: "#e1f5ee", avatarColor: "#0F6E56", specialties: ["관계", "가족"],
    rating: 4.7, ratingCount: 21, sessionCount: 64, recentSessions: 3, online: false,
  },
  {
    name: "정하늘", email: "counselor3@example.com", major: "심리학과 4학년",
    bio: "자존감과 감정 조절에 관심이 많아요. 천천히 가도 괜찮아요.",
    avatarBg: "#fdf0e8", avatarColor: "#c47a4a", specialties: ["자존감", "감정"],
    rating: 4.8, ratingCount: 15, sessionCount: 41, recentSessions: 6, online: true,
  },
  {
    name: "윤서아", email: "counselor4@example.com", major: "상담심리학과 3학년",
    bio: "이제 막 시작했어요. 답을 주기보다 끝까지 듣는 것부터 잘하고 싶어요.",
    avatarBg: "#eee8f7", avatarColor: "#7c6aa8", specialties: ["학업", "관계"],
    rating: 0, ratingCount: 0, sessionCount: 1, recentSessions: 1, online: true,
  },
  {
    name: "임도윤", email: "counselor5@example.com", major: "심리학과 4학년",
    bio: "진로 때문에 오래 헤맸던 경험이 있어요. 천천히 같이 정리해봐요.",
    avatarBg: "#e6f0e8", avatarColor: "#5a8a63", specialties: ["진로", "자존감"],
    rating: 5.0, ratingCount: 2, sessionCount: 3, recentSessions: 0, online: false,
  },
];

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI가 설정되지 않았습니다. server/.env를 확인하거나 환경변수로 넘겨주세요.");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  for (const c of COUNSELORS) {
    const passwordHash = await bcrypt.hash(`seed-${c.email}`, 10);
    await User.findOneAndUpdate(
      { email: c.email },
      {
        name: c.name,
        email: c.email,
        passwordHash,
        role: "counselor",
        counselorProfile: {
          major: c.major,
          bio: c.bio,
          avatarBg: c.avatarBg,
          avatarColor: c.avatarColor,
          specialties: c.specialties,
          rating: c.rating,
          ratingCount: c.ratingCount,
          sessionCount: c.sessionCount,
          recentSessions: c.recentSessions,
          online: c.online,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`시드 완료: ${c.name} (${c.email})`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => console.log("전체 상담사 시드 완료"))
  .catch((err) => {
    console.error("시드 중 오류:", err);
    process.exit(1);
  });
```

- [ ] **Step 8: 로컬 DB에 시드 스크립트 실행해서 확인**

`server/.env`에 로컬 개발용 `MONGODB_URI`가 설정되어 있는지 확인한 뒤 실행한다:

```bash
cd server && node scripts/seed-counselors.js
```

Expected: "시드 완료: 이지원 (counselor1@example.com)" 등 5줄 출력 + "전체 상담사 시드 완료". 이어서 로컬 서버(`npm run dev`)를 띄우고 `curl http://localhost:4000/api/counselors`로 5명이 나오는지 확인한다. 스크립트를 한 번 더 실행해도 5명 그대로인지(중복 생성 안 됨) 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add server/models/User.js server/routes/counseling.js server/index.js server/scripts/seed-counselors.js server/tests/counseling-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 상담사 디렉토리를 실제 User 계정 기반으로 전환

User.counselorProfile에 평점/세션통계/온라인상태 필드 추가하고
GET /api/counselors, /api/counselors/:id 라우트 작성.
기존 mock 상담사 5명을 실제 계정으로 옮기는 시드 스크립트 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — 채팅방 생명주기 (ChatRoom, Report, 라우트)

**Files:**
- Create: `server/models/ChatRoom.js`
- Create: `server/models/Report.js`
- Modify: `server/routes/counseling.js` (Task 1에서 만든 파일에 라우트 추가)
- Test: `server/tests/counseling-routes.test.js` (Task 1에서 만든 파일에 테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `server/routes/counseling.js`(같은 파일에 이어서 작성), `server/models/User.js`의 `counselorProfile.sessionCount`/`recentSessions`/`rating`/`ratingCount`.
- Produces:
  - `POST /api/counseling/rooms` `{ counselorId }` → `201` + `RoomJSON` 또는 `400`/`404`/`409`
  - `GET /api/counseling/rooms` → `200` + `RoomJSON[]`
  - `GET /api/counseling/rooms/:id` → `200` + `RoomJSON & { messages: MessageJSON[] }` 또는 `403`/`404`
  - `POST /api/counseling/rooms/:id/messages` `{ text }` → `201` + `MessageJSON[]` 또는 `400`/`403`/`404`
  - `POST /api/counseling/rooms/:id/end` `{ rating?: 1~5 }` → `200` + `{ id: string, status: string, rating: number|null }` 또는 `400`/`403`/`404`
  - `POST /api/counseling/rooms/:id/report` `{ reason }` → `200` + `{ id: string, status: string }` 또는 `400`/`403`/`404`
  - `RoomJSON = { id: string, counselorId: string, counselorName: string, counselorMajor: string, avatarBg: string, avatarColor: string, status: "active"|"ended"|"reported", lastMessage: string|null, createdAt: string }`
  - `MessageJSON = { id: string, from: "client", text: string, createdAt: string }`
  - Task 4(`useChatRooms.tsx`)와 Task 5(`chat/[id]/page.tsx`)는 이 `RoomJSON`/`MessageJSON` 필드명을 그대로 프론트 타입으로 옮겨 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/counseling-routes.test.js`의 맨 끝에 아래 테스트들을 추가한다 (파일 상단의 `before`/`after`/`beforeEach`/`createCounselor`는 그대로 재사용).

```js
async function signupClient(agent, overrides = {}) {
  const payload = {
    name: "내담자",
    email: "client@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("로그인한 클라이언트가 상담사에게 신청하면 방이 생성되고 상담사 통계가 증가한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);

  const res = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(res.status, 201);
  assert.equal(res.body.counselorId, counselor._id.toString());
  assert.equal(res.body.counselorName, "이지원");
  assert.equal(res.body.status, "active");

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.sessionCount, 113);
  assert.equal(updated.counselorProfile.recentSessions, 10);
});

test("비로그인 상태로 상담을 신청하면 401을 반환한다", async () => {
  const counselor = await createCounselor();
  const res = await request(app).post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(res.status, 401);
});

test("이미 활성 방이 있는데 다시 신청하면 409를 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 409);
});

test("존재하지 않는 상담사에게 신청하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: missingId });
  assert.equal(res.status, 404);
});

test("내 채팅방 목록을 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "active");
});

test("남의 채팅방 상세를 조회하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const otherAgent = request.agent(app);
  await signupClient(otherAgent, { email: "other-client@test.com" });
  const res = await otherAgent.get(`/api/counseling/rooms/${createRes.body.id}`);
  assert.equal(res.status, 403);
});

test("메시지를 보내면 방 상세에서 조회된다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const msgRes = await agent
    .post(`/api/counseling/rooms/${createRes.body.id}/messages`)
    .send({ text: "안녕하세요" });
  assert.equal(msgRes.status, 201);
  assert.equal(msgRes.body.length, 1);
  assert.equal(msgRes.body[0].text, "안녕하세요");
  assert.equal(msgRes.body[0].from, "client");

  const detailRes = await agent.get(`/api/counseling/rooms/${createRes.body.id}`);
  assert.equal(detailRes.body.messages.length, 1);
  assert.equal(detailRes.body.lastMessage, "안녕하세요");
});

test("빈 메시지를 보내면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "  " });
  assert.equal(res.status, 400);
});

test("평점과 함께 종료하면 상담사 평점이 갱신되고 방 상태가 ended가 된다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, 5);

  const updated = await User.findById(counselor._id);
  // (4.0*1 + 5) / 2 = 4.5
  assert.equal(updated.counselorProfile.rating, 4.5);
  assert.equal(updated.counselorProfile.ratingCount, 2);
});

test("평점 없이 종료하면 상담사 평점은 그대로다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, null);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
});

test("종료 후 다시 신청할 수 있다 (배정 해제됨)", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 201);
});

test("범위를 벗어난 평점으로 종료하면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 6 });
  assert.equal(res.status, 400);
});

test("신고하면 방이 reported 상태가 되고 다시 신청할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const reportRes = await agent
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(reportRes.status, 200);
  assert.equal(reportRes.body.status, "reported");

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 201);
});

test("사유 없이 신고하면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/report`).send({ reason: "  " });
  assert.equal(res.status, 400);
});

test("종료된 방에는 메시지를 보낼 수 없다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕" });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && npm test`
Expected: 위에서 추가한 테스트들이 실패 (`/api/counseling/rooms` 라우트가 아직 없어 404). Task 1에서 만든 상담사 조회 테스트들은 계속 통과해야 한다.

- [ ] **Step 3: `ChatRoom` 모델 작성**

`server/models/ChatRoom.js` 파일을 생성한다. `Post.comments`가 embedded subdocument인 패턴을 그대로 따른다.

```js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["client"], required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const chatRoomSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "ended", "reported"], default: "active" },
    messages: [messageSchema],
    rating: { type: Number, min: 1, max: 5, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
```

- [ ] **Step 4: `Report` 모델 작성**

`server/models/Report.js` 파일을 생성한다.

```js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Report", reportSchema);
```

- [ ] **Step 5: `server/routes/counseling.js`에 채팅방 라우트 추가**

Task 1에서 만든 `server/routes/counseling.js`의 상단 import에 아래를 추가한다:

```js
const ChatRoom = require("../models/ChatRoom");
const Report = require("../models/Report");
```

같은 파일의 `serializeCounselor` 함수 아래(`module.exports` 위)에 아래 두 직렬화 함수와 라우트들을 추가한다:

```js
function serializeRoom(room) {
  const counselor = room.counselor;
  const p = counselor.counselorProfile || {};
  const last = room.messages.length ? room.messages[room.messages.length - 1] : null;
  return {
    id: room._id.toString(),
    counselorId: counselor._id.toString(),
    counselorName: counselor.name,
    counselorMajor: p.major || "",
    avatarBg: p.avatarBg || "#e8eff9",
    avatarColor: p.avatarColor || "#7a9cc5",
    status: room.status,
    lastMessage: last ? last.text : null,
    createdAt: room.createdAt,
  };
}

function serializeMessage(m) {
  return { id: m._id.toString(), from: m.from, text: m.text, createdAt: m.createdAt };
}

router.post("/counseling/rooms", requireAuth, async (req, res) => {
  try {
    const { counselorId } = req.body || {};
    if (!counselorId) {
      return res.status(400).json({ error: "상담사를 선택해주세요" });
    }

    const counselor = await User.findOne({ _id: counselorId, role: "counselor" });
    if (!counselor) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }

    const existing = await ChatRoom.findOne({ client: req.user.id, status: "active" });
    if (existing) {
      return res.status(409).json({ error: "이미 진행 중인 상담이 있어요" });
    }

    const room = await ChatRoom.create({ client: req.user.id, counselor: counselorId });

    counselor.counselorProfile.sessionCount = (counselor.counselorProfile.sessionCount || 0) + 1;
    counselor.counselorProfile.recentSessions = (counselor.counselorProfile.recentSessions || 0) + 1;
    await counselor.save();

    await room.populate("counselor", "name counselorProfile");
    res.status(201).json(serializeRoom(room));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담 신청 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counseling/rooms", requireAuth, async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ client: req.user.id })
      .sort({ createdAt: -1 })
      .populate("counselor", "name counselorProfile");
    res.json(rooms.map(serializeRoom));
  } catch (err) {
    console.error("채팅방 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counseling/rooms/:id", requireAuth, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id).populate("counselor", "name counselorProfile");
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    res.json({ ...serializeRoom(room), messages: room.messages.map(serializeMessage) });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("채팅방 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/messages", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ error: "메시지를 입력해주세요" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ error: "메시지는 1000자를 넘을 수 없어요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "종료된 상담이에요" });
    }

    room.messages.push({ from: "client", text: text.trim() });
    await room.save();

    res.status(201).json(room.messages.map(serializeMessage));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("메시지 전송 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/end", requireAuth, async (req, res) => {
  try {
    const { rating } = req.body || {};
    if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "평점은 1~5 사이여야 해요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    room.status = "ended";
    room.endedAt = new Date();
    if (rating) room.rating = rating;
    await room.save();

    if (rating) {
      const counselor = await User.findById(room.counselor);
      const p = counselor.counselorProfile;
      const prevCount = p.ratingCount || 0;
      const prevAvg = p.rating || 0;
      p.ratingCount = prevCount + 1;
      p.rating = (prevAvg * prevCount + rating) / p.ratingCount;
      await counselor.save();
    }

    res.json({ id: room._id.toString(), status: room.status, rating: room.rating });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("상담 종료 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/report", requireAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason?.trim()) {
      return res.status(400).json({ error: "신고 사유를 입력해주세요" });
    }
    if (reason.trim().length > 500) {
      return res.status(400).json({ error: "신고 사유는 500자를 넘을 수 없어요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    await Report.create({ reporter: req.user.id, room: room._id, counselor: room.counselor, reason: reason.trim() });
    room.status = "reported";
    room.endedAt = new Date();
    await room.save();

    res.json({ id: room._id.toString(), status: room.status });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("신고 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd server && npm test`
Expected: `counseling-routes.test.js`의 모든 테스트(Task 1의 6개 + 이번에 추가한 15개) 통과. 기존 `auth-routes.test.js`, `community-routes.test.js`도 계속 통과.

- [ ] **Step 7: 커밋**

```bash
git add server/models/ChatRoom.js server/models/Report.js server/routes/counseling.js server/tests/counseling-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 상담 배정/채팅방 생명주기 백엔드 추가

ChatRoom(embedded 메시지), Report 모델과 신청/목록/상세/메시지/
종료/신고 라우트 작성. 클라이언트당 활성 방 1개 제한(409),
종료 시 선택적 평점으로 상담사 rating running average 갱신,
신고 시 평점 없이 자동 종료.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 상담사 목록/상세를 실제 API에 연결

**Files:**
- Modify: `app/(shell)/counselors/mock.ts` (mock 데이터 제거, 타입만 유지)
- Modify: `app/(shell)/counselors/page.tsx`
- Modify: `app/(shell)/counselors/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `GET /api/counselors`, `GET /api/counselors/:id` (필드는 `CounselorJSON` 그대로), Task 2의 `POST /api/counseling/rooms`, `GET /api/counseling/rooms`. `lib/matching.ts`의 `matchScore`, `isEligible`, `isNewCounselor`, `reserveSlotForNewcomer`(수정 없음, 그대로 재사용).
- Produces: 없음 (이 태스크는 UI 말단).

- [ ] **Step 1: `counselors/mock.ts`에서 mock 데이터 제거, 타입만 남기기**

`app/(shell)/counselors/mock.ts`를 아래 내용으로 전부 교체한다:

```ts
export type CounselorTag = "진로" | "학업" | "관계" | "가족" | "감정" | "자존감";

export type Counselor = {
  id: string;
  name: string;
  major: string;
  intro: string;
  avatarBg: string;
  avatarColor: string;
  tags: CounselorTag[];
  rating: number;
  reviewCount: number;
  sessionCount: number;
  /** 최근 7일 상담 횟수. 배정에서 기회를 고르게 나누는 데 쓴다. */
  recentSessions: number;
  /** 지금 바로 상담 가능한지 */
  online: boolean;
};

export const ALL_TAGS: CounselorTag[] = ["진로", "학업", "관계", "가족", "감정", "자존감"];
```

(`Review` 타입, `COUNSELORS` 배열, `Counselor.reviews` 필드를 제거했다 — 후기 기능은 만들지 않기로 했다.)

- [ ] **Step 2: `counselors/page.tsx`를 API 연결로 교체**

`app/(shell)/counselors/page.tsx`의 import와 `CounselorsPageContent` 함수를 아래와 같이 수정한다.

기존:
```tsx
import { COUNSELORS, ALL_TAGS, type CounselorTag } from "./mock";
import { matchScore, isEligible, isNewCounselor, reserveSlotForNewcomer } from "@/lib/matching";
```

를:
```tsx
import { ALL_TAGS, type Counselor, type CounselorTag } from "./mock";
import { matchScore, isEligible, isNewCounselor, reserveSlotForNewcomer } from "@/lib/matching";
import { apiFetch } from "@/lib/api";
```

로 바꾸고, `import { Suspense, useMemo, useState } from "react";`를 `import { Suspense, useEffect, useMemo, useState } from "react";`로 바꾼다.

`CounselorsPageContent` 함수 본문 시작 부분(`const fromTest = ...` 아래)에 데이터 로딩을 추가한다:

```tsx
function CounselorsPageContent() {
  const fromTest = useSearchParams().get("from") === "test";
  const [topic, setTopic] = useState<CounselorTag | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("match");
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/counselors")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Counselor[]) => setCounselors(data))
      .catch(() => setCounselors([]))
      .finally(() => setLoading(false));
  }, []);

  const list = useMemo(() => {
    let result = counselors.filter(isEligible);
    if (topic) result = result.filter((c) => c.tags.includes(topic));
    if (onlineOnly) result = result.filter((c) => c.online);

    if (sort === "rating") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    } else if (sort === "sessions") {
      result = [...result].sort((a, b) => b.sessionCount - a.sessionCount);
    } else {
      result = [...result].sort((a, b) => matchScore(b, topic) - matchScore(a, topic));
      result = reserveSlotForNewcomer(result);
    }
    return result;
  }, [counselors, topic, onlineOnly, sort]);
```

목록 렌더링 부분(`{list.length === 0 ? (...) : (...)}`)의 조건 앞에 로딩 상태를 추가한다:

```tsx
      {loading ? (
        <div className="py-16 text-center text-sm text-text-faint">불러오는 중이에요...</div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-faint">조건에 맞는 상담사가 없어요</div>
      ) : (
```

- [ ] **Step 3: `counselors/[id]/page.tsx`를 API 연결 + 배정 상태 분기로 교체**

`app/(shell)/counselors/[id]/page.tsx` 파일 전체를 아래로 교체한다:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Rating from "@/app/components/ui/Rating";
import { isNewCounselor } from "@/lib/matching";
import { apiFetch } from "@/lib/api";
import { loginHref } from "@/app/components/RequireAuth";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import type { Counselor } from "../mock";

type RoomSummary = { id: string; status: "active" | "ended" | "reported" };

export default function CounselorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const [counselor, setCounselor] = useState<Counselor | null | undefined>(undefined);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/counselors/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setCounselor(null);
          return;
        }
        setCounselor(await res.json());
      })
      .catch(() => setCounselor(null));
  }, [params.id]);

  useEffect(() => {
    if (auth.phase !== "in") return;
    apiFetch("/api/counseling/rooms")
      .then((res) => (res.ok ? res.json() : []))
      .then((rooms: RoomSummary[]) => {
        const active = rooms.find((r) => r.status === "active");
        setActiveRoomId(active ? active.id : null);
      })
      .catch(() => setActiveRoomId(null));
  }, [auth.phase]);

  async function apply() {
    if (auth.phase === "out") {
      router.push(loginHref(`/counselors/${params.id}`));
      return;
    }
    if (!counselor) return;
    setApplying(true);
    setError(null);
    try {
      const res = await apiFetch("/api/counseling/rooms", {
        method: "POST",
        body: JSON.stringify({ counselorId: counselor.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "상담 신청에 실패했어요");
        return;
      }
      router.push(`/chat/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없어요");
    } finally {
      setApplying(false);
    }
  }

  if (counselor === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (!counselor) {
    return (
      <div className="py-16 text-center text-sm text-text-faint">
        상담사를 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/counselors" className="font-bold text-primary-dark">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <div className="flex gap-4">
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold"
            style={{ background: counselor.avatarBg, color: counselor.avatarColor }}
          >
            {counselor.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-text">{counselor.name}</h1>
              {counselor.online && (
                <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                  지금 가능
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted">{counselor.major}</div>
            <div className="mt-1.5 flex items-center gap-3">
              {isNewCounselor(counselor) ? (
                <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  이제 막 시작했어요
                </span>
              ) : (
                <Rating value={counselor.rating} count={counselor.reviewCount} size="md" />
              )}
              <span className="text-xs text-text-faint">상담 {counselor.sessionCount}회</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-2">{counselor.intro}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counselor.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-primary-light px-2 py-1 text-[11px] font-bold text-primary-dark"
            >
              {t}
            </span>
          ))}
        </div>

        {activeRoomId ? (
          <Link
            href={`/chat/${activeRoomId}`}
            className="mt-5 block rounded-xl bg-primary-dark py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            채팅 상담으로 이동 →
          </Link>
        ) : (
          <button
            onClick={apply}
            disabled={applying}
            className="mt-5 block w-full rounded-xl bg-primary-dark py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
          >
            {applying ? "신청 중..." : counselor.online ? "지금 상담 시작하기 →" : "상담 신청하기 →"}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      </Card>
    </div>
  );
}
```

기존에 있던 "후기" `<Card>` 섹션(리뷰 목록)은 완전히 제거했다 — 후기 기능은 이번 범위에 없다.

- [ ] **Step 4: 타입체크 + 린트 확인**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/counselors/"
```

Expected: 에러 없음. (`isEligible`이 참조하던 `reviewCount` 필드가 `Counselor` 타입에 그대로 남아있으므로 `lib/matching.ts`는 수정할 필요가 없다 — 타입체크가 이를 확인해준다.)

- [ ] **Step 5: 로컬에서 수동 확인**

로컬 서버(`cd server && npm run dev`)와 프론트(`npm run dev`)를 모두 띄우고 Task 1의 시드 스크립트를 실행해둔 상태에서:
- `/counselors`에서 상담사 5명이 실제로 뜨는지, 필터/정렬이 동작하는지 확인
- 로그인 후 상담사 하나를 클릭해 "상담 신청하기" → `/chat/:id`로 이동하는지 확인
- 같은 상담사 페이지나 다른 상담사 페이지로 다시 들어가면 "채팅 상담으로 이동" 버튼으로 바뀌어 있는지 확인 (6·7번 요구사항)
- 로그아웃 상태에서 상담사 목록은 보이되 "상담 신청하기"를 누르면 로그인 화면으로 이동하는지 확인

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/counselors/mock.ts" "app/(shell)/counselors/page.tsx" "app/(shell)/counselors/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 상담사 목록/신청 화면을 실제 API에 연결

COUNSELORS mock 제거하고 GET /api/counselors(/:id) 호출로 교체.
이미 활성 채팅방이 있으면 "상담 신청하기" 대신 "채팅 상담으로
이동" 버튼을 보여줘 상담사를 한 명으로 제한.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — `useChatRooms` 훅과 채팅 목록을 실제 API에 연결

**Files:**
- Delete: `app/(shell)/chat/mock.ts`
- Modify: `app/hooks/useChatRooms.tsx`
- Modify: `app/(shell)/chat/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `GET /api/counseling/rooms` (`RoomJSON[]`).
- Produces: `useChatRooms(): { rooms: ChatRoom[], loading: boolean, refresh: () => Promise<void> }` — `ChatRoom = RoomJSON` 그대로(타입 재정의). Task 5가 `refresh`를 종료/신고 후 목록 갱신에 사용한다.

- [ ] **Step 1: `app/hooks/useChatRooms.tsx`를 API 기반으로 재작성**

파일 전체를 아래로 교체한다. 기존의 `markRoomRead`/`sendMessage`/`unread`/localStorage 로직은 전부 제거한다 — 1단계에서는 상담사 응답이 없어 "안 읽음" 개념이 의미가 없고, 메시지 전송은 Task 5에서 채팅방 상세 페이지가 직접 API를 호출하도록 옮긴다.

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

export type ChatRoom = {
  id: string;
  counselorId: string;
  counselorName: string;
  counselorMajor: string;
  avatarBg: string;
  avatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  createdAt: string;
};

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  /** 종료/신고 등으로 목록이 바뀐 뒤 다시 불러올 때 쓴다. */
  refresh: () => Promise<void>;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/counseling/rooms");
      setRooms(res.ok ? await res.json() : []);
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ rooms, loading, refresh }), [rooms, loading, refresh]);

  return <ChatRoomsContext.Provider value={value}>{children}</ChatRoomsContext.Provider>;
}

export function useChatRooms(): ChatRoomsContextValue {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) {
    throw new Error("useChatRooms must be used within a ChatRoomsProvider");
  }
  return ctx;
}
```

`app/layout.tsx`는 `ChatRoomsProvider`/`useChatRooms` export 이름을 그대로 import하고 있으므로 수정할 필요가 없다.

- [ ] **Step 2: `app/(shell)/chat/mock.ts` 삭제**

```bash
git rm "app/(shell)/chat/mock.ts"
```

- [ ] **Step 3: `chat/page.tsx`를 새 필드명에 맞게 수정**

`app/(shell)/chat/page.tsx` 파일 전체를 아래로 교체한다 (`unread` 뱃지 제거, `counselorRole`→`counselorMajor`, 로딩/빈 상태 추가):

```tsx
"use client";

import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useChatRooms } from "@/app/hooks/useChatRooms";

export default function ChatListPage() {
  const { rooms, loading } = useChatRooms();

  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shell:grid-cols-[300px_1fr]">
        <div className="border-b border-border shell:border-b-0 shell:border-r">
          <div className="border-b border-border px-4 py-4 font-extrabold text-text">상담 목록</div>
          <div>
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">불러오는 중이에요...</div>
            ) : rooms.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">아직 상담이 없어요</div>
            ) : (
              rooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/chat/${r.id}`}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-primary-xlight"
                >
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
                    style={{ background: r.avatarBg, color: r.avatarColor }}
                  >
                    {r.counselorName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-text">
                      {r.counselorName}
                      {r.status !== "active" && (
                        <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-text-faint">
                          종료됨
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-text-muted">{r.lastMessage ?? "아직 메시지가 없어요"}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
        <div className="hidden flex-col items-center justify-center gap-4 py-24 text-text-faint shell:flex">
          왼쪽에서 상담을 선택해주세요
          <Link
            href="/counselors"
            className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-primary-dark transition-colors hover:border-primary-dark"
          >
            새 상담사 찾아보기 →
          </Link>
        </div>
      </div>
    </RequireAuth>
  );
}
```

- [ ] **Step 4: 타입체크 + 린트 확인**

```bash
npx tsc --noEmit
npx eslint app/hooks/useChatRooms.tsx "app/(shell)/chat/page.tsx"
```

Expected: 에러 없음. (`app/(shell)/chat/[id]/page.tsx`는 아직 옛 `useChatRooms` API — `rooms.find`, `markRoomRead`, `sendMessage` — 를 쓰고 있어서 이 시점엔 타입 에러가 날 수 있다. Task 5에서 그 파일을 통째로 고치므로 지금은 무시하고 넘어간다. 위 `eslint`/`tsc` 명령이 `chat/[id]/page.tsx`에서 에러를 내더라도, 그 에러가 정확히 "Task 5에서 다룰 옛 훅 사용법" 때문인지 확인만 하고 다음 태스크로 넘긴다.)

- [ ] **Step 5: 커밋**

```bash
git add app/hooks/useChatRooms.tsx "app/(shell)/chat/page.tsx"
git rm "app/(shell)/chat/mock.ts"
git commit -m "$(cat <<'EOF'
feat: useChatRooms 훅과 채팅 목록을 실제 API에 연결

CHAT_ROOMS mock과 localStorage 읽음상태 로직을 걷어내고
GET /api/counseling/rooms 기반으로 재작성. 1단계엔 상담사
응답이 없어 안읽음 뱃지 개념도 함께 제거.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 프론트엔드 — 채팅방 상세 화면에 메시지 전송 + 종료/신고 추가

**Files:**
- Modify: `app/(shell)/chat/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `GET /api/counseling/rooms/:id`, `POST .../messages`, `POST .../end`, `POST .../report`. Task 4의 `useChatRooms().refresh`.
- Produces: 없음 (말단 UI).

- [ ] **Step 1: `chat/[id]/page.tsx` 전체를 메시지 전송 + 종료/신고 모달 포함해서 재작성**

파일 전체를 아래로 교체한다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useChatRooms } from "@/app/hooks/useChatRooms";

type Message = { id: string; from: "client"; text: string; createdAt: string };

type RoomDetail = {
  id: string;
  counselorId: string;
  counselorName: string;
  counselorMajor: string;
  avatarBg: string;
  avatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  createdAt: string;
  messages: Message[];
};

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh: refreshRoomList } = useChatRooms();
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"end" | "report" | null>(null);

  useEffect(() => {
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadRoom() {
    try {
      const res = await apiFetch(`/api/counseling/rooms/${params.id}`);
      setRoom(res.ok ? await res.json() : null);
    } catch {
      setRoom(null);
    }
  }

  async function send() {
    if (!room || !input.trim() || room.status !== "active") return;
    const text = input.trim();
    setInput("");
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const messages = await res.json();
      setRoom({ ...room, messages, lastMessage: text });
    }
  }

  async function handleEnd(rating: number | null) {
    if (!room) return;
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/end`, {
      method: "POST",
      body: JSON.stringify(rating ? { rating } : {}),
    });
    if (res.ok) {
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    }
  }

  async function handleReport(reason: string) {
    if (!room || !reason.trim()) return;
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/report`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    }
  }

  if (room === undefined) {
    return (
      <RequireAuth>
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      </RequireAuth>
    );
  }

  if (!room) {
    return (
      <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
        <div className="py-16 text-center text-text-faint">채팅방을 찾을 수 없어요.</div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="flex h-[calc(100dvh-200px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shell:h-[calc(100dvh-160px)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <button onClick={() => router.push("/chat")} className="text-text-muted">
            ←
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: room.avatarBg, color: room.avatarColor }}
          >
            {room.counselorName.slice(0, 1)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-text">{room.counselorName}</div>
            <div className="text-xs text-text-muted">{room.counselorMajor}</div>
          </div>
          {room.status === "active" && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="px-2 text-lg text-text-muted">
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setModal("end");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-text hover:bg-bg"
                  >
                    상담 종료하기
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setModal("report");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-danger hover:bg-bg"
                  >
                    신고하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {room.status !== "active" && (
          <div className="border-b border-border bg-bg px-5 py-2 text-center text-xs font-semibold text-text-faint">
            {room.status === "reported" ? "신고 접수 후 종료된 상담이에요" : "종료된 상담이에요"}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-5">
          {room.messages.map((m) => (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[420px] rounded-2xl rounded-br-md bg-primary-dark px-3 py-2.5 text-sm leading-relaxed text-white">
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
            disabled={room.status !== "active"}
            placeholder={room.status === "active" ? "메시지를 입력하세요" : "종료된 상담이에요"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={room.status !== "active"}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>

      {modal === "end" && <EndModal onSubmit={handleEnd} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal onSubmit={handleReport} onClose={() => setModal(null)} />}
    </RequireAuth>
  );
}

function EndModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (rating: number | null) => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">상담을 종료할까요?</h2>
        <p className="mt-1 text-[13px] text-text-muted">상담사에게 별점을 남길 수 있어요 (선택)</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              aria-label={`${n}점`}
              className={`text-2xl ${rating !== null && n <= rating ? "text-[#f0b429]" : "text-border"}`}
            >
              ★
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(rating)}
            className="flex-1 rounded-xl bg-primary-dark py-2.5 text-sm font-extrabold text-white"
          >
            {rating ? "평점 남기고 종료" : "건너뛰고 종료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">신고하기</h2>
        <p className="mt-1 text-[13px] text-text-muted">신고 접수와 함께 상담이 바로 종료돼요.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="어떤 점이 불편했는지 알려주세요"
          className="mt-4 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={!reason.trim()}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
          >
            신고하고 종료
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트 확인**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/chat/"
```

Expected: 에러 없음. (`react-hooks/set-state-in-effect`나 `exhaustive-deps` 관련 경고가 뜨면 A그룹 때처럼 `eslint-disable-next-line` 주석으로 처리한다 — 위 코드에는 `loadRoom`이 `params.id`가 바뀔 때만 재실행되면 되므로 `exhaustive-deps`를 미리 disable해뒀다.)

- [ ] **Step 3: 로컬에서 수동 확인**

로컬 서버 + 프론트를 띄우고:
- 상담사에게 신청해서 채팅방 진입 → 메시지 입력해서 전송 → 화면에 바로 보이는지 확인
- "⋯" 메뉴 → "상담 종료하기" → 별점 선택 후 종료 → 입력창이 비활성화되고 "종료된 상담이에요" 배너가 뜨는지 확인
- 상담사 상세 페이지로 돌아가서 "상담 신청하기" 버튼이 다시 보이는지 확인 (배정 해제됨)
- 새로 신청 → 채팅방 진입 → "⋯" → "신고하기" → 사유 입력 후 신고 → 방이 바로 종료 상태가 되는지 확인
- `curl http://localhost:4000/api/health` 등으로 서버가 살아있는 상태에서 network 탭으로 실제 API 호출이 나가는지 확인

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/chat/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 채팅방에 메시지 전송 + 종료(평점)/신고 기능 추가

메시지 전송을 useChatRooms 대신 방 상세 API로 직접 호출하도록
옮기고, 헤더 메뉴에 상담 종료하기(별점 모달, 건너뛰기 가능)와
신고하기(사유 입력 → 자동 종료) 액션을 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~5가 모두 커밋된 상태의 `main` 브랜치.

- [ ] **Step 1: 서버 테스트 + 프론트 빌드 전체 재확인**

```bash
cd server && npm test
cd .. && npx tsc --noEmit && npx eslint . && npm run build
```

Expected: 서버 테스트 전부 통과(`auth-routes`, `community-routes`, `counseling-routes`, `token`, `auth-middleware`), 프론트 타입체크/린트/빌드 전부 에러 없음.

- [ ] **Step 2: main 푸시**

```bash
git push origin main
```

- [ ] **Step 3: 배포 상태 확인**

```bash
git rev-parse HEAD
```

위 커밋 해시로:

```bash
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<커밋해시>/status"
```

Expected: Vercel(create-club, create-club-5kro) + Railway 모두 `"state": "success"`.

- [ ] **Step 4: 프로덕션 DB에 상담사 시드 실행**

로컬에서 프로덕션 `MONGODB_URI`(Railway 환경변수에서 확인)를 지정해 1회 실행한다:

```bash
cd server && MONGODB_URI="<프로덕션 Atlas 연결 문자열>" node scripts/seed-counselors.js
```

Expected: 5명 시드 완료 로그. `curl https://createclub-production.up.railway.app/api/counselors`로 5명이 응답에 나오는지 확인.

- [ ] **Step 5: 프로덕션에서 수동 확인**

`https://create-club.vercel.app`에서:
- `/counselors`에 실제 상담사 5명이 뜨는지
- 로그인 후 한 명에게 신청 → 채팅방 생성/이동 확인
- 다른 상담사 상세 페이지에서 "채팅 상담으로 이동" 버튼으로 바뀌어 있는지
- 채팅방에서 메시지 전송, "상담 종료하기"(평점) → 다시 신청 가능해지는지
- 새 상담 신청 → "신고하기" → 자동 종료되는지

# 관리자 공지사항 관리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커뮤니티 탭의 공지사항을 `mock.ts`의 하드코딩 배열에서 서버 저장 방식으로 바꾸고, 관리자 페이지에서 실제로 만들기/수정/삭제할 수 있게 한다.

**Architecture:** 백엔드에 `Notice` 모델과 두 축의 라우트를 추가한다 — 공개 조회(`server/routes/notices.js`, 인증 불필요)와 관리자 전용 쓰기(`server/routes/adminNotices.js`, `requireAuth`+`requireAdmin`). 프론트엔드는 커뮤니티 페이지/공지 상세 페이지를 정적 배열 대신 공개 조회 API를 쓰도록 바꾸고, 새 `/admin/notices` 페이지를 만들어 관리자 CRUD UI를 제공한다.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind v4(프론트엔드).

**Spec:** `docs/superpowers/specs/2026-08-23-admin-notices-design.md`

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 새 npm 의존성 없음.
- 관리자 페이지의 공지 목록 조회는 별도 관리자 전용 엔드포인트를 새로 만들지 않고 공개 `GET /api/community/notices`를 그대로 재사용한다(스펙 A-3 참조 — 공지는 애초에 전부 공개 콘텐츠).

---

## Task 1: `Notice` 모델 + 공개 조회 API

**Files:**
- Create: `server/models/Notice.js`
- Create: `server/routes/notices.js`
- Modify: `server/index.js`
- Create: `server/tests/notice-routes.test.js`

**Interfaces:**
- Produces: `Notice` 모델(`{title, body, createdAt}`), `GET /api/community/notices` → `[{id, title, body, createdAt}, ...]`(createdAt 내림차순), `GET /api/community/notices/:id` → `{id, title, body, createdAt}` 또는 404. Task 2가 같은 `Notice` 모델을 쓰고, Task 3(프론트)이 이 두 엔드포인트를 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/notice-routes.test.js` 신규 생성:

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
let Notice;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  Notice = require("../models/Notice");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test("공지가 없으면 빈 배열을 반환한다", async () => {
  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("공지 목록은 비로그인 상태로도 조회할 수 있고 최신순으로 정렬된다", async () => {
  await Notice.create({ title: "첫 번째", body: "내용1" });
  await new Promise((r) => setTimeout(r, 5));
  await Notice.create({ title: "두 번째", body: "내용2" });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].title, "두 번째");
  assert.equal(res.body[1].title, "첫 번째");
  assert.ok(res.body[0].id);
  assert.ok(res.body[0].createdAt);
});

test("공지 상세는 비로그인 상태로도 조회할 수 있다", async () => {
  const notice = await Notice.create({ title: "제목", body: "본문 내용" });

  const res = await request(app).get(`/api/community/notices/${notice._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "제목");
  assert.equal(res.body.body, "본문 내용");
});

test("존재하지 않는 공지를 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/community/notices/${missingId}`);
  assert.equal(res.status, 404);
});

test("잘못된 형식의 id로 조회해도 500이 아니라 404를 반환한다", async () => {
  const res = await request(app).get("/api/community/notices/not-a-valid-id");
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/notice-routes.test.js
```

Expected: FAIL (모듈/라우트가 없어 404 또는 에러).

- [ ] **Step 3: `Notice` 모델 생성**

`server/models/Notice.js` 신규 생성:

```js
const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);
```

- [ ] **Step 4: 라우트 구현**

`server/routes/notices.js` 신규 생성:

```js
const express = require("express");
const Notice = require("../models/Notice");

const router = express.Router();

function serializeNotice(notice) {
  return { id: notice._id.toString(), title: notice.title, body: notice.body, createdAt: notice.createdAt };
}

router.get("/", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices.map(serializeNotice));
  } catch (err) {
    console.error("공지사항 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    res.json(serializeNotice(notice));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

`server/index.js`에서 다른 라우터들과 같은 자리에 추가한다:

```js
const moodRouter = require("./routes/mood");
```

를:

```js
const moodRouter = require("./routes/mood");
const noticesRouter = require("./routes/notices");
```

로 교체하고,

```js
app.use("/api/mood", moodRouter);
```

를:

```js
app.use("/api/mood", moodRouter);
app.use("/api/community/notices", noticesRouter);
```

로 교체한다.

- [ ] **Step 5: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/notice-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 6: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/models/Notice.js server/routes/notices.js server/index.js server/tests/notice-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 공지사항 공개 조회 API 추가 (GET /api/community/notices)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 관리자 CRUD API

**Files:**
- Create: `server/routes/adminNotices.js`
- Modify: `server/index.js`
- Create: `server/tests/admin-notices-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `Notice` 모델.
- Produces: `POST /api/admin/notices`(`requireAuth`+`requireAdmin`) → 201 + 생성된 공지. `PATCH /api/admin/notices/:id` → 수정된 공지. `DELETE /api/admin/notices/:id` → `{}`. Task 4(관리자 프론트)가 이 세 엔드포인트를 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/admin-notices-routes.test.js` 신규 생성:

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
let Notice;
let signToken;
let COOKIE_NAME;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Notice = require("../models/Notice");
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

test("비로그인 상태로 공지를 작성하면 401을 반환한다", async () => {
  const res = await request(app).post("/api/admin/notices").send({ title: "제목", body: "내용" });
  assert.equal(res.status, 401);
});

test("admin이 아닌 로그인 사용자가 공지를 작성하면 403을 반환한다", async () => {
  const client = await User.create({ name: "학생", email: "client@test.com", passwordHash: "x", role: "client" });
  const token = signToken({ id: client._id.toString(), role: "client" });
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", `${COOKIE_NAME}=${token}`)
    .send({ title: "제목", body: "내용" });
  assert.equal(res.status, 403);
});

test("admin이 공지를 작성하면 201과 생성된 공지를 반환하고 목록에 나타난다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "새 공지", body: "공지 내용입니다" });
  assert.equal(res.status, 201);
  assert.equal(res.body.title, "새 공지");
  assert.equal(res.body.body, "공지 내용입니다");
  assert.ok(res.body.id);

  const listRes = await request(app).get("/api/community/notices");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].title, "새 공지");
});

test("제목이나 내용이 비어있으면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "  ", body: "내용" });
  assert.equal(res.status, 400);
});

test("admin이 공지를 수정하면 반영된다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "원본", body: "원본 내용" });

  const res = await request(app)
    .patch(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin))
    .send({ title: "수정됨" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "수정됨");
  assert.equal(res.body.body, "원본 내용");
});

test("존재하지 않는 공지를 수정하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .patch(`/api/admin/notices/${missingId}`)
    .set("Cookie", adminCookie(admin))
    .send({ title: "수정됨" });
  assert.equal(res.status, 404);
});

test("admin이 공지를 삭제하면 목록에서 사라진다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "지울 공지", body: "내용" });

  const res = await request(app)
    .delete(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/notices");
  assert.equal(listRes.body.length, 0);
});

test("존재하지 않는 공지를 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .delete(`/api/admin/notices/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/admin-notices-routes.test.js
```

Expected: FAIL (라우트가 없음).

- [ ] **Step 3: 라우트 구현**

`server/routes/adminNotices.js` 신규 생성:

```js
const express = require("express");
const Notice = require("../models/Notice");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serializeNotice(notice) {
  return { id: notice._id.toString(), title: notice.title, body: notice.body, createdAt: notice.createdAt };
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "제목과 내용을 모두 입력해주세요" });
    }
    const notice = await Notice.create({ title: title.trim(), body: body.trim() });
    res.status(201).json(serializeNotice(notice));
  } catch (err) {
    console.error("공지사항 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    const { title, body } = req.body || {};
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      notice.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      notice.body = body.trim();
    }
    await notice.save();
    res.json(serializeNotice(notice));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 수정 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    res.json({});
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

`server/index.js`에서:

```js
const moodRouter = require("./routes/mood");
const noticesRouter = require("./routes/notices");
```

를:

```js
const moodRouter = require("./routes/mood");
const noticesRouter = require("./routes/notices");
const adminNoticesRouter = require("./routes/adminNotices");
```

로 교체하고,

```js
app.use("/api/mood", moodRouter);
app.use("/api/community/notices", noticesRouter);
```

를:

```js
app.use("/api/mood", moodRouter);
app.use("/api/community/notices", noticesRouter);
app.use("/api/admin/notices", adminNoticesRouter);
```

로 교체한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/admin-notices-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

```bash
git add server/routes/adminNotices.js server/index.js server/tests/admin-notices-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 관리자 공지사항 작성/수정/삭제 API 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 커뮤니티 페이지가 공지 API를 사용하도록 교체

**Files:**
- Modify: `app/(shell)/community/mock.ts`
- Modify: `app/(shell)/community/time.ts`
- Modify: `app/(shell)/community/types.ts`
- Modify: `app/(shell)/community/page.tsx`
- Modify: `app/(shell)/community/notice/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `GET /api/community/notices`, `GET /api/community/notices/:id`.
- Produces: `formatNoticeDate(iso: string): string`(`app/(shell)/community/time.ts`에 추가), `export type NoticeItem`(`app/(shell)/community/types.ts`에 추가, 기존 `CommunityPost`류와 같은 자리). 둘 다 이 태스크 내부에서 쓰이고, Task 4(관리자 페이지)도 같은 이름으로 import해서 재사용한다 — 관리자 페이지가 별도의 `NoticeItem` 타입을 새로 선언하지 않도록 한다.

- [ ] **Step 1: `mock.ts`에서 `NOTICE_POSTS` 제거**

`app/(shell)/community/mock.ts`에서 다음 블록을 삭제한다:

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

`TOPICS`, `TOPIC_EMOJI`는 그대로 둔다.

- [ ] **Step 2: `time.ts`에 `formatNoticeDate` 추가**

`app/(shell)/community/time.ts` 끝에 추가한다:

```ts
export function formatNoticeDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}
```

- [ ] **Step 3: `types.ts`에 `NoticeItem` 타입 추가**

`app/(shell)/community/types.ts` 끝에 추가한다:

```ts
export type NoticeItem = { id: string; title: string; body: string; createdAt: string };
```

- [ ] **Step 4: `community/page.tsx`가 API에서 공지를 불러오도록 수정**

```tsx
import { NOTICE_POSTS, TOPICS, TOPIC_EMOJI } from "./mock";
import { formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost } from "./types";
```

를:

```tsx
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost, NoticeItem } from "./types";
```

로 교체한다.

`const [posts, setPosts] = useState<CommunityPost[]>([]);` 다음 줄에 추가한다:

```tsx
  const [notices, setNotices] = useState<NoticeItem[]>([]);
```

기존 posts를 불러오는 `useEffect` 다음에 별도로 추가한다:

```tsx
  useEffect(() => {
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]));
  }, []);
```

공지사항 탭 블록:

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

를:

```tsx
        {tab === "notice" ? (
          <div className="flex flex-col gap-2">
            {notices.map((n) => (
              <Link key={n.id} href={`/community/notice/${n.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="text-sm font-bold text-primary-dark">공지</div>
                  <div className="mt-1 font-bold text-text">{n.title}</div>
                  <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(n.createdAt)}</div>
                </Card>
              </Link>
            ))}
          </div>
        ) : loading ? (
```

로 교체한다.

사이드바 공지사항 카드:

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
```

를:

```tsx
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          <div className="flex flex-col divide-y divide-border">
            {notices.map((n) => (
              <Link
                key={n.id}
                href={`/community/notice/${n.id}`}
                className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
              >
                {n.title}
              </Link>
            ))}
          </div>
```

로 교체한다.

- [ ] **Step 5: `notice/[id]/page.tsx`를 API 조회로 전면 교체**

`app/(shell)/community/notice/[id]/page.tsx` 전체를 다음으로 교체한다:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatNoticeDate } from "../../time";
import type { NoticeItem } from "../../types";

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const [notice, setNotice] = useState<NoticeItem | null | undefined>(undefined);

  useEffect(() => {
    apiFetch(`/api/community/notices/${params.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NoticeItem | null) => setNotice(data))
      .catch(() => setNotice(null));
  }, [params.id]);

  if (notice === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

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
      <Link href="/community" className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
        ← 커뮤니티로 돌아가기
      </Link>
      <Card>
        <div className="text-sm font-bold text-primary-dark">공지</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(notice.createdAt)}</div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-2">{notice.body}</p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/page.tsx" "app/(shell)/community/notice/[id]/page.tsx" "app/(shell)/community/mock.ts" "app/(shell)/community/time.ts" "app/(shell)/community/types.ts"
```

Expected: 에러 없음.

- [ ] **Step 7: 브라우저에서 확인**

```bash
npm run dev
```

`http://localhost:3000/community`에서 공지사항 탭과 사이드바에 아무것도 안 뜨는지 확인한다(아직 관리자 페이지가 없어 공지를 만들 방법이 없으므로 빈 상태가 정상). 아래 명령으로 공지를 하나 직접 만들어서 확인한다(관리자로 로그인한 브라우저 세션의 쿠키가 필요 없는 curl로는 401이 뜨므로, 대신 DB에 직접 넣거나 Task 2에서 이미 통과한 백엔드 테스트로 API 동작 자체는 검증됐다고 보고, 여기서는 프론트가 빈 배열/에러 상태를 깨지지 않고 보여주는지에 집중한다). `/community/notice/aaaaaaaaaaaaaaaaaaaaaaaa`처럼 존재하지 않는 id로 접속해 "공지를 찾을 수 없어요"가 뜨는지 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add "app/(shell)/community/mock.ts" "app/(shell)/community/time.ts" "app/(shell)/community/types.ts" "app/(shell)/community/page.tsx" "app/(shell)/community/notice/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 커뮤니티 공지사항을 하드코딩 배열 대신 서버 API로 교체

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — 관리자 공지사항 관리 페이지

**Files:**
- Create: `app/admin/notices/page.tsx`
- Modify: `app/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: Task 1의 `GET /api/community/notices`, Task 2의 `POST`/`PATCH`/`DELETE /api/admin/notices`, Task 3이 추가한 `formatNoticeDate`(`app/(shell)/community/time.ts`)와 `NoticeItem`(`app/(shell)/community/types.ts`) — 새로 선언하지 않고 그대로 import한다.

- [ ] **Step 1: `AdminNav.tsx`에 메뉴 추가**

```tsx
const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/reports", label: "상담 신고" },
  { href: "/admin/counselors", label: "상담사 인증" },
];
```

를:

```tsx
const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/notices", label: "공지사항 관리" },
  { href: "/admin/reports", label: "상담 신고" },
  { href: "/admin/counselors", label: "상담사 인증" },
];
```

로 교체한다.

- [ ] **Step 2: 관리자 공지사항 페이지 생성**

`app/admin/notices/page.tsx` 신규 생성:

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { formatNoticeDate } from "@/app/(shell)/community/time";
import type { NoticeItem } from "@/app/(shell)/community/types";

export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 목록 조회
  useEffect(load, []);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newTitle, body: newBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewTitle("");
    setNewBody("");
    setCreating(false);
    load();
  }

  function startEdit(n: NoticeItem) {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditBody(n.body);
    setFormError(null);
  }

  async function submitEdit(e: FormEvent, id: string) {
    e.preventDefault();
    setFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editTitle, body: editBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const res = await apiFetch(`/api/admin/notices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-text">공지사항 관리</h1>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setFormError(null);
            }}
            className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
          >
            새 공지 작성
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="mb-4 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="내용"
            rows={4}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
          />
          {formError && <p className="text-xs font-semibold text-danger">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
            >
              취소
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
              작성하기
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : notices.length === 0 ? (
        <div className="py-16 text-center text-text-faint">공지가 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {notices.map((n) =>
            editingId === n.id ? (
              <form
                key={n.id}
                onSubmit={(e) => submitEdit(e, n.id)}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
              >
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                {formError && <p className="text-xs font-semibold text-danger">{formError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                  >
                    취소
                  </button>
                  <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                    저장
                  </button>
                </div>
              </form>
            ) : (
              <div key={n.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-text">{n.title}</span>
                  <span className="text-[11px] text-text-faint">{formatNoticeDate(n.createdAt)}</span>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-text-2">{n.body}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(n)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      confirmDeleteId === n.id
                        ? "border-danger bg-[#fff0f0] text-danger"
                        : "border-danger text-danger hover:bg-[#fff0f0]"
                    }`}
                  >
                    {confirmDeleteId === n.id ? "정말 삭제할까요?" : "삭제"}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint "app/admin/notices/page.tsx" "app/admin/AdminNav.tsx"
npm run build
```

Expected: 전부 에러 없음. `npm run build`는 이 태스크가 이 플랜의 마지막 파일 변경 태스크이므로 프로젝트 전체를 한 번 더 확인하는 의미로 포함한다.

- [ ] **Step 4: 브라우저에서 확인**

관리자 계정으로 로그인해 `/admin/notices`에 들어가 "새 공지 작성"으로 공지를 하나 만들고, `/community` 공지사항 탭과 사이드바에 바로 뜨는지, 클릭하면 상세 페이지가 보이는지 확인한다. "수정"으로 내용을 바꾸고 반영되는지, "삭제"를 누르면 "정말 삭제할까요?"로 바뀌었다가 한 번 더 누르면 실제로 지워지고 커뮤니티에서도 사라지는지 확인한다. `AdminNav`에 "공지사항 관리" 메뉴가 보이는지도 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/admin/notices/page.tsx" "app/admin/AdminNav.tsx"
git commit -m "$(cat <<'EOF'
feat: 관리자 페이지에 공지사항 관리(작성/수정/삭제) 화면 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~4가 모두 커밋된 상태의 `main` 브랜치.

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

`https://create-club.vercel.app/admin/notices`에서 공지를 하나 만들고, `https://create-club.vercel.app/community`에서 실제로 보이는지 확인한다.

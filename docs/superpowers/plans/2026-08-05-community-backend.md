# 커뮤니티 백엔드 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커뮤니티(게시글/댓글/좋아요/작성글 개수)를 목데이터에서 실제 MongoDB 백엔드로 전환한다.

**Architecture:** Express + Mongoose 백엔드에 `Post` 모델 1개(댓글은 서브도큐먼트로 내장)와 `/api/community` 라우터를 추가한다. 프론트엔드는 `app/(shell)/community/**`와 이를 소비하는 홈/마이페이지에서 mock 데이터 import를 `apiFetch` 호출로 교체한다.

**Tech Stack:** Node.js/Express/Mongoose (기존 서버), Next.js App Router 클라이언트 컴포넌트 (기존 프론트), 테스트는 `node:test` + `supertest` + `mongodb-memory-server` (기존 `auth-routes.test.js`와 동일 패턴).

**Design doc:** `docs/superpowers/specs/2026-08-05-community-backend-design.md`

## Global Constraints

- 글쓰기/댓글/좋아요는 로그인한 사용자만 가능. 조회(목록/상세)는 비로그인도 가능.
- 기존 데모 목데이터 8개는 시드하지 않는다 — 커뮤니티는 빈 상태로 시작한다.
- 게시글에 성별/나이를 표시하지 않는다. 작성자 역할(`role`)만 "상담사" / "고민 청소년"으로 표시한다.
- 좋아요는 사용자당 1회, 토글 가능해야 한다.
- 공지사항(`NOTICE_POSTS`)과 주목받는 주제(`TOPICS`/`TOPIC_EMOJI`)는 이번 범위에서 정적 데이터로 유지한다.
- 서버 코드는 CommonJS(`require`)를 그대로 사용한다 (기존 `server/` 전체가 CommonJS).
- 에러 메시지는 기존 라우트처럼 한글로 작성한다.

---

## Task 1: 백엔드 — Post 모델 + community 라우터

**Files:**
- Create: `server/models/Post.js`
- Modify: `server/middleware/auth.js` (10~14번째 줄 근처에 `optionalAuth` 함수와 export 추가)
- Create: `server/routes/community.js`
- Modify: `server/index.js` (`app.use("/api/auth", authRouter);` 아래에 커뮤니티 라우터 마운트 추가)
- Test: `server/tests/community-routes.test.js`

**Interfaces:**
- Consumes: 기존 `server/models/User.js`의 `name`, `role` 필드. 기존 `server/lib/token.js`의 `verifyToken`, `COOKIE_NAME`. 기존 `server/middleware/auth.js`의 `requireAuth`.
- Produces:
  - `GET /api/community/posts` → `200` + `CommunityPostJSON[]`
  - `GET /api/community/posts/:id` → `200` + `CommunityPostJSON & { comments: CommunityCommentJSON[] }` 또는 `404`
  - `POST /api/community/posts` (인증 필요) → `201` + `CommunityPostJSON` 또는 `400`/`401`
  - `POST /api/community/posts/:id/comments` (인증 필요) → `201` + `CommunityCommentJSON[]` 또는 `400`/`401`/`404`
  - `POST /api/community/posts/:id/like` (인증 필요) → `200` + `{ liked: boolean, likeCount: number }` 또는 `401`/`404`
  - `GET /api/community/my-posts/count` (인증 필요) → `200` + `{ count: number }` 또는 `401`
  - `CommunityPostJSON = { id: string, tag: string, title: string, body: string, authorName: string, authorRole: "상담사" | "고민 청소년", createdAt: string, views: number, likeCount: number, cmtCount: number, likedByMe: boolean }`
  - `CommunityCommentJSON = { id: string, authorName: string, authorRole: "상담사" | "고민 청소년", text: string, createdAt: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/community-routes.test.js` 파일을 아래 내용으로 생성한다.

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

async function signup(agent, overrides = {}) {
  const payload = {
    name: "테스트유저",
    email: "user@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("비로그인 상태에서 게시글 목록은 빈 배열을 반환한다", async () => {
  const res = await request(app).get("/api/community/posts");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("비로그인 상태로 게시글을 작성하면 401을 반환한다", async () => {
  const res = await request(app)
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(res.status, 401);
});

test("로그인 후 게시글을 작성하면 목록과 상세에 나타난다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const createRes = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목입니다", body: "내용입니다" });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.title, "제목입니다");
  assert.equal(createRes.body.authorName, "테스트유저");
  assert.equal(createRes.body.authorRole, "고민 청소년");

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].title, "제목입니다");

  const detailRes = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.title, "제목입니다");
  assert.deepEqual(detailRes.body.comments, []);
});

test("제목이나 내용이 비어있으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "  ", body: "내용" });
  assert.equal(res.status, 400);
});

test("게시글 상세를 조회할 때마다 조회수가 1씩 증가한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const first = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  const second = await request(app).get(`/api/community/posts/${createRes.body.id}`);

  assert.equal(first.body.views, 1);
  assert.equal(second.body.views, 2);
});

test("존재하지 않는 게시글을 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/community/posts/${missingId}`);
  assert.equal(res.status, 404);
});

test("상담사가 댓글을 작성하면 상세 조회 시 댓글 목록과 cmtCount에 반영된다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const counselorAgent = request.agent(app);
  await signup(counselorAgent, { email: "counselor@test.com", role: "counselor", name: "상담사쌤" });
  const commentRes = await counselorAgent
    .post(`/api/community/posts/${createRes.body.id}/comments`)
    .send({ text: "힘내세요" });

  assert.equal(commentRes.status, 201);
  assert.equal(commentRes.body.length, 1);
  assert.equal(commentRes.body[0].authorName, "상담사쌤");
  assert.equal(commentRes.body[0].authorRole, "상담사");

  const detailRes = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.body.comments.length, 1);
  assert.equal(detailRes.body.cmtCount, 1);
});

test("비로그인 상태로 댓글을 작성하면 401을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const res = await request(app)
    .post(`/api/community/posts/${createRes.body.id}/comments`)
    .send({ text: "댓글" });

  assert.equal(res.status, 401);
});

test("좋아요를 누르면 likeCount가 1이 되고, 다시 누르면 0으로 돌아간다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const likerAgent = request.agent(app);
  await signup(likerAgent, { email: "liker@test.com" });

  const likeRes = await likerAgent.post(`/api/community/posts/${createRes.body.id}/like`);
  assert.equal(likeRes.status, 200);
  assert.deepEqual(likeRes.body, { liked: true, likeCount: 1 });

  const unlikeRes = await likerAgent.post(`/api/community/posts/${createRes.body.id}/like`);
  assert.deepEqual(unlikeRes.body, { liked: false, likeCount: 0 });
});

test("좋아요를 누른 사용자가 조회하면 likedByMe가 true로 나온다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  await authorAgent.post(`/api/community/posts/${createRes.body.id}/like`);

  const detailRes = await authorAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.body.likedByMe, true);

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  const otherDetailRes = await otherAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(otherDetailRes.body.likedByMe, false);
});

test("비로그인 상태로 좋아요를 누르면 401을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const res = await request(app).post(`/api/community/posts/${createRes.body.id}/like`);
  assert.equal(res.status, 401);
});

test("내가 쓴 글 개수만 정확히 센다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글1", body: "내용1" });
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글2", body: "내용2" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  await otherAgent.post("/api/community/posts").send({ tag: "고민", title: "다른사람글", body: "내용" });

  const res = await agent.get("/api/community/my-posts/count");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { count: 2 });
});

test("비로그인 상태로 작성한 글 개수를 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/community/my-posts/count");
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && npm test`
Expected: `community-routes.test.js`의 모든 테스트가 에러로 실패 (`/api/community/posts`가 존재하지 않아 404 등). 기존 `auth-routes.test.js` 테스트는 그대로 통과해야 한다.

- [ ] **Step 3: Post 모델 작성**

`server/models/Post.js` 파일을 생성한다.

```js
const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tag: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    views: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Post", postSchema);
```

- [ ] **Step 4: `optionalAuth` 미들웨어 추가**

`server/middleware/auth.js`를 아래 전체 내용으로 교체한다 (기존 `requireAuth`는 그대로 두고 `optionalAuth`만 추가).

```js
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

function optionalAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (err) {
      // 유효하지 않은 토큰은 비로그인 상태로 취급한다
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
```

- [ ] **Step 5: community 라우터 작성**

`server/routes/community.js` 파일을 생성한다.

```js
const express = require("express");
const Post = require("../models/Post");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function authorLabel(user) {
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorName: post.author.name,
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
  };
}

function serializeComment(comment) {
  return {
    id: comment._id.toString(),
    authorName: comment.author.name,
    authorRole: authorLabel(comment.author),
    text: comment.text,
    createdAt: comment.createdAt,
  };
}

router.get("/posts", optionalAuth, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).populate("author", "name role");
    res.json(posts.map((p) => serializePost(p, req.user?.id)));
  } catch (err) {
    console.error("게시글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/posts/:id", optionalAuth, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate("author", "name role")
      .populate("comments.author", "name role");

    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    res.json({
      ...serializePost(post, req.user?.id),
      comments: post.comments.map(serializeComment),
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { tag, title, body } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }

    const post = await Post.create({ author: req.user.id, tag, title: title.trim(), body: body.trim() });
    await post.populate("author", "name role");

    res.status(201).json(serializePost(post, req.user.id));
  } catch (err) {
    console.error("게시글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ error: "댓글 내용을 입력해주세요" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    post.comments.push({ author: req.user.id, text: text.trim() });
    await post.save();
    await post.populate("comments.author", "name role");

    res.status(201).json(post.comments.map(serializeComment));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("댓글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts/:id/like", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    const idx = post.likedBy.findIndex((id) => id.toString() === req.user.id);
    let liked;
    if (idx === -1) {
      post.likedBy.push(req.user.id);
      liked = true;
    } else {
      post.likedBy.splice(idx, 1);
      liked = false;
    }
    await post.save();

    res.json({ liked, likeCount: post.likedBy.length });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("좋아요 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-posts/count", requireAuth, async (req, res) => {
  try {
    const count = await Post.countDocuments({ author: req.user.id });
    res.json({ count });
  } catch (err) {
    console.error("작성한 글 개수 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

- [ ] **Step 6: index.js에 라우터 마운트**

`server/index.js`에서 `const authRouter = require("./routes/auth");` 아래 줄에 추가:

```js
const communityRouter = require("./routes/community");
```

그리고 `app.use("/api/auth", authRouter);` 아래 줄에 추가:

```js
app.use("/api/community", communityRouter);
```

- [ ] **Step 7: 테스트 실행해서 통과 확인**

Run: `cd server && npm test`
Expected: `community-routes.test.js`와 `auth-routes.test.js`의 모든 테스트가 통과 (`tests 32`, `pass 32`, `fail 0` — 기존 18개 + 신규 14개).

- [ ] **Step 8: 커밋**

```bash
git add server/models/Post.js server/middleware/auth.js server/routes/community.js server/index.js server/tests/community-routes.test.js
git commit -m "feat: 커뮤니티 게시글/댓글/좋아요 백엔드 API 추가"
```

---

## Task 2: 프론트엔드 — 커뮤니티 목록/상세를 실제 API에 연결

**Files:**
- Create: `app/(shell)/community/types.ts`
- Create: `app/(shell)/community/time.ts`
- Modify: `app/(shell)/community/page.tsx` (전체 교체)
- Modify: `app/(shell)/community/[id]/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 1의 `GET /api/community/posts`, `GET /api/community/posts/:id`, `POST /api/community/posts/:id/like`, `POST /api/community/posts/:id/comments` (모두 `apiFetch`로 호출). 기존 `app/hooks/useAuthStatus.tsx`의 `useAuthStatus()`.
- Produces: `CommunityPost`, `CommunityComment`, `CommunityPostDetail` 타입 (Task 3, Task 4에서 재사용). `formatRelativeTime(iso: string): string` 함수 (Task 3에서 재사용).

- [ ] **Step 1: 공용 타입 파일 작성**

`app/(shell)/community/types.ts` 파일을 생성한다.

```ts
export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
};

export type CommunityComment = {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  createdAt: string;
};

export type CommunityPostDetail = CommunityPost & {
  comments: CommunityComment[];
};
```

- [ ] **Step 2: 상대 시간 표시 헬퍼 작성**

`app/(shell)/community/time.ts` 파일을 생성한다.

```ts
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}
```

- [ ] **Step 3: 커뮤니티 목록 페이지를 API 연결로 교체**

`app/(shell)/community/page.tsx` 전체를 아래 내용으로 교체한다.

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NOTICE_POSTS, TOPICS, TOPIC_EMOJI } from "./mock";
import { formatRelativeTime } from "./time";
import type { CommunityPost } from "./types";

type Tab = "best" | "all" | "notice";

export default function CommunityPage() {
  const [auth] = useAuthStatus();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("best");
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list =
      tab === "best"
        ? [...posts].filter((p) => p.likeCount >= 15).sort((a, b) => b.likeCount - a.likeCount)
        : [...posts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    return list;
  }, [tab, search, posts]);

  function handleWriteClick(e: React.MouseEvent) {
    if (auth.phase === "out") {
      e.preventDefault();
      router.push("/login");
    }
  }

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
            onClick={handleWriteClick}
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
        ) : loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-text-faint">해당하는 글이 없어요</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                      {p.tag}
                    </span>
                    {p.likeCount >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{p.body}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-faint">
                    <span>
                      {p.authorName} · {formatRelativeTime(p.createdAt)}
                    </span>
                    <span>👍 {p.likeCount}</span>
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

- [ ] **Step 4: 게시글 상세 페이지를 API 연결로 교체**

`app/(shell)/community/[id]/page.tsx` 전체를 아래 내용으로 교체한다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS, TOPIC_EMOJI } from "../mock";
import { formatRelativeTime } from "../time";
import type { CommunityPostDetail } from "../types";

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [auth] = useAuthStatus();
  const [post, setPost] = useState<CommunityPostDetail | null | undefined>(undefined);
  const [comment, setComment] = useState("");

  useEffect(() => {
    apiFetch(`/api/community/posts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setPost(null);
          return;
        }
        setPost(await res.json());
      })
      .catch(() => setPost(null));
  }, [params.id]);

  function requireLogin() {
    if (auth.phase === "out") {
      router.push("/login");
      return true;
    }
    return false;
  }

  async function toggleLike() {
    if (requireLogin() || !post) return;
    const res = await apiFetch(`/api/community/posts/${post.id}/like`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { liked: boolean; likeCount: number };
    setPost({ ...post, likedByMe: data.liked, likeCount: data.likeCount });
  }

  async function submitComment() {
    if (requireLogin() || !post || !comment.trim()) return;
    const res = await apiFetch(`/api/community/posts/${post.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text: comment.trim() }),
    });
    if (!res.ok) return;
    const comments = await res.json();
    setPost({ ...post, comments, cmtCount: comments.length });
    setComment("");
  }

  if (post === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
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
            {post.likeCount >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
          <h1 className="mb-3 text-2xl font-black text-text">{post.title}</h1>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.authorName} · {post.authorRole} · {formatRelativeTime(post.createdAt)} · 조회 {post.views}
          </div>
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>

          <div className="my-6 flex justify-center border-y border-border py-6">
            <button
              onClick={toggleLike}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-6 py-3 font-bold transition-colors ${
                post.likedByMe ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-xl">👍</span>
              <span className="text-sm text-text">{post.likeCount}</span>
            </button>
          </div>

          <div className="mb-3 font-extrabold text-text">
            댓글 <span className="text-primary-dark">{post.comments.length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {post.comments.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary-dark">
                  💬
                </div>
                <div>
                  <div className="text-[13px] font-bold text-text">
                    {c.authorName}
                    <span className="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-dark">
                      {c.authorRole}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-text-2">{c.text}</div>
                  <div className="mt-1 text-[11px] text-text-faint">{formatRelativeTime(c.createdAt)}</div>
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

이 단계에서 댓글의 역할 배지는 항상 표시된다 (기존 mock은 역할이 빈 문자열이면 배지를 숨겼지만, 실제 사용자는 항상 `상담사` 또는 `고민 청소년` 역할을 가지므로 조건 없이 항상 표시하도록 단순화했다).

- [ ] **Step 5: 타입 체크 + 린트 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (단, Task 3에서 `mock.ts`를 정리하기 전까지는 `app/(shell)/page.tsx`가 여전히 `COMMUNITY_POSTS`를 참조하므로 그쪽 에러는 무시하고 `community/page.tsx`, `community/[id]/page.tsx`, `community/types.ts`, `community/time.ts`에 새로운 에러가 없는지만 확인한다.)

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 6: 로컬에서 수동 확인**

`server`와 루트에서 각각 `npm run dev`로 백엔드/프론트를 띄운 뒤 (필요하면 `mongodb-memory-server`를 임시로 띄워 `MONGODB_URI`를 지정), 브라우저에서:
1. 로그인 후 `/community/write`에서 글 작성 (Task 3 완료 전이라 아직 mock UI일 수 있음 — 이 단계에서는 `/community`에서 목록이 빈 배열로 정상 렌더링되는지만 확인해도 된다)
2. 개발자 도구 네트워크 탭에서 `GET /api/community/posts`가 200으로 호출되는지 확인

- [ ] **Step 7: 커밋**

```bash
git add "app/(shell)/community/types.ts" "app/(shell)/community/time.ts" "app/(shell)/community/page.tsx" "app/(shell)/community/[id]/page.tsx"
git commit -m "feat: 커뮤니티 목록/상세 화면을 실제 API에 연결"
```

---

## Task 3: 프론트엔드 — 글쓰기 페이지 연결 + mock.ts 정리

**Files:**
- Modify: `app/(shell)/community/write/page.tsx` (전체 교체)
- Modify: `app/(shell)/community/mock.ts` (`CommunityComment`, `CommunityPost` 타입과 `COMMUNITY_POSTS` 배열 제거, `TOPICS`/`TOPIC_EMOJI`/`NOTICE_POSTS`만 유지)

**Interfaces:**
- Consumes: Task 1의 `POST /api/community/posts`. Task 2의 `apiFetch`, `useAuthStatus` 사용 패턴.
- Produces: 없음 (터미널 소비자).

- [ ] **Step 1: 글쓰기 페이지를 API 연결로 교체**

`app/(shell)/community/write/page.tsx` 전체를 아래 내용으로 교체한다.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS } from "../mock";

export default function CommunityWritePage() {
  const router = useRouter();
  const [auth] = useAuthStatus();
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (auth.phase === "out") {
      router.push("/login");
      return;
    }
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/community/posts", {
        method: "POST",
        body: JSON.stringify({ tag: category, title, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "글 작성에 실패했습니다");
        return;
      }
      router.push(`/community/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
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
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "올리는 중..." : "✍️ 올리기"}
        </button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: mock.ts에서 목데이터 게시글 제거**

`app/(shell)/community/mock.ts` 전체를 아래 내용으로 교체한다 (더 이상 쓰이지 않는 `CommunityComment`, `CommunityPost` 타입과 `COMMUNITY_POSTS` 배열을 제거하고, 여전히 정적으로 유지하는 `TOPICS`/`TOPIC_EMOJI`/`NOTICE_POSTS`만 남긴다).

```ts
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
```

- [ ] **Step 3: 타입 체크 확인**

Run: `npx tsc --noEmit`
Expected: `app/(shell)/page.tsx`에서 `COMMUNITY_POSTS`를 찾을 수 없다는 에러가 발생해야 정상이다 (Task 4에서 고침). `community/write/page.tsx`, `community/mock.ts` 관련 에러는 없어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/community/write/page.tsx" "app/(shell)/community/mock.ts"
git commit -m "feat: 커뮤니티 글쓰기 화면을 실제 API에 연결하고 목데이터 정리"
```

---

## Task 4: 프론트엔드 — 홈 인기글 + 마이페이지 작성글 개수 연결

**Files:**
- Modify: `app/(shell)/page.tsx` (전체 교체)
- Modify: `app/(shell)/mypage/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 1의 `GET /api/community/posts`, `GET /api/community/my-posts/count`. Task 2의 `CommunityPost` 타입.
- Produces: 없음 (터미널 소비자).

- [ ] **Step 1: 홈 화면의 인기글을 실제 API로 교체**

`app/(shell)/page.tsx` 전체를 아래 내용으로 교체한다. 실시간 데이터를 클라이언트에서 가져와야 하므로 서버 컴포넌트에서 클라이언트 컴포넌트로 바뀐다 (이 앱의 다른 화면들도 전부 클라이언트 컴포넌트로 되어 있어 일관된 패턴이다).

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import SectionTitle from "@/app/components/ui/SectionTitle";
import { apiFetch } from "@/lib/api";
import { TEST_CARDS } from "./test/data";
import type { CommunityPost } from "./community/types";

const QUOTES = [
  { text: "어둠 속을 걷고 있다면, 그냥 계속 걸어라.", src: "— 윈스턴 처칠" },
  { text: "넘어지는 것이 실패가 아니다. 넘어진 채로 머무는 것이 실패다.", src: "— 메리 피커드" },
  { text: "지금 이 순간도 괜찮다. 천천히 가도 된다. 멈춰있어도 된다.", src: "— 채사장" },
];

export default function HomePage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const quote = QUOTES[0];

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]));
  }, []);

  const popularPosts = [...posts]
    .filter((p) => p.likeCount >= 15)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 5);

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
              href={`/test?type=${t.type}`}
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
            {popularPosts.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-text-faint">아직 인기 글이 없어요</div>
            ) : (
              popularPosts.map((p) => (
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
                    <span className="font-bold text-primary-dark">👍 {p.likeCount}</span>
                    <span>💬 {p.cmtCount}</span>
                  </span>
                </Link>
              ))
            )}
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

- [ ] **Step 2: 마이페이지 작성한 글 개수를 실제 API로 교체**

`app/(shell)/mypage/page.tsx` 전체를 아래 내용으로 교체한다.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { apiFetch } from "@/lib/api";

export default function MypagePage() {
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    apiFetch("/api/community/my-posts/count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => setPostCount(data.count))
      .catch(() => setPostCount(0));
  }, []);

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
                <div className="font-extrabold text-white">{postCount}</div>
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

- [ ] **Step 3: 타입 체크 + 린트 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 1~4가 모두 끝났으므로 프로젝트 전체가 깨끗해야 한다)

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 4: 서버 테스트 전체 재확인**

Run: `cd server && npm test`
Expected: 32개 테스트 전부 통과

- [ ] **Step 5: 로컬 브라우저로 전체 흐름 수동 확인**

로컬 dev 서버(프론트 + 백엔드 + 로컬 MongoDB, 예: `mongodb-memory-server`로 임시 인스턴스)를 띄운 뒤:
1. 로그인 → `/community/write`에서 글 작성 → 작성한 글의 상세 페이지로 이동하는지 확인
2. `/community` 목록에 방금 쓴 글이 보이는지 확인
3. 다른 계정으로 로그인해 좋아요를 15개 이상 만들 수는 없으니, 좋아요 버튼을 눌러 토글되는지, 댓글을 남겼을 때 실시간으로 반영되는지 확인
4. `/mypage`에서 "작성한 글" 숫자가 실제 작성 개수와 일치하는지 확인
5. 홈(`/`)에서 좋아요 15개 이상인 글이 있을 때만 "인기 글"에 나타나는지 확인 (없으면 "아직 인기 글이 없어요" 문구 확인)
6. 로그아웃 상태에서 글쓰기/좋아요/댓글 시도 시 로그인 페이지로 이동하는지 확인

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/page.tsx" "app/(shell)/mypage/page.tsx"
git commit -m "feat: 홈 인기글과 마이페이지 작성한 글 개수를 실제 API에 연결"
```

---

## Task 5: 배포 확인

**Files:** 없음 (배포 파이프라인 확인만)

- [ ] **Step 1: main 브랜치 푸시 확인**

Task 1~4가 각각 커밋된 상태에서 `git push origin main`을 실행했는지 확인한다 (아직 안 했다면 지금 푸시한다).

- [ ] **Step 2: 배포 상태 확인**

Run: `curl -s https://api.github.com/repos/hoi256678-cpu/createClub/commits/<마지막 커밋 해시>/status`
Expected: Vercel(2개 프로젝트) + Railway 모두 `"state": "success"`

- [ ] **Step 3: 프로덕션에서 수동 확인**

`https://create-club.vercel.app`에서 로그인 후 글쓰기/댓글/좋아요/마이페이지 작성한 글 개수가 실제로 동작하는지 확인한다. `curl https://createclub-production.up.railway.app/api/health`로 `mongoConnected: true` 확인.

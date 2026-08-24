# 공지-게시글 통합 (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금 별도 탭/모델(`Notice`)로 분리된 공지사항을 없애고, 커뮤니티 게시글(`Post`)의 `isNotice`/`pinned` 필드로 흡수한다. 굵게/링크/이미지 여러 장 에디터(원래 공지 전용)를 모든 게시글 작성/수정으로 확대하고, 기존 공지 3건을 게시글로 옮긴다.

**Architecture:** `Post` 모델에 `isNotice: Boolean`, `pinned: Boolean`을 추가하고 `body`를 평문에서 sanitize된 HTML로 바꾼다(공지 때 쓰던 sanitize-html 검증 로직을 `community.js`로 그대로 이식). 공지 전용이던 `NoticeEditor`를 `PostEditor`로 일반화해 모든 글쓰기/수정 폼이 쓰게 하고, 두 폼(작성/수정)의 중복 UI를 `PostForm` 공용 컴포넌트로 뺀다. `isNotice`/`pinned`는 관리자만 설정 가능(작성 시 및 Plan A의 수정 화면에서). 목록은 고정된 공지를 조건부로 맨 위에 묶어서 보여준다(전체글 탭 + 필터/검색 없을 때만). `Notice` 모델/라우트는 완전히 삭제하고, 기존 데이터는 1회성 스크립트로 이관한다.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind v4, `@tiptap/*`(프론트엔드, 이미 설치됨).

**Spec:** `docs/superpowers/specs/2026-08-24-notice-post-unification-design.md`(C절). **선행 조건:** Plan A(게시글 수정/삭제, `docs/superpowers/plans/2026-08-24-post-edit-delete.md`)가 이미 완료·배포된 상태여야 한다 — `PATCH /api/community/posts/:id`, `isMine`, `/community/[id]/edit` 페이지, `canModifyPost` 헬퍼를 그대로 재사용한다.

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 이미지: 게시글 1개당 최대 5장, 리사이즈 후 장당 2MB(2,000,000자) 이하, 전체 본문(HTML+이미지) 12MB(12,000,000자) 이하. `data:image/(jpeg|png|webp);base64,` 형식만 허용, 링크는 `http`/`https`만.
- `isNotice`/`pinned`는 관리자만 설정 가능(작성 시점 및 Plan A의 `PATCH`를 통한 수정 시점 모두). `pinned`는 최종 `isNotice`가 `true`일 때만 유지되고, 아니면 서버가 조용히 `false`로 보정한다(에러 아님).
- **`server/scripts/migrate-notices-to-posts.js`를 실제 프로덕션 DB에 대해 실행하는 것은 Task 6에서 사용자의 명시적 확인을 받은 뒤에만 한다** — 되돌리기 어려운 프로덕션 데이터 변경이기 때문이다.

---

## Task 1: 백엔드 — `Post` 모델 확장 + 본문 sanitize/검증 통합

**Files:**
- Modify: `server/models/Post.js`
- Modify: `server/routes/community.js`
- Modify: `server/tests/community-routes.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Produces: `Post.isNotice: boolean`(기본 `false`), `Post.pinned: boolean`(기본 `false`), `Post.body` maxlength 5000→12,000,000. `POST /posts`/`PATCH /posts/:id`가 본문을 sanitize-html로 걸러내고(스크립트/위험 스킴 제거, 이미지 개수/용량 검증) 저장하며, 관리자에 한해 `isNotice`/`pinned`를 반영한다. `serializePost`에 `isNotice`, `pinned` 필드 추가. `/api/community/posts` 요청 바디 크기 제한을 15mb로 올린다(이 태스크 자신의 12MB 본문 한도 테스트가 실제로 라우트까지 도달하려면 필요 — 기존 3mb 제한으로는 큰 본문이 body-parser에서 먼저 막힌다).
- 이 태스크가 끝나면 `image` 단독 필드로 이미지를 올리는 옛 방식은 더 이상 받지 않는다(스키마 필드 자체는 과거 글 표시를 위해 남아 있음).
- Task 3(프론트 에디터/폼)이 이 API를 그대로 쓴다. Task 2는 더 이상 이 바디 크기 제한을 건드리지 않는다(이미 여기서 끝냈으므로) — 공지 전용 `/api/admin/notices` 제한 줄 삭제만 담당한다.

- [ ] **Step 1: 실패하는 테스트 작성 — 옛 단독 이미지 테스트 정리 + 새 검증 테스트 추가**

`server/tests/community-routes.test.js`의 다음 세 테스트를 통째로 삭제한다(단독 `image` 필드로 글을 올리는 옛 방식 자체가 이 태스크에서 없어지므로):

```js
test("이미지와 함께 게시글을 작성하면 응답과 목록에 이미지가 포함된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const validImage = "data:image/jpeg;base64," + "a".repeat(100);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: validImage });
  assert.equal(res.status, 201);
  assert.equal(res.body.image, validImage);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body[0].image, validImage);
});
```

```js
test("잘못된 형식의 이미지 값이면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: "not-a-data-uri" });
  assert.equal(res.status, 400);
});
```

```js
test("이미지 용량이 너무 크면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const tooLargeImage = "data:image/jpeg;base64," + "a".repeat(2_000_001);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: tooLargeImage });
  assert.equal(res.status, 400);
});
```

`server/tests/community-routes.test.js`의:

```js
test("내가 쓴 글/저장한 글 목록은 이미지를 제외해 대역폭을 아끼지만, 전체 목록에는 이미지가 그대로 나온다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const validImage = "data:image/jpeg;base64," + "a".repeat(100);

  const createRes = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: validImage });
  assert.equal(createRes.status, 201);
  await agent.post(`/api/community/posts/${createRes.body.id}/save`);

  const myPostsRes = await agent.get("/api/community/my-posts");
  assert.equal(myPostsRes.status, 200);
  assert.equal(myPostsRes.body[0].image, null);

  const mySavedPostsRes = await agent.get("/api/community/my-saved-posts");
  assert.equal(mySavedPostsRes.status, 200);
  assert.equal(mySavedPostsRes.body[0].image, null);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body[0].image, validImage);
});
```

를(더 이상 API로 `image`를 새로 넣을 수 없으니, 과거 데이터를 흉내 내려면 모델에 직접 넣어야 한다):

```js
test("내가 쓴 글/저장한 글 목록은 이미지를 제외해 대역폭을 아끼지만, 전체 목록에는 이미지가 그대로 나온다 (과거 게시글의 image 필드 하위호환)", async () => {
  const agent = request.agent(app);
  const author = await signup(agent);
  const authorUser = await User.findOne({ email: author.email });
  const validImage = "data:image/jpeg;base64," + "a".repeat(100);

  const legacyPost = await Post.create({
    author: authorUser._id,
    tag: "고민",
    title: "과거 게시글",
    body: "내용",
    image: validImage,
  });
  await agent.post(`/api/community/posts/${legacyPost._id}/save`);

  const myPostsRes = await agent.get("/api/community/my-posts");
  assert.equal(myPostsRes.status, 200);
  assert.equal(myPostsRes.body[0].image, null);

  const mySavedPostsRes = await agent.get("/api/community/my-saved-posts");
  assert.equal(mySavedPostsRes.status, 200);
  assert.equal(mySavedPostsRes.body[0].image, null);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body[0].image, validImage);
});
```

로 교체한다. 이 파일 상단(다른 `require` 옆)에 없다면 추가한다:

```js
const Post = require("../models/Post");
```

(이미 있다면 건드리지 않는다 — 파일 안에서 `Post`를 이미 쓰고 있는지 먼저 확인한다.)

파일 끝에 추가한다(TDD: 이 테스트들은 이번 태스크의 구현 전에는 실패해야 한다):

```js
test("스크립트 태그는 저장 전 제거된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: '<p>안전한 내용</p><script>alert(1)</script>' });
  assert.equal(res.status, 201);
  assert.ok(res.body.body.includes("안전한 내용"));
  assert.ok(!res.body.body.includes("script"));
});

test("이미지가 5장을 초과하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const img = '<img src="data:image/jpeg;base64,aGVsbG8=">';
  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: img.repeat(6) });
  assert.equal(res.status, 400);
});

test("이미지 하나가 2MB를 초과하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const tooLargeImage = `<img src="data:image/jpeg;base64,${"a".repeat(2_000_001)}">`;
  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: tooLargeImage });
  assert.equal(res.status, 400);
});

test("빈 문단만 있는 본문은 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "<p></p><p></p>" });
  assert.equal(res.status, 400);
});

test("텍스트 없이 이미지만 있는 본문은 정상 작성된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const img = '<img src="data:image/jpeg;base64,' + "a".repeat(100) + '">';
  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: img });
  assert.equal(res.status, 201);
});

test("관리자가 공지로 등록하면 isNotice가 true로 저장된다", async () => {
  const admin = await User.create({ name: "관리자", email: "admin-notice1@test.com", passwordHash: "x", role: "admin" });
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  const res = await request(app)
    .post("/api/community/posts")
    .set("Cookie", `${COOKIE_NAME}=${token}`)
    .send({ tag: "고민", title: "공지 제목", body: "공지 내용", isNotice: true, pinned: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.isNotice, true);
  assert.equal(res.body.pinned, true);
  assert.equal(res.body.tag, "공지");
});

test("일반 사용자가 isNotice를 보내도 무시된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", isNotice: true, pinned: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.isNotice, false);
  assert.equal(res.body.pinned, false);
});

test("isNotice 없이 pinned만 true로 보내면 무시된다(고정은 공지에만 가능)", async () => {
  const admin = await User.create({ name: "관리자", email: "admin-notice2@test.com", passwordHash: "x", role: "admin" });
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  const res = await request(app)
    .post("/api/community/posts")
    .set("Cookie", `${COOKIE_NAME}=${token}`)
    .send({ tag: "고민", title: "제목", body: "내용", pinned: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.isNotice, false);
  assert.equal(res.body.pinned, false);
});

test("관리자가 PATCH로 isNotice를 false로 내리면 pinned도 함께 꺼진다", async () => {
  const admin = await User.create({ name: "관리자", email: "admin-notice3@test.com", passwordHash: "x", role: "admin" });
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  const adminCookie = `${COOKIE_NAME}=${token}`;

  const createRes = await request(app)
    .post("/api/community/posts")
    .set("Cookie", adminCookie)
    .send({ tag: "고민", title: "공지", body: "내용", isNotice: true, pinned: true });
  assert.equal(createRes.body.pinned, true);

  const res = await request(app)
    .patch(`/api/community/posts/${createRes.body.id}`)
    .set("Cookie", adminCookie)
    .send({ isNotice: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.isNotice, false);
  assert.equal(res.body.pinned, false);
});
```

이 파일에 `User`, `signToken`, `COOKIE_NAME`이 아직 top-level로 없다면(기존 `createAdminCookie` 헬퍼가 이미 이 파일에 있으므로 대부분 이미 있을 것이다) 상단에 추가한다:

```js
const User = require("../models/User");
const { signToken, COOKIE_NAME } = require("../lib/token");
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: FAIL(스크립트 제거/이미지 개수·용량 검증/빈 본문 거부/isNotice·pinned 관련 테스트들이 아직 구현이 없어 실패, 이미지 하위호환 테스트도 `Post` require 여부에 따라 실패할 수 있음).

- [ ] **Step 3: `Post` 모델에 `isNotice`/`pinned` 추가 + `body` 길이 상향**

`server/models/Post.js`의:

```js
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tag: { type: String, required: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 5000 },
    image: { type: String, default: null },
    views: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
    editedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

를:

```js
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tag: { type: String, required: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 12_000_000 },
    image: { type: String, default: null },
    views: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
    editedAt: { type: Date, default: null },
    isNotice: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

로 교체한다.

- [ ] **Step 4: `community.js`에 sanitize/검증/공지 필드 로직 통합**

`server/routes/community.js`의:

```js
const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_LENGTH = 2_000_000;

function authorLabel(user) {
  if (!user) return "회원";
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    image: post.image ?? null,
    isMine: userId ? post.author?._id?.toString() === userId : false,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    editedAt: post.editedAt ?? null,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}
```

를:

```js
const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { sanitizeBody } = require("../lib/sanitizeNotice");

const router = express.Router();

const IMG_TAG_RE = /<img\s+src="([^"]*)"/g;
const VALID_IMAGE_SRC_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000;
const MAX_BODY_LEN = 12_000_000;

class ValidationError extends Error {}

function sanitizeAndValidateBody(rawBody) {
  const clean = sanitizeBody(rawBody);
  if (clean.length > MAX_BODY_LEN) {
    throw new ValidationError("내용이 너무 커요");
  }
  const images = [...clean.matchAll(IMG_TAG_RE)];
  if (images.length > MAX_IMAGES) {
    throw new ValidationError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`);
  }
  for (const [, src] of images) {
    if (!VALID_IMAGE_SRC_RE.test(src)) {
      throw new ValidationError("이미지 형식이 올바르지 않아요");
    }
    if (src.length > MAX_IMAGE_LEN) {
      throw new ValidationError("이미지 용량이 너무 커요");
    }
  }
  return clean;
}

function isBodyEmpty(clean) {
  const hasText = clean.replace(/<[^>]*>/g, "").trim().length > 0;
  const hasImage = /<img\s/.test(clean);
  return !hasText && !hasImage;
}

async function resolveNoticeFields(req, payload) {
  const { isNotice, pinned } = payload; // payload = req.body(요청 바디) — Post.body(게시글 본문)와 이름이 겹치지 않도록 구분
  if (typeof isNotice !== "boolean" && typeof pinned !== "boolean") {
    return {};
  }
  const requester = await User.findById(req.user.id);
  if (requester?.role !== "admin") {
    return {};
  }
  const result = {};
  if (typeof isNotice === "boolean") result.isNotice = isNotice;
  if (typeof pinned === "boolean") result.pinned = pinned;
  return result;
}

function authorLabel(user) {
  if (!user) return "회원";
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    image: post.image ?? null,
    isMine: userId ? post.author?._id?.toString() === userId : false,
    isNotice: !!post.isNotice,
    pinned: !!post.pinned,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    editedAt: post.editedAt ?? null,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}
```

로 교체한다. (`require("../lib/sanitizeNotice")`는 Task 2에서 `../lib/sanitizeHtml`로 이름이 바뀐다 — 지금은 아직 존재하는 이름을 그대로 쓴다.)

`server/routes/community.js`의 `POST /posts` 라우트 전체를:

```js
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { tag, title, body, image } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }
    if (title.trim().length > 100 || body.trim().length > 5000) {
      return res.status(400).json({ error: "제목은 100자, 내용은 5000자를 넘을 수 없어요" });
    }
    if (image !== undefined && image !== null) {
      if (typeof image !== "string" || !IMAGE_RE.test(image)) {
        return res.status(400).json({ error: "이미지 형식이 올바르지 않아요" });
      }
      if (image.length > MAX_IMAGE_LENGTH) {
        return res.status(400).json({ error: "이미지 용량이 너무 커요" });
      }
    }

    const post = await Post.create({
      author: req.user.id,
      tag,
      title: title.trim(),
      body: body.trim(),
      image: image || null,
    });
    await post.populate("author", "name role");

    res.status(201).json(serializePost(post, req.user.id));
  } catch (err) {
    console.error("게시글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

를:

```js
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { tag, title, body, isNotice, pinned } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }
    if (title.trim().length > 100) {
      return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
    }

    let cleanBody;
    try {
      cleanBody = sanitizeAndValidateBody(body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    if (isBodyEmpty(cleanBody)) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }

    const noticeFields = await resolveNoticeFields(req, { isNotice, pinned });
    const finalIsNotice = noticeFields.isNotice === true;
    const finalPinned = finalIsNotice && noticeFields.pinned === true;

    const post = await Post.create({
      author: req.user.id,
      tag: finalIsNotice ? "공지" : tag,
      title: title.trim(),
      body: cleanBody,
      isNotice: finalIsNotice,
      pinned: finalPinned,
    });
    await post.populate("author", "name role");

    res.status(201).json(serializePost(post, req.user.id));
  } catch (err) {
    console.error("게시글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

로 교체한다.

`server/routes/community.js`의 `PATCH /posts/:id` 라우트 전체를:

```js
router.patch("/posts/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    if (!(await canModifyPost(req, post))) {
      return res.status(403).json({ error: "수정 권한이 없어요" });
    }

    const { tag, title, body } = req.body || {};
    const editingContent = typeof tag === "string" || typeof title === "string" || typeof body === "string";
    if (typeof tag === "string") {
      if (!tag.trim()) {
        return res.status(400).json({ error: "태그를 선택해주세요" });
      }
      post.tag = tag;
    }
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      if (title.trim().length > 100) {
        return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
      }
      post.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      if (body.trim().length > 5000) {
        return res.status(400).json({ error: "내용은 5000자를 넘을 수 없어요" });
      }
      post.body = body.trim();
    }
    if (editingContent) {
      post.editedAt = new Date();
    }

    await post.save();
    await post.populate("author", "name role");
    res.json(serializePost(post, req.user.id));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 수정 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

를:

```js
router.patch("/posts/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    if (!(await canModifyPost(req, post))) {
      return res.status(403).json({ error: "수정 권한이 없어요" });
    }

    const { tag, title, body, isNotice, pinned } = req.body || {};
    const editingContent = typeof tag === "string" || typeof title === "string" || typeof body === "string";
    if (typeof tag === "string") {
      if (!tag.trim()) {
        return res.status(400).json({ error: "태그를 선택해주세요" });
      }
      post.tag = tag;
    }
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      if (title.trim().length > 100) {
        return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
      }
      post.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      let cleanBody;
      try {
        cleanBody = sanitizeAndValidateBody(body);
      } catch (err) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
      if (isBodyEmpty(cleanBody)) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      post.body = cleanBody;
    }
    if (editingContent) {
      post.editedAt = new Date();
    }

    const noticeFields = await resolveNoticeFields(req, { isNotice, pinned });
    if (typeof noticeFields.isNotice === "boolean") {
      post.isNotice = noticeFields.isNotice;
      if (post.isNotice) {
        post.tag = "공지";
      }
    }
    if (typeof noticeFields.pinned === "boolean") {
      post.pinned = noticeFields.pinned;
    }
    if (!post.isNotice) {
      post.pinned = false;
    }

    await post.save();
    await post.populate("author", "name role");
    res.json(serializePost(post, req.user.id));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 수정 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

로 교체한다.

- [ ] **Step 4.5: `index.js`에 `/api/community/posts` 바디 크기 제한 상향**

`server/index.js`의:

```js
app.use("/api/community/posts", express.json({ limit: "3mb" }));
```

를:

```js
app.use("/api/community/posts", express.json({ limit: "15mb" }));
```

로 교체한다. (다음 스텝의 12,000,000자 본문 한도 테스트가 실제로 라우트 핸들러까지 도달하려면 이 시점에 필요하다 — 기존 3mb 제한으로는 큰 본문이 body-parser 단계에서 413으로 먼저 막힌다.)

- [ ] **Step 5: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 6: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS(이 시점엔 `notice-routes.test.js`/`admin-notices-routes.test.js`가 아직 남아있고 그대로 통과해야 한다 — Task 2에서 삭제한다).

```bash
git add server/models/Post.js server/routes/community.js server/tests/community-routes.test.js server/index.js
git commit -m "$(cat <<'EOF'
feat: 게시글 본문 HTML sanitize + isNotice/pinned 필드 추가

공지 전용이던 sanitize-html 검증(이미지 개수/용량, 빈 본문 거부)을
게시글 작성/수정 API로 그대로 이식한다. 관리자만 게시글을 공지로
등록/고정할 수 있고, 고정은 공지 상태일 때만 유지된다. 이제 단독
image 필드로 새 이미지를 올리는 옛 방식은 받지 않는다(과거 게시글
표시를 위해 스키마 필드는 유지). /api/community/posts 바디 크기
제한을 15mb로 올려 12MB 본문 한도가 실제로 검증되게 한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — 공지 전용 파일 삭제 + sanitize 모듈 이름 변경 + 바디 크기 제한 조정

**Files:**
- Delete: `server/models/Notice.js`, `server/routes/notices.js`, `server/routes/adminNotices.js`, `server/tests/notice-routes.test.js`, `server/tests/admin-notices-routes.test.js`
- Rename: `server/lib/sanitizeNotice.js` → `server/lib/sanitizeHtml.js`
- Modify: `server/index.js`, `server/routes/community.js`

**Interfaces:**
- Consumes: Task 1이 이미 sanitize 로직을 `community.js`로 옮겨뒀으므로, 이 태스크는 이제 안 쓰는 파일만 정리한다.
- Produces: `/api/community/notices`, `/api/admin/notices` 경로 완전 삭제(공지 전용 바디 크기 제한 줄도 함께 제거). `/api/community/posts`의 15mb 제한은 Task 1에서 이미 적용됐으므로 이 태스크는 건드리지 않는다.

- [ ] **Step 1: 공지 전용 백엔드 파일 삭제**

```bash
git rm server/models/Notice.js server/routes/notices.js server/routes/adminNotices.js server/tests/notice-routes.test.js server/tests/admin-notices-routes.test.js
```

- [ ] **Step 2: `sanitizeNotice.js`를 `sanitizeHtml.js`로 이름 변경**

```bash
git mv server/lib/sanitizeNotice.js server/lib/sanitizeHtml.js
```

- [ ] **Step 3: `community.js`의 require 경로 갱신**

`server/routes/community.js`의:

```js
const { sanitizeBody } = require("../lib/sanitizeNotice");
```

를:

```js
const { sanitizeBody } = require("../lib/sanitizeHtml");
```

로 교체한다.

- [ ] **Step 4: `index.js`에서 공지 라우터 제거**

`server/index.js`의:

```js
const notificationsRouter = require("./routes/notifications");
const moodRouter = require("./routes/mood");
const noticesRouter = require("./routes/notices");
const adminNoticesRouter = require("./routes/adminNotices");
```

를:

```js
const notificationsRouter = require("./routes/notifications");
const moodRouter = require("./routes/mood");
```

로 교체한다.

`server/index.js`의(Task 1에서 이미 `/api/community/posts` 줄을 15mb로 올려뒀으므로, 여기서는 `/api/admin/notices` 줄만 삭제한다):

```js
app.use("/api/community/posts", express.json({ limit: "15mb" }));
app.use("/api/admin/notices", express.json({ limit: "15mb" }));
app.use(express.json());
```

를:

```js
app.use("/api/community/posts", express.json({ limit: "15mb" }));
app.use(express.json());
```

로 교체한다. (공지 전용 경로가 없어지므로 그 줄만 삭제.)

`server/index.js`의:

```js
app.use("/api/community/notices", noticesRouter);
app.use("/api/admin/notices", adminNoticesRouter);
```

를 삭제한다(해당 줄만 제거, 앞뒤 다른 `app.use(...)` 줄은 그대로 둔다).

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS(공지 관련 테스트 파일이 삭제됐으니 테스트 개수가 줄어들어 있어야 한다).

```bash
git add -A -- server/index.js server/routes/community.js server/lib
git commit -m "$(cat <<'EOF'
refactor: 공지 전용 모델/라우트 삭제, sanitize 모듈 이름 일반화

Notice 모델과 /api/community/notices, /api/admin/notices 라우트를
완전히 없앤다 — 공지는 이제 Post의 isNotice/pinned 필드로 흡수됐다
(Task 1). sanitizeNotice.js는 더 이상 공지 전용이 아니므로
sanitizeHtml.js로 이름을 바꾼다. 게시글 API의 바디 크기 제한을
15mb로 올려 공지였던 글도 그대로 감당한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 리치 에디터를 전체 게시글로 확대 + 공용 `PostForm`

**Files:**
- Modify: `app/(shell)/community/types.ts`
- Rename: `app/(shell)/community/NoticeEditor.tsx` → `app/(shell)/community/PostEditor.tsx`
- Modify: `app/globals.css`
- Create: `app/(shell)/community/PostForm.tsx`
- Modify: `app/(shell)/community/write/page.tsx`
- Modify: `app/(shell)/community/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `POST`/`PATCH /api/community/posts`(`isNotice`/`pinned` 필드), Plan A의 `PATCH /api/community/posts/:id`·`isMine`·`/community/[id]/edit` 페이지.
- Produces: `<PostForm postId? initial? isAdmin onSuccess>` 컴포넌트 — Task 4는 이 태스크의 산출물을 소비하지 않는다(목록/상세는 별도 태스크).

- [ ] **Step 1: `types.ts`에 `isNotice`/`pinned` 추가 (`NoticeItem`은 아직 삭제하지 않는다 — `page.tsx`와 `community/notice/[id]/page.tsx`가 Task 4까지 이 타입을 계속 쓴다)**

`app/(shell)/community/types.ts`의:

```ts
export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  isMine: boolean;
  authorName: string;
  authorRole: string;
  createdAt: string;
  editedAt: string | null;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
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

export type NoticeItem = { id: string; title: string; body: string; pinned: boolean; createdAt: string };
```

를:

```ts
export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  isMine: boolean;
  isNotice: boolean;
  pinned: boolean;
  authorName: string;
  authorRole: string;
  createdAt: string;
  editedAt: string | null;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
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

export type NoticeItem = { id: string; title: string; body: string; pinned: boolean; createdAt: string };
```

로 교체한다. (`NoticeItem`은 그대로 남긴다 — `page.tsx`와 `community/notice/[id]/page.tsx`를 아직 안 건드렸으므로 지우면 그 두 파일의 빌드가 깨진다. Task 4가 그 두 파일을 고치면서 `NoticeItem`도 함께 지운다.)

- [ ] **Step 2: `NoticeEditor.tsx`를 `PostEditor.tsx`로 이름 변경**

```bash
git mv "app/(shell)/community/NoticeEditor.tsx" "app/(shell)/community/PostEditor.tsx"
```

`app/(shell)/community/PostEditor.tsx`의:

```tsx
export default function NoticeEditor({ value, onChange }: Props) {
```

를:

```tsx
export default function PostEditor({ value, onChange }: Props) {
```

로 교체한다. 이 파일의 다른 내용(툴바, 이미지 삽입 로직 등)은 그대로 둔다. 클래스 이름 `"notice-body ..."`는 이 태스크의 Step 3에서 `.rich-body`로 바꾼다.

`app/(shell)/community/PostEditor.tsx`의:

```tsx
      <EditorContent
        editor={editor}
        className="notice-body min-h-[120px] px-3 py-2 text-sm text-text-2 [&_.ProseMirror]:outline-none"
      />
```

를:

```tsx
      <EditorContent
        editor={editor}
        className="rich-body min-h-[120px] px-3 py-2 text-sm text-text-2 [&_.ProseMirror]:outline-none"
      />
```

로 교체한다.

- [ ] **Step 3: `globals.css`의 `.notice-body`를 `.rich-body`로 이름 변경**

`app/globals.css`의:

```css
/*
 * 공지사항 본문(NoticeEditor가 만든 HTML, 서버 sanitize-html 통과)을 렌더링하는 컨테이너.
 * white-space: pre-line은 마이그레이션 전 평문(\n 줄바꿈만 있던) 공지도 그대로 보이게 해준다 —
 * 새 HTML의 p/br 같은 블록 요소는 pre-line이 있어도 정상 렌더링된다.
 */
.notice-body {
  white-space: pre-line;
}
/*
 * TipTap의 실시간 편집 영역(.ProseMirror)은 상위의 white-space: pre-line을
 * 그대로 상속하면 안 된다 — ProseMirror는 pre-line을 명시적으로 비허용 값으로
 * 취급하며 pre-wrap을 기대한다(콘솔 경고 + 줄 끝 공백 처리 불안정 유발).
 * 읽기 전용 상세 페이지에는 .ProseMirror 자식이 없으므로 이 규칙의 영향이 없다.
 */
.notice-body .ProseMirror {
  white-space: pre-wrap;
}
.notice-body p {
  margin-bottom: 0.75em;
}
.notice-body p:last-child {
  margin-bottom: 0;
}
.notice-body img {
  max-width: 100%;
  border-radius: 0.75rem;
  margin: 0.5em 0;
}
.notice-body a {
  color: var(--color-primary-dark);
  text-decoration: underline;
}
.notice-body ul,
.notice-body ol {
  margin: 0.5em 0 0.5em 1.25em;
}
```

를:

```css
/*
 * 게시글 본문(PostEditor가 만든 HTML, 서버 sanitize-html 통과)을 렌더링하는 컨테이너.
 * white-space: pre-line은 리치 에디터 도입 전 평문(\n 줄바꿈만 있던) 게시글도 그대로
 * 보이게 해준다 — 새 HTML의 p/br 같은 블록 요소는 pre-line이 있어도 정상 렌더링된다.
 */
.rich-body {
  white-space: pre-line;
}
/*
 * TipTap의 실시간 편집 영역(.ProseMirror)은 상위의 white-space: pre-line을
 * 그대로 상속하면 안 된다 — ProseMirror는 pre-line을 명시적으로 비허용 값으로
 * 취급하며 pre-wrap을 기대한다(콘솔 경고 + 줄 끝 공백 처리 불안정 유발).
 * 읽기 전용 상세 페이지에는 .ProseMirror 자식이 없으므로 이 규칙의 영향이 없다.
 */
.rich-body .ProseMirror {
  white-space: pre-wrap;
}
.rich-body p {
  margin-bottom: 0.75em;
}
.rich-body p:last-child {
  margin-bottom: 0;
}
.rich-body img {
  max-width: 100%;
  border-radius: 0.75rem;
  margin: 0.5em 0;
}
.rich-body a {
  color: var(--color-primary-dark);
  text-decoration: underline;
}
.rich-body ul,
.rich-body ol {
  margin: 0.5em 0 0.5em 1.25em;
}
```

로 교체한다.

- [ ] **Step 4: 공용 `PostForm` 컴포넌트 작성**

`app/(shell)/community/PostForm.tsx`(신규):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "./mock";
import PostEditor from "./PostEditor";

// 리치 에디터 도입 전 평문(\n 줄바꿈만 있던) 본문인지 판별한다 — HTML 태그가 하나도 없으면 레거시로 본다.
function isLegacyPlainText(body: string) {
  return !/<[a-z][^>]*>/i.test(body);
}

// 레거시 평문 본문을 PostEditor(TipTap)가 안전하게 파싱할 수 있는 HTML로 변환한다.
// HTML로 파싱될 때 \n이 공백으로 뭉개지는 것을 막기 위해 줄바꿈을 명시적인 태그(p/br)로 바꾼다.
function legacyPlainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Initial = { tag: string; title: string; body: string; isNotice: boolean; pinned: boolean };

type Props = {
  postId?: string;
  initial?: Initial;
  isAdmin: boolean;
  onSuccess: (id: string) => void;
};

export default function PostForm({ postId, initial, isAdmin, onSuccess }: Props) {
  const router = useRouter();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [category, setCategory] = useState<string>(initial?.tag ?? TOPICS[0]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(
    initial ? (isLegacyPlainText(initial.body) ? legacyPlainTextToHtml(initial.body) : initial.body) : ""
  );
  const [isNotice, setIsNotice] = useState(initial?.isNotice ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 글을 막지 않는다. 도움받을 곳이 있다는 것만 조용히 알린다.
  const showCrisis = detectCrisis(`${title} ${body}`);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { tag: category, title, body };
      if (isAdmin) {
        payload.isNotice = isNotice;
        payload.pinned = isNotice && pinned;
      }
      const url = postId ? `/api/community/posts/${postId}` : "/api/community/posts";
      const res = await apiFetch(url, { method: postId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다");
        return;
      }
      if (!postId) refreshPostCounts();
      onSuccess(postId ?? data.id);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-2xl">
      {isNotice ? (
        <p className="mb-4 text-xs font-semibold text-text-faint">📌 공지는 별도 배지로 표시돼요</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Chip key={t} active={category === t} onClick={() => setCategory(t)}>
              {t}
            </Chip>
          ))}
        </div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목을 입력하세요"
        maxLength={50}
        className="mb-3 w-full border-b border-border pb-3 text-xl font-bold text-text outline-none placeholder:text-text-faint"
      />
      <PostEditor value={body} onChange={setBody} />

      {isAdmin && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
            <input type="checkbox" checked={isNotice} onChange={(e) => setIsNotice(e.target.checked)} />
            📌 공지로 등록
          </label>
          {isNotice && (
            <label className="ml-5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              📌 상단 고정
            </label>
          )}
        </div>
      )}

      {showCrisis && (
        <div className="mt-4">
          <CrisisNotice />
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
        {postId && (
          <button
            onClick={() => router.push(`/community/${postId}`)}
            className="rounded-xl border border-border px-6 py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "저장하는 중..." : postId ? "저장하기" : "✍️ 올리기"}
        </button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: `write/page.tsx`를 `PostForm` 래퍼로 축소**

`app/(shell)/community/write/page.tsx` 전체를:

```tsx
"use client";

import { useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import PostForm from "../PostForm";

export default function CommunityWritePage() {
  // 글을 다 쓴 뒤 제출 순간에 튕기지 않도록 진입 시점에 막는다.
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityWriteContent />
    </RequireAuth>
  );
}

function CommunityWriteContent() {
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const isAdmin = auth.phase === "in" && auth.role === "admin";

  return <PostForm isAdmin={isAdmin} onSuccess={(id) => router.push(`/community/${id}`)} />;
}
```

로 교체한다.

- [ ] **Step 6: `[id]/edit/page.tsx`를 `PostForm` 사용으로 교체**

`app/(shell)/community/[id]/edit/page.tsx` 전체를:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import PostForm from "../../PostForm";
import type { CommunityPost } from "../../types";

export default function CommunityPostEditPage() {
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityPostEditContent />
    </RequireAuth>
  );
}

function CommunityPostEditContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);

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

  if (post === undefined || auth.phase === "loading") {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
    return <div className="py-16 text-center text-text-faint">게시글을 찾을 수 없어요.</div>;
  }

  const isAdmin = auth.phase === "in" && auth.role === "admin";
  const canEdit = post.isMine || isAdmin;
  if (!canEdit) {
    return (
      <div className="py-16 text-center text-text-faint">
        수정 권한이 없어요.
        <div className="mt-4">
          <button onClick={() => router.push(`/community/${params.id}`)} className="font-bold text-primary-dark">
            게시글로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <PostForm
      postId={params.id}
      initial={{ tag: post.tag, title: post.title, body: post.body, isNotice: post.isNotice, pinned: post.pinned }}
      isAdmin={isAdmin}
      onSuccess={(id) => router.push(`/community/${id}`)}
    />
  );
}
```

로 교체한다.

- [ ] **Step 7: `page.tsx`의 옛 이름 참조를 최소한으로 맞추고 타입체크 + 린트**

`app/(shell)/community/page.tsx`는 이 태스크가 손대지 않는 파일이지만(목록/상세 개편은 Task 4), 지금 `import NoticeEditor from "./NoticeEditor";`와 `"notice-body ..."` 클래스 문자열을 쓰고 있어서 이 태스크가 파일/클래스 이름을 바꾸면 그대로는 빌드가 깨진다. `NoticeItem` 타입은 이번 Step 1에서 안 지웠으므로(위 참고) 그 부분은 문제 없다 — 딱 이름 참조 두 곳만 손보면 된다:

`app/(shell)/community/page.tsx`의:

```tsx
import NoticeEditor from "./NoticeEditor";
```

를:

```tsx
import NoticeEditor from "./PostEditor";
```

로 교체한다(지역 변수명 `NoticeEditor`는 그대로 둔다 — Task 4가 이 파일을 통째로 다시 쓰면서 정리한다). 이 파일 안에서 `"notice-body`로 시작하는 클래스 문자열이 있다면 `"rich-body`로 바꾼다. **이 두 군데 말고는 `page.tsx`의 다른 어떤 것도 건드리지 않는다** — 로직/JSX/상태는 전부 Task 4의 몫이다.

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/types.ts" "app/(shell)/community/PostEditor.tsx" "app/(shell)/community/PostForm.tsx" "app/(shell)/community/write/page.tsx" "app/(shell)/community/[id]/edit/page.tsx" app/globals.css
```

Expected: 에러 없음(위 최소 패치까지 반영하면 `page.tsx`발 에러도 사라져야 한다). `grep -r "NoticeEditor\"" app`(따옴표로 닫히는 정확한 옛 파일명 import) 결과가 없는지도 확인한다. tsc가 `page.tsx`에서 이 두 가지(임포트 경로, 클래스 문자열) 말고 다른 에러를 낸다면 즉시 멈추고 BLOCKED로 보고한다 — 그건 이 태스크가 예상 못 한 다른 문제다.

- [ ] **Step 8: 커밋**

```bash
git add "app/(shell)/community/types.ts" "app/(shell)/community/PostEditor.tsx" "app/(shell)/community/NoticeEditor.tsx" "app/(shell)/community/PostForm.tsx" "app/(shell)/community/write/page.tsx" "app/(shell)/community/[id]/edit/page.tsx" "app/(shell)/community/page.tsx" app/globals.css
git commit -m "$(cat <<'EOF'
feat: 리치 텍스트 에디터를 전체 게시글로 확대 + 공용 PostForm 도입

공지 전용이던 NoticeEditor를 PostEditor로 일반화하고, 작성/수정
폼의 중복 UI를 PostForm 컴포넌트로 뺐다. 관리자에게만 공지 등록/
고정 체크박스가 보인다. 레거시 평문 게시글을 수정할 때는 줄바꿈이
깨지지 않도록 안전한 HTML로 변환해서 에디터에 넣는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — 목록/상세 페이지 개편 + 공지 탭·인라인 CRUD 제거

**Files:**
- Modify: `app/(shell)/community/page.tsx`
- Modify: `app/(shell)/community/[id]/page.tsx`
- Delete: `app/(shell)/community/notice/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1~3의 `isNotice`/`pinned` 필드와 `PostForm`/`PostEditor`.
- Produces: 이 계획의 마지막 파일 변경 태스크 — 여기서 전체 빌드가 처음으로 다시 깨끗하게 통과해야 한다.

- [ ] **Step 1: `page.tsx` — 공지 인라인 CRUD 전부 제거, import 정리**

`app/(shell)/community/page.tsx`의:

```tsx
"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import NoticeEditor from "./NoticeEditor";
import type { CommunityPost, NoticeItem } from "./types";

function stripHtml(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

function firstImageSrc(html: string) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
}

// 마이그레이션 전 평문(\n 줄바꿈만 있던) 공지 본문인지 판별한다 — HTML 태그가 하나도 없으면 레거시로 본다.
function isLegacyPlainText(body: string) {
  return !/<[a-z][^>]*>/i.test(body);
}

// 레거시 평문 본문을 TipTap 에디터가 안전하게 파싱할 수 있는 HTML로 변환한다.
// HTML로 파싱될 때 \n이 공백으로 뭉개지는 것을 막기 위해 줄바꿈을 명시적인
// 태그(p/br)로 바꿔준다.
function legacyPlainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Tab = "best" | "all" | "notice";
type Sort = "recent" | "likes" | "comments" | "views";
```

를:

```tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost } from "./types";

function stripHtml(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

function firstImageSrc(html: string) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
}

type Tab = "best" | "all";
type Sort = "recent" | "likes" | "comments" | "views";
```

로 교체한다. (`stripHtml`/`firstImageSrc`는 이제 공지뿐 아니라 모든 게시글 미리보기에 쓰인다 — 아래 스텝에서 반영.)

- [ ] **Step 2: 컴포넌트 state/effect에서 공지 관련 코드 제거**

`app/(shell)/community/page.tsx`의:

```tsx
function CommunityPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  // 게시글 상세 화면의 주제 칩에서 넘어온 경우 해당 주제로 바로 걸러준다.
  const [topic, setTopic] = useState<string | null>(searchParams.get("topic"));
  const [sort, setSort] = useState<Sort>("recent");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { state: auth } = useAuthStatus();
  const isAdmin = auth.phase === "in" && auth.role === "admin";
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [newNoticePinned, setNewNoticePinned] = useState(false);
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeBody, setEditNoticeBody] = useState("");
  const [editNoticePinned, setEditNoticePinned] = useState(false);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  function loadNotices() {
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]));
  }

  useEffect(loadNotices, []);

  async function submitCreateNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newNoticeTitle, body: newNoticeBody, pinned: newNoticePinned }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewNoticeTitle("");
    setNewNoticeBody("");
    setNewNoticePinned(false);
    setCreatingNotice(false);
    loadNotices();
  }

  function startEditNotice(n: NoticeItem) {
    setEditingNoticeId(n.id);
    setEditNoticeTitle(n.title);
    setEditNoticeBody(isLegacyPlainText(n.body) ? legacyPlainTextToHtml(n.body) : n.body);
    setEditNoticePinned(n.pinned);
    setNoticeFormError(null);
  }

  async function submitEditNotice(e: FormEvent, id: string) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editNoticeTitle, body: editNoticeBody, pinned: editNoticePinned }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingNoticeId(null);
    loadNotices();
  }

  async function handleDeleteNotice(id: string) {
    if (confirmDeleteNoticeId !== id) {
      setConfirmDeleteNoticeId(id);
      return;
    }
    const res = await apiFetch(`/api/admin/notices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
    setConfirmDeleteNoticeId(null);
  }

  const filtered = useMemo(() => {
    let list = tab === "best" ? pickPopularPosts(posts) : [...posts];
    if (topic) {
      list = list.filter((p) => p.tag === topic);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    // 인기글 탭은 이미 좋아요순으로 추려진 목록이라 정렬을 덮어쓰지 않는다.
    if (tab !== "best") {
      if (sort === "likes") list.sort((a, b) => b.likeCount - a.likeCount);
      else if (sort === "comments") list.sort((a, b) => b.cmtCount - a.cmtCount);
      else if (sort === "views") list.sort((a, b) => b.views - a.views);
      else list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return list;
  }, [tab, search, topic, sort, posts]);
```

를:

```tsx
function CommunityPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  // 게시글 상세 화면의 주제 칩에서 넘어온 경우 해당 주제로 바로 걸러준다.
  const [topic, setTopic] = useState<string | null>(searchParams.get("topic"));
  const [sort, setSort] = useState<Sort>("recent");
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
    let list = tab === "best" ? pickPopularPosts(posts) : [...posts];
    if (topic) {
      list = list.filter((p) => p.tag === topic);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || stripHtml(p.body).toLowerCase().includes(q));
    }
    // 인기글 탭은 이미 좋아요순으로 추려진 목록이라 정렬을 덮어쓰지 않는다.
    if (tab !== "best") {
      if (sort === "likes") list.sort((a, b) => b.likeCount - a.likeCount);
      else if (sort === "comments") list.sort((a, b) => b.cmtCount - a.cmtCount);
      else if (sort === "views") list.sort((a, b) => b.views - a.views);
      else list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    // 전체글 탭 + 주제 필터/검색이 없을 때만 고정 공지를 맨 위로 묶는다.
    // 인기글 탭이나 필터/검색 중에는 억지로 끌어올리지 않고 자연스러운 순서에 둔다.
    const showPinnedFirst = tab === "all" && !topic && !search.trim();
    if (showPinnedFirst) {
      const pinned = list.filter((p) => p.isNotice && p.pinned);
      const rest = list.filter((p) => !(p.isNotice && p.pinned));
      return [...pinned, ...rest];
    }
    return list;
  }, [tab, search, topic, sort, posts]);
```

로 교체한다.

- [ ] **Step 3: 공지 탭 버튼 + 이미지 첨부 탭 UI 삭제**

`app/(shell)/community/page.tsx`의:

```tsx
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
          <AuthLink
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </AuthLink>
        </div>

        {tab !== "notice" && (
          <div className="mb-3 flex flex-wrap items-center gap-1">
            {(["recent", "likes", "comments", "views"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                disabled={tab === "best"}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  sort === s && tab !== "best" ? "text-primary-dark" : "text-text-faint"
                }`}
              >
                {s === "recent" ? "최신순" : s === "likes" ? "공감순" : s === "comments" ? "댓글순" : "조회순"}
              </button>
            ))}
          </div>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {tab === "notice" ? (
          <div className="flex flex-col gap-2">
            {isAdmin && (
              <div className="mb-2">
                {!creatingNotice ? (
                  <button
                    onClick={() => {
                      setCreatingNotice(true);
                      setNoticeFormError(null);
                    }}
                    className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
                  >
                    새 공지 작성
                  </button>
                ) : (
                  <form
                    onSubmit={submitCreateNotice}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={newNoticeTitle}
                      onChange={(e) => setNewNoticeTitle(e.target.value)}
                      placeholder="제목"
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <NoticeEditor value={newNoticeBody} onChange={setNewNoticeBody} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                      <input
                        type="checkbox"
                        checked={newNoticePinned}
                        onChange={(e) => setNewNoticePinned(e.target.checked)}
                      />
                      📌 상단 고정
                    </label>
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreatingNotice(false)}
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
              </div>
            )}

            {notices.length === 0 ? (
              <div className="py-16 text-center text-text-faint">공지가 없어요</div>
            ) : (
              notices.map((n) =>
                isAdmin && editingNoticeId === n.id ? (
                  <form
                    key={n.id}
                    onSubmit={(e) => submitEditNotice(e, n.id)}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={editNoticeTitle}
                      onChange={(e) => setEditNoticeTitle(e.target.value)}
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <NoticeEditor value={editNoticeBody} onChange={setEditNoticeBody} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                      <input
                        type="checkbox"
                        checked={editNoticePinned}
                        onChange={(e) => setEditNoticePinned(e.target.checked)}
                      />
                      📌 상단 고정
                    </label>
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoticeId(null)}
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
                  <Card
                    key={n.id}
                    className={`transition-shadow hover:shadow-card ${n.pinned ? "bg-primary-xlight" : ""}`}
                  >
                    <Link href={`/community/notice/${n.id}`} className="block cursor-pointer">
                      <div className="text-sm font-bold text-primary-dark">{n.pinned ? "📌 고정 공지" : "공지"}</div>
                      <div className="mt-1 font-bold text-text">{n.title}</div>
                      <div className="mt-2 flex gap-3">
                        <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{stripHtml(n.body)}</p>
                        {firstImageSrc(n.body) && (
                          // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                          <img
                            src={firstImageSrc(n.body)!}
                            alt=""
                            className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                          />
                        )}
                      </div>
                      <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(n.createdAt)}</div>
                    </Link>
                    {isAdmin && (
                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => startEditNotice(n)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteNotice(n.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                            confirmDeleteNoticeId === n.id
                              ? "border-danger bg-[#fff0f0] text-danger"
                              : "border-danger text-danger hover:bg-[#fff0f0]"
                          }`}
                        >
                          {confirmDeleteNoticeId === n.id ? "정말 삭제할까요?" : "삭제"}
                        </button>
                      </div>
                    )}
                  </Card>
                )
              )
            )}
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
```

를:

```tsx
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(["best", "all"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t ? "bg-primary-dark text-white" : "text-text-muted"
                }`}
              >
                {t === "best" ? "인기글" : "전체글"}
              </button>
            ))}
          </div>
          <AuthLink
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </AuthLink>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1">
          {(["recent", "likes", "comments", "views"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              disabled={tab === "best"}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                sort === s && tab !== "best" ? "text-primary-dark" : "text-text-faint"
              }`}
            >
              {s === "recent" ? "최신순" : s === "likes" ? "공감순" : s === "comments" ? "댓글순" : "조회순"}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
```

로 교체한다.

- [ ] **Step 4: 게시글 목록 카드에 공지/고정 배지 + 통합 미리보기 반영**

`app/(shell)/community/page.tsx`의:

```tsx
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                      {p.tag}
                    </span>
                    {p.likeCount >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                    {p.cmtCount > 0 && (
                      <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                        답변 완료
                      </span>
                    )}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 flex gap-3">
                    <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{p.body}</p>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                      <img
                        src={p.image}
                        alt=""
                        className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                      />
                    )}
                  </div>
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
```

를:

```tsx
          <div className="flex flex-col gap-3">
            {filtered.map((p) => {
              const thumbnail = p.image ?? firstImageSrc(p.body);
              return (
                <Link key={p.id} href={`/community/${p.id}`}>
                  <Card
                    className={`cursor-pointer transition-shadow hover:shadow-card ${
                      p.isNotice && p.pinned ? "bg-primary-xlight" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                        {p.isNotice ? (p.pinned ? "📌 고정 공지" : "공지") : p.tag}
                      </span>
                      {p.likeCount >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                      {p.cmtCount > 0 && (
                        <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                          답변 완료
                        </span>
                      )}
                    </div>
                    <div className="mb-1.5 font-bold text-text">{p.title}</div>
                    <div className="mb-3 flex gap-3">
                      <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{stripHtml(p.body)}</p>
                      {thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                        <img
                          src={thumbnail}
                          alt=""
                          className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                        />
                      )}
                    </div>
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
              );
            })}
          </div>
```

로 교체한다.

- [ ] **Step 5: 사이드바 "📋 공지사항" 위젯을 `posts` 기반으로 전환**

`app/(shell)/community/page.tsx`의:

```tsx
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          {notices.length === 0 ? (
            <p className="py-2 text-[13px] text-text-faint">아직 공지가 없어요</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {notices.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/notice/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </Link>
              ))}
            </div>
          )}
        </Card>
```

를:

```tsx
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          {noticePosts.length === 0 ? (
            <p className="py-2 text-[13px] text-text-faint">아직 공지가 없어요</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {noticePosts.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </Link>
              ))}
            </div>
          )}
        </Card>
```

로 교체한다. 그리고 이 컴포넌트의 `filtered` `useMemo` 바로 다음(또는 그 근처)에 `noticePosts` 파생값을 추가한다:

```ts
  const noticePosts = useMemo(
    () => [...posts].filter((p) => p.isNotice).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [posts]
  );
```

(고정된 공지가 먼저 오도록만 정렬 — `posts`는 이미 `GET /posts`가 최신순으로 내려주므로 같은 `pinned` 값끼리는 최신순이 유지된다.)

- [ ] **Step 6: 게시글 상세 페이지 — 리치 텍스트 렌더링 + 공지 배지**

`app/(shell)/community/[id]/page.tsx`의:

```tsx
          <div className="mb-3 flex gap-2">
            <span className="rounded-md bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary-dark">
              {post.tag}
            </span>
            {post.likeCount >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
```

를:

```tsx
          <div className="mb-3 flex gap-2">
            <span className="rounded-md bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary-dark">
              {post.isNotice ? (post.pinned ? "📌 고정 공지" : "공지") : post.tag}
            </span>
            {post.likeCount >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
```

로 교체한다.

`app/(shell)/community/[id]/page.tsx`의:

```tsx
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>
```

를:

```tsx
          <div
            className="rich-body text-[15px] leading-[1.85] text-text-2"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
```

로 교체한다. (본문은 서버가 저장 전 sanitize-html로 걸러낸 HTML이라 안전하다 — Task 1.)

- [ ] **Step 7: 공지 전용 상세 페이지 삭제**

```bash
git rm -r "app/(shell)/community/notice"
```

- [ ] **Step 8: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/page.tsx" "app/(shell)/community/[id]/page.tsx"
npm run build
```

Expected: 전부 에러 없음. 이 계획의 마지막 파일 변경 태스크이므로 전체 프로젝트를 한 번 더 확인하는 의미로 `npm run build`를 포함한다. `grep -rn "NoticeItem\|/community/notice\|notice-body" app`이 아무것도 안 나오는지 확인한다.

- [ ] **Step 9: 브라우저에서 확인**

```bash
npm run dev
```

관리자 계정으로 `/community/write`에서 "공지로 등록" + "상단 고정" 체크 후 글을 올리면 전체글 목록 맨 위에 뜨는지, 일반 계정에는 그 체크박스가 안 보이는지, 굵게/이탤릭/링크/이미지가 실제로 동작하는지, 공지가 아닌 일반 글도 이미지 여러 장을 넣을 수 있는지, "공지사항" 탭이 완전히 없어졌는지, `/community/notice/아무id`가 404인지 확인한다.

- [ ] **Step 10: 커밋**

이 태스크는 Task 3과 함께(그 태스크의 Step 8에서 tsc가 실패했다면) 또는 단독으로 커밋한다:

```bash
git add "app/(shell)/community/page.tsx" "app/(shell)/community/[id]/page.tsx" "app/(shell)/community/notice" "app/(shell)/community/types.ts" "app/(shell)/community/PostEditor.tsx" "app/(shell)/community/NoticeEditor.tsx" "app/(shell)/community/PostForm.tsx" "app/(shell)/community/write/page.tsx" "app/(shell)/community/[id]/edit/page.tsx" app/globals.css
git commit -m "$(cat <<'EOF'
feat: 공지사항 탭 삭제, 게시글 목록에 공지/고정 자연스럽게 통합

공지 인라인 CRUD를 전부 없애고 일반 글쓰기/수정 화면(PostForm)으로
합쳤다. 전체글 탭에서 필터/검색이 없을 때만 고정 공지가 맨 위로
묶이고, 나머지는 선택한 정렬을 따른다. 게시글 상세는 이제 sanitize된
HTML을 그대로 렌더링한다. /community/notice 전용 라우트는 삭제.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 마이그레이션 스크립트 작성 + 로컬 검증

**Files:**
- Create: `server/scripts/migrate-notices-to-posts.js`

**Interfaces:**
- Consumes: Task 1~2가 이미 배포된 `Post` 스키마(`isNotice`/`pinned`), (아직 존재한다면) 기존 `Notice` 컬렉션.
- **이 스크립트를 프로덕션 DB에 대해 실행하는 것은 Task 6에서 사용자 확인 후에만 한다.** 이 태스크에서는 로컬(예: `mongodb-memory-server` 기반 임시 DB)로 스크립트 자체의 동작만 검증한다.

- [ ] **Step 1: 마이그레이션 스크립트 작성**

`server/scripts/migrate-notices-to-posts.js`:

```js
// 1회성 스크립트: 기존 Notice 컬렉션의 문서를 Post 컬렉션으로 옮기고 Notice
// 컬렉션을 지운다. Notice에는 작성자 개념이 없었으므로, role이 "admin"인
// 첫 User를 author로 지정한다.
//
// 실행: MONGODB_URI=<...> node scripts/migrate-notices-to-posts.js

const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수가 필요합니다.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("DB 연결 성공");

  const admin = await User.findOne({ role: "admin" });
  if (!admin) {
    console.error("admin 역할을 가진 사용자가 없습니다 — 마이그레이션을 진행할 수 없습니다.");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`이관 대상 공지의 author로 사용할 관리자: ${admin.name} (${admin.email})`);

  const db = mongoose.connection.db;
  const noticesCollection = db.collection("notices");
  const notices = await noticesCollection.find({}).toArray();
  console.log(`이관할 공지 ${notices.length}건 발견`);

  if (notices.length === 0) {
    console.log("이관할 공지가 없습니다. 종료합니다.");
    await mongoose.disconnect();
    return;
  }

  const docs = notices.map((n) => ({
    author: admin._id,
    tag: "공지",
    title: n.title,
    body: n.body,
    isNotice: true,
    pinned: n.pinned ?? false,
    createdAt: n.createdAt,
    editedAt: null,
  }));

  const created = await Post.create(docs, { timestamps: false });
  console.log(`Post로 이관 완료: ${created.length}건`);

  await noticesCollection.drop();
  console.log("notices 컬렉션 삭제 완료");

  await mongoose.disconnect();
  console.log("마이그레이션 완료");
}

main().catch((err) => {
  console.error("마이그레이션 중 오류:", err);
  process.exit(1);
});
```

- [ ] **Step 2: 로컬에서 스크립트 검증**

`mongodb-memory-server`로 임시 DB를 띄우고, 그 안에 `notices` 컬렉션에 문서 2~3개(하나는 `pinned: true` 포함)와 `role: "admin"` 사용자 1명을 직접 넣은 뒤, 이 스크립트를 그 DB의 URI로 실행해 확인한다. 예를 들어 임시 검증 스크립트(커밋하지 않는 스크래치 파일)로:

```js
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const User = require("./models/User");

(async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const admin = await User.create({ name: "관리자", email: "admin@migrate-test.local", passwordHash: "x", role: "admin" });
  await mongoose.connection.db.collection("notices").insertMany([
    { title: "공지1", body: "<p>내용1</p>", pinned: false, createdAt: new Date("2026-08-01") },
    { title: "공지2(고정)", body: "<p>내용2</p>", pinned: true, createdAt: new Date("2026-08-02") },
  ]);
  await mongoose.disconnect();
  console.log("MONGODB_URI=" + uri);
  console.log("(이 프로세스를 살려둔 채, 별도 터미널에서 위 URI로 마이그레이션 스크립트를 실행해보세요)");
  process.stdin.resume();
})();
```

이 검증 과정에서: (a) `Post` 컬렉션에 2건이 `isNotice: true`로 생겼는지, (b) `pinned: true`였던 문서가 `Post.pinned: true`로 유지됐는지, (c) `createdAt`이 원본 그대로 보존됐는지(현재 시각으로 덮어써지지 않았는지), (d) `notices` 컬렉션이 삭제됐는지, (e) `Post.author`가 그 관리자 계정으로 채워졌는지 직접 조회해서 확인한다. 확인이 끝나면 임시 검증 스크립트와 로컬 DB는 정리한다(커밋 대상 아님).

- [ ] **Step 3: 커밋**

```bash
git add server/scripts/migrate-notices-to-posts.js
git commit -m "$(cat <<'EOF'
feat: 기존 공지를 게시글로 옮기는 1회성 마이그레이션 스크립트 추가

Notice 컬렉션의 문서를 Post로 옮기고(작성자는 role이 admin인 첫
사용자로 지정, isNotice/pinned/createdAt 보존) notices 컬렉션을
삭제한다. 로컬 mongodb-memory-server 환경에서 동작을 검증했다.
프로덕션 실행은 사용자 확인 후 별도로 진행한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 전체 통합 확인 및 배포 + 마이그레이션 실행

**Files:** 없음 (검증, 배포, 마이그레이션 실행만)

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

- [ ] **Step 5: 프로덕션 마이그레이션 실행 — 반드시 사용자 확인 후에만**

배포가 성공했으면, 프로덕션에는 아직 기존 `Notice` 컬렉션에 데이터가 남아있고(코드는 이미 이걸 안 쓰지만 삭제 전 상태) 그 공지들은 새 게시글 목록에 아직 안 보인다. **여기서 멈추고 사용자에게 "지금 프로덕션 DB에 마이그레이션 스크립트를 실행해도 될지" 명시적으로 확인받는다.** 승인을 받으면, 프로덕션 `MONGODB_URI`로 `server/scripts/migrate-notices-to-posts.js`를 1회 실행한다.

- [ ] **Step 6: 프로덕션에서 수동 확인**

`https://create-club.vercel.app/community`에서: 마이그레이션된 기존 공지 3개가 전체글 목록에 자연스럽게 섞여 나오는지(고정돼 있던 것은 맨 위에), 각 공지 상세 페이지가 정상적으로 열리는지, 관리자 계정으로 새 글을 "공지로 등록"+"고정"해서 작성하면 정상 동작하는지, 일반 사용자 눈에는 공지 체크박스가 안 보이는지, "공지사항" 탭이 완전히 사라졌는지, `/community/notice/아무id`가 404인지 확인한다.

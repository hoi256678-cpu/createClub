# 게시글 수정/삭제 (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지금 아예 없는 커뮤니티 게시글 수정/삭제 기능을 만든다(본인 글 + 관리자는 아무 글이나). 공지 통합(Plan B)이 이 위에서 동작하므로, 이 단계에서는 공지 개념 없이 순수 CRUD만 완성한다.

**Architecture:** 백엔드에 `PATCH /api/community/posts/:id`, `DELETE /api/community/posts/:id`를 추가하고, `serializePost`에 `isMine`(작성자 본인 여부, 기존 `likedByMe` 패턴 재사용)을 추가한다. 프론트는 새 수정 페이지(`/community/[id]/edit`)를 만들고 상세 페이지에 수정/삭제 버튼을 단다. 이미지 수정은 이 단계에서 다루지 않는다(Plan B가 에디터를 통째로 교체하므로 여기서 만들면 버리는 작업이 된다) — 제목/태그/본문만 수정 가능.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind v4(프론트엔드).

**Spec:** `docs/superpowers/specs/2026-08-24-notice-post-unification-design.md`(B절)

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 수정 권한: 작성자 본인이거나 관리자(role === "admin"). 삭제도 동일.
- 이 계획에서는 이미지 수정을 다루지 않는다 — `PATCH`는 `tag`/`title`/`body`만 받는다.

---

## Task 1: 백엔드 — `serializePost`에 `isMine` 추가 + `PATCH /posts/:id`

**Files:**
- Modify: `server/routes/community.js`
- Modify: `server/tests/community-routes.test.js`

**Interfaces:**
- Produces: `serializePost` 응답에 `isMine: boolean` 필드 추가(모든 게시글 조회 라우트가 이 함수를 공유하므로 자동 반영). `PATCH /api/community/posts/:id`가 `{tag?, title?, body?}`를 받아 본인/관리자만 수정 가능.
- Task 3(수정 페이지)이 이 엔드포인트를 호출한다. Task 4(상세 페이지)가 `isMine`을 읽어 버튼 노출을 결정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/community-routes.test.js` 상단(다른 `require` 옆)에 추가한다:

```js
const User = require("../models/User");
const { signToken, COOKIE_NAME } = require("../lib/token");
```

파일 끝에 추가한다:

```js
async function createAdminCookie() {
  const admin = await User.create({ name: "관리자", email: "admin@test.com", passwordHash: "x", role: "admin" });
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  return `${COOKIE_NAME}=${token}`;
}

test("본인 게시글을 수정하면 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "원본 내용" });

  const res = await agent
    .patch(`/api/community/posts/${createRes.body.id}`)
    .send({ title: "수정됨", body: "수정된 내용" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "수정됨");
  assert.equal(res.body.body, "수정된 내용");
  assert.equal(res.body.tag, "고민");
  assert.equal(res.body.isMine, true);
});

test("다른 사람의 게시글을 수정하려 하면 403을 반환한다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  const res = await otherAgent.patch(`/api/community/posts/${createRes.body.id}`).send({ title: "수정 시도" });
  assert.equal(res.status, 403);
});

test("관리자는 다른 사람의 게시글도 수정할 수 있다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author2@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const adminCookie = await createAdminCookie();
  const res = await request(app)
    .patch(`/api/community/posts/${createRes.body.id}`)
    .set("Cookie", adminCookie)
    .send({ title: "관리자가 수정함" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "관리자가 수정함");
  assert.equal(res.body.isMine, false);
});

test("비로그인 상태로 게시글을 수정하려 하면 401을 반환한다", async () => {
  const res = await request(app).patch("/api/community/posts/000000000000000000000000").send({ title: "x" });
  assert.equal(res.status, 401);
});

test("존재하지 않는 게시글을 수정하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.patch(`/api/community/posts/${missingId}`).send({ title: "x" });
  assert.equal(res.status, 404);
});

test("빈 제목으로 수정하려 하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const res = await agent.patch(`/api/community/posts/${createRes.body.id}`).send({ title: "   " });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: FAIL(`PATCH` 라우트가 없어서 404, `isMine` 필드도 없음).

- [ ] **Step 3: `community.js`에 `isMine` + `PATCH /posts/:id` 추가**

`server/routes/community.js`의:

```js
const express = require("express");
const Post = require("../models/Post");
const { requireAuth, optionalAuth } = require("../middleware/auth");
```

를:

```js
const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");
```

로 교체한다.

`server/routes/community.js`의:

```js
function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    image: post.image ?? null,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
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
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}

async function canModifyPost(req, post) {
  if (post.author.toString() === req.user.id) {
    return true;
  }
  const requester = await User.findById(req.user.id);
  return requester?.role === "admin";
}
```

로 교체한다. (`PATCH`/`DELETE` 라우트는 항상 `Post.findById`로 populate 전 문서를 받아 이 함수를 호출하므로 `post.author`는 언제나 populate되지 않은 `ObjectId`다 — `.toString()`으로 바로 비교한다.)

`server/routes/community.js`의 `router.post("/posts/:id/comments", ...)` 바로 앞에 추가한다:

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

로 추가한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/routes/community.js server/tests/community-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 게시글 수정 API 추가(PATCH /api/community/posts/:id)

본인 글이거나 관리자면 제목/태그/본문을 수정할 수 있다. serializePost
응답에 isMine 필드를 추가해 프론트가 소유권을 판단할 수 있게 한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — `DELETE /posts/:id`

**Files:**
- Modify: `server/routes/community.js`
- Modify: `server/tests/community-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `canModifyPost(req, post)` 헬퍼.
- Produces: `DELETE /api/community/posts/:id` — 본인/관리자만 삭제 가능, 성공 시 `{}` 반환.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/community-routes.test.js` 끝에 추가한다:

```js
test("본인 게시글을 삭제하면 목록에서 사라진다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "지울 글", body: "내용" });

  const res = await agent.delete(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 0);
});

test("다른 사람의 게시글을 삭제하려 하면 403을 반환한다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author3@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글", body: "내용" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other2@test.com" });
  const res = await otherAgent.delete(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 403);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 1);
});

test("관리자는 다른 사람의 게시글도 삭제할 수 있다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author4@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글", body: "내용" });

  const adminCookie = await createAdminCookie();
  const res = await request(app).delete(`/api/community/posts/${createRes.body.id}`).set("Cookie", adminCookie);
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 0);
});

test("비로그인 상태로 게시글을 삭제하려 하면 401을 반환한다", async () => {
  const res = await request(app).delete("/api/community/posts/000000000000000000000000");
  assert.equal(res.status, 401);
});

test("존재하지 않는 게시글을 삭제하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.delete(`/api/community/posts/${missingId}`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: FAIL(`DELETE` 라우트가 없어서 404).

- [ ] **Step 3: `community.js`에 `DELETE /posts/:id` 추가**

`server/routes/community.js`의 `router.get("/my-posts", ...)` 바로 앞에 추가한다:

```js
router.delete("/posts/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    if (!(await canModifyPost(req, post))) {
      return res.status(403).json({ error: "삭제 권한이 없어요" });
    }
    await Post.findByIdAndDelete(req.params.id);
    res.json({});
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

```

- [ ] **Step 4: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/routes/community.js server/tests/community-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 게시글 삭제 API 추가(DELETE /api/community/posts/:id)

본인 글이거나 관리자면 삭제할 수 있다. 댓글은 게시글 문서에 내장돼
있어 별도 정리 없이 함께 삭제된다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 게시글 수정 페이지 신설

**Files:**
- Modify: `app/(shell)/community/types.ts`
- Create: `app/(shell)/community/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `PATCH /api/community/posts/:id`, `isMine` 필드.
- Produces: `/community/[id]/edit` 페이지 — Task 4(상세 페이지의 "수정" 버튼)가 이 경로로 링크한다.

- [ ] **Step 1: `types.ts`에 `isMine` 추가**

`app/(shell)/community/types.ts`의:

```ts
export type CommunityPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  authorName: string;
  authorRole: string;
  createdAt: string;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};
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
  authorName: string;
  authorRole: string;
  createdAt: string;
  views: number;
  likeCount: number;
  cmtCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};
```

로 교체한다.

- [ ] **Step 2: 수정 페이지 작성**

`app/(shell)/community/[id]/edit/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS } from "../../mock";
import type { CommunityPost } from "../../types";

export default function CommunityPostEditPage() {
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityPostEditForm />
    </RequireAuth>
  );
}

function CommunityPostEditForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/community/posts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setPost(null);
          return;
        }
        const data: CommunityPost = await res.json();
        setPost(data);
        setCategory(data.tag);
        setTitle(data.title);
        setBody(data.body);
      })
      .catch(() => setPost(null));
  }, [params.id]);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/community/posts/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tag: category, title, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정에 실패했습니다");
        return;
      }
      router.push(`/community/${params.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (post === undefined || auth.phase === "loading") {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
    return <div className="py-16 text-center text-text-faint">게시글을 찾을 수 없어요.</div>;
  }

  const canEdit = post.isMine || (auth.phase === "in" && auth.role === "admin");
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
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
        <button
          onClick={() => router.push(`/community/${params.id}`)}
          className="rounded-xl border border-border px-6 py-2.5 text-sm font-bold text-text-muted"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "저장하는 중..." : "저장하기"}
        </button>
      </div>
    </Card>
  );
}
```

이미지 수정은 이 화면에서 다루지 않는다(계획 문서의 Global Constraints 참고 — Plan B가 에디터를 교체하며 다시 다룬다).

- [ ] **Step 3: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/types.ts" "app/(shell)/community/[id]/edit/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/community/types.ts" "app/(shell)/community/[id]/edit/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 게시글 수정 페이지(/community/[id]/edit) 추가

본인 글이거나 관리자일 때만 접근 가능. 아직 이 페이지로 연결하는
버튼은 없다 — 다음 태스크에서 상세 페이지에 "수정" 버튼을 연결한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — 상세 페이지에 수정/삭제 버튼 연결

**Files:**
- Modify: `app/(shell)/community/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `isMine` 필드, Task 2의 `DELETE /api/community/posts/:id`, Task 3의 `/community/[id]/edit` 경로.

- [ ] **Step 1: 수정/삭제 버튼 + 삭제 확인 상태 추가**

`app/(shell)/community/[id]/page.tsx`의:

```tsx
export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [post, setPost] = useState<CommunityPostDetail | null | undefined>(undefined);
  const [comment, setComment] = useState("");
```

를:

```tsx
export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [post, setPost] = useState<CommunityPostDetail | null | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
```

로 교체한다.

`app/(shell)/community/[id]/page.tsx`의:

```tsx
  async function submitComment() {
```

바로 앞에 추가한다:

```tsx
  async function handleDelete() {
    if (!post) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const res = await apiFetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/community");
    }
    setConfirmDelete(false);
  }

```

- [ ] **Step 2: 버튼 JSX 추가**

`app/(shell)/community/[id]/page.tsx`의:

```tsx
          <h1 className="mb-3 text-2xl font-black text-text">{post.title}</h1>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.authorName} · {post.authorRole} · {formatRelativeTime(post.createdAt)} · 조회 {post.views}
          </div>
```

를:

```tsx
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-black text-text">{post.title}</h1>
            {(post.isMine || (auth.phase === "in" && auth.role === "admin")) && (
              <div className="flex flex-shrink-0 gap-1.5">
                <Link
                  href={`/community/${post.id}/edit`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                >
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                    confirmDelete
                      ? "border-danger bg-[#fff0f0] text-danger"
                      : "border-danger text-danger hover:bg-[#fff0f0]"
                  }`}
                >
                  {confirmDelete ? "정말 삭제할까요?" : "삭제"}
                </button>
              </div>
            )}
          </div>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.authorName} · {post.authorRole} · {formatRelativeTime(post.createdAt)} · 조회 {post.views}
          </div>
```

로 교체한다.

- [ ] **Step 3: `CommunityPostDetail` 타입에 `isMine`이 포함되는지 확인**

`app/(shell)/community/types.ts`의 `CommunityPostDetail`은 `CommunityPost & { comments: CommunityComment[] }`로 정의돼 있어(Task 3에서 `CommunityPost`에 `isMine`을 추가했으므로) 별도 수정 없이 자동으로 포함된다. 확인만 한다:

```bash
grep -n "CommunityPostDetail" "app/(shell)/community/types.ts"
```

Expected: `export type CommunityPostDetail = CommunityPost & { comments: CommunityComment[] };` 형태로 나옴.

- [ ] **Step 4: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/[id]/page.tsx"
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 5: 브라우저에서 확인**

```bash
npm run dev
```

일반 계정으로 로그인해 본인이 쓴 글 상세 페이지에서 수정/삭제 버튼이 보이는지, 다른 사람 글에는 안 보이는지 확인한다. 관리자 계정으로는 아무 글에나 수정/삭제 버튼이 보이는지 확인한다. 수정 버튼 클릭 → 내용 고치고 저장 → 반영되는지, 삭제 버튼은 두 번 눌러야(확인) 실제로 지워지는지, 삭제 후 목록으로 돌아가는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/community/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 게시글 상세 페이지에 수정/삭제 버튼 연결

본인 글이거나 관리자일 때만 보인다. 삭제는 2단계 확인을 거친다.

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

`https://create-club.vercel.app/community`에서 본인 글 수정/삭제, 관리자 권한으로 타인 글 수정/삭제, 비로그인/타인 계정에서 버튼이 안 보이는지 확인한다.

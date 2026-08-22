# 공지사항 커뮤니티 페이지 이동 + 게시글 이미지 첨부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) 방금 만든 `/admin/notices` 관리자 전용 페이지를 없애고 커뮤니티 페이지 안에서 관리자가 직접 공지를 관리하게 한다(네이버카페 스타일). (B) 커뮤니티 게시글에 이미지 1장을 첨부할 수 있게 한다.

**Architecture:** A는 순수 프론트엔드 이동(백엔드 API 재사용, UI 위치만 옮김). B는 이미지를 별도 저장 서비스 없이 브라우저에서 리사이즈/압축한 뒤 base64 데이터 URI로 MongoDB에 직접 저장한다 — `Post.image` 필드 하나 추가, `express.json()` 바디 크기 제한 상향, 생성 라우트에 형식/용량 검증 추가가 백엔드 변경의 전부다.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind v4, 브라우저 내장 `<canvas>` API(프론트엔드).

**Spec:** `docs/superpowers/specs/2026-08-23-community-notice-relocation-and-images-design.md`

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 새 npm 의존성 없음(이미지 리사이즈는 브라우저 내장 `<canvas>`만 사용, 별도 이미지 호스팅 서비스 가입 없음).
- 게시글당 이미지는 최대 1장, 댓글에는 첨부 불가.
- 공지사항 사이드바 카드(커뮤니티 페이지 우측)에는 관리 버튼을 추가하지 않는다 — 관리는 공지사항 탭 안에서만 한다.

---

## Task 1: 공지사항 관리를 커뮤니티 페이지로 이동

**Files:**
- Delete: `app/admin/notices/page.tsx`
- Modify: `app/admin/AdminNav.tsx`
- Modify: `app/(shell)/community/page.tsx`

**Interfaces:**
- Consumes: 기존 `GET /api/community/notices`, `POST`/`PATCH`/`DELETE /api/admin/notices`(변경 없음).
- 이 태스크는 다른 태스크와 파일이 겹치지 않는다(Task 2~4는 이미지 관련 파일만 건드림).

- [ ] **Step 1: `/admin/notices` 페이지 삭제**

```bash
git rm "app/admin/notices/page.tsx"
```

- [ ] **Step 2: `AdminNav.tsx`에서 메뉴 제거**

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

를:

```tsx
const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/reports", label: "상담 신고" },
  { href: "/admin/counselors", label: "상담사 인증" },
];
```

로 교체한다.

- [ ] **Step 3: `community/page.tsx`에 관리자 CRUD 상태/핸들러 추가**

```tsx
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost, NoticeItem } from "./types";
```

를:

```tsx
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
import type { CommunityPost, NoticeItem } from "./types";
```

로 교체한다.

```tsx
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]));
  }, []);
```

를:

```tsx
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { state: auth } = useAuthStatus();
  const isAdmin = auth.phase === "in" && auth.role === "admin";
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeBody, setEditNoticeBody] = useState("");
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 공지 목록 조회
  useEffect(loadNotices, []);

  async function submitCreateNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newNoticeTitle, body: newNoticeBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewNoticeTitle("");
    setNewNoticeBody("");
    setCreatingNotice(false);
    loadNotices();
  }

  function startEditNotice(n: NoticeItem) {
    setEditingNoticeId(n.id);
    setEditNoticeTitle(n.title);
    setEditNoticeBody(n.body);
    setNoticeFormError(null);
  }

  async function submitEditNotice(e: FormEvent, id: string) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editNoticeTitle, body: editNoticeBody }),
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
```

로 교체한다.

- [ ] **Step 4: 공지사항 탭 JSX에 관리자 컨트롤 삽입**

```tsx
        {tab === "notice" ? (
          notices.length === 0 ? (
            <div className="py-16 text-center text-text-faint">공지가 없어요</div>
          ) : (
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
          )
        ) : loading ? (
```

를:

```tsx
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
                    <textarea
                      value={newNoticeBody}
                      onChange={(e) => setNewNoticeBody(e.target.value)}
                      placeholder="내용"
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
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
                    <textarea
                      value={editNoticeBody}
                      onChange={(e) => setEditNoticeBody(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
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
                  <Card key={n.id} className="transition-shadow hover:shadow-card">
                    <Link href={`/community/notice/${n.id}`} className="block cursor-pointer">
                      <div className="text-sm font-bold text-primary-dark">공지</div>
                      <div className="mt-1 font-bold text-text">{n.title}</div>
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
```

로 교체한다. (Link가 카드 전체를 감싸던 구조에서, 관리자 버튼이 링크 클릭과 충돌하지 않도록 Card가 Link와 버튼을 함께 감싸는 구조로 바꿨다 — Link는 제목/날짜 영역만 감싼다.)

- [ ] **Step 5: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/page.tsx" "app/admin/AdminNav.tsx"
```

Expected: 에러 없음. `app/admin/notices/page.tsx`를 import하는 곳이 없는지도 확인한다(`grep -r "admin/notices" app`).

- [ ] **Step 6: 브라우저에서 확인**

```bash
npm run dev
```

관리자 계정으로 로그인해 `/community` 공지사항 탭에서 "새 공지 작성"이 보이는지, 작성/수정/삭제가 실제로 되는지 확인한다. 일반 계정(또는 비로그인)으로는 그 버튼들이 전혀 안 보이고 공지 클릭 시 상세 페이지로만 이동하는지 확인한다. `/admin/notices`로 직접 접속하면 404가 뜨는지, `/admin`의 좌측 메뉴에 "공지사항 관리"가 더 이상 없는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add -A -- "app/admin/notices/page.tsx" "app/admin/AdminNav.tsx" "app/(shell)/community/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 공지사항 관리를 관리자 전용 페이지에서 커뮤니티 페이지로 이동

네이버카페처럼 관리자가 커뮤니티 공지사항 탭에서 바로 작성/수정/삭제할
수 있게 한다. 백엔드 API는 그대로 재사용하고 프론트엔드 UI 위치만 옮겼다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — 게시글 이미지 필드 + 검증

**Files:**
- Modify: `server/models/Post.js`
- Modify: `server/index.js`
- Modify: `server/routes/community.js`
- Modify: `server/tests/community-routes.test.js`

**Interfaces:**
- Produces: `Post.image: string | null`, `POST /api/community/posts`가 선택적 `image` 필드를 받고 검증한다, `serializePost`가 응답에 `image`를 포함한다(모든 게시글 조회 라우트가 이 함수를 공유하므로 자동으로 반영됨). Task 3(글쓰기 폼)이 이 필드를 보내고, Task 4(목록/상세 표시)가 이 필드를 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/community-routes.test.js`에 기존 `signup` 헬퍼를 사용해 끝에 추가한다:

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

test("이미지 없이 게시글을 작성하면 image가 null이다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(res.status, 201);
  assert.equal(res.body.image, null);
});

test("잘못된 형식의 이미지 값이면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: "not-a-data-uri" });
  assert.equal(res.status, 400);
});

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

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: FAIL (`image`가 없어서 `undefined`이거나 검증이 없어 400이 나야 할 곳에서 201이 남).

- [ ] **Step 3: `Post` 모델에 `image` 필드 추가**

`server/models/Post.js`의 `body: { type: String, required: true, maxlength: 5000 },` 다음 줄에 추가한다:

```js
    image: { type: String, default: null },
```

- [ ] **Step 4: `express.json()` 바디 크기 제한 상향**

`server/index.js`에서:

```js
app.use(express.json());
```

를:

```js
app.use(express.json({ limit: "3mb" }));
```

로 교체한다.

- [ ] **Step 5: `community.js`에 이미지 검증 + 직렬화 추가**

`server/routes/community.js` 상단, `const router = express.Router();` 다음 줄에 추가한다:

```js
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGE_LENGTH = 2_000_000;
```

`serializePost` 함수를:

```js
function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
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

로 교체한다.

`POST /posts` 라우트를:

```js
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { tag, title, body } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }
    if (title.trim().length > 100 || body.trim().length > 5000) {
      return res.status(400).json({ error: "제목은 100자, 내용은 5000자를 넘을 수 없어요" });
    }

    const post = await Post.create({ author: req.user.id, tag, title: title.trim(), body: body.trim() });
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

로 교체한다.

- [ ] **Step 6: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 7: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/models/Post.js server/index.js server/routes/community.js server/tests/community-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 게시글에 이미지 첨부(base64) 지원 추가

별도 이미지 저장 서비스 없이 브라우저에서 리사이즈/압축한 이미지를
base64 데이터 URI로 받아 MongoDB에 직접 저장한다. 형식과 용량(약 1.46MB
상당)을 서버에서 검증하고, express.json 바디 크기 제한을 3mb로 올렸다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 글쓰기 페이지에 이미지 첨부 UI

**Files:**
- Modify: `app/(shell)/community/types.ts`
- Modify: `app/(shell)/community/write/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `POST /api/community/posts`(`image` 필드 추가).
- Produces: `CommunityPost.image: string | null`(타입). Task 4(목록/상세 표시)가 이 타입을 그대로 쓴다.

- [ ] **Step 1: `types.ts`에 `image` 필드 추가**

`app/(shell)/community/types.ts`의:

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

- [ ] **Step 2: 글쓰기 폼에 이미지 선택 + 리사이즈 로직 추가**

`app/(shell)/community/write/page.tsx`의:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "../mock";
```

를:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "../mock";

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

function resizeImageFile(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이미지를 처리할 수 없어요"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러올 수 없어요"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
    reader.readAsDataURL(file);
  });
}
```

로 교체한다.

`CommunityWriteForm` 함수 내부의:

```tsx
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
```

를:

```tsx
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setImageError("이미지 용량이 너무 커요 (10MB 이하로 선택해주세요)");
      return;
    }
    try {
      const resized = await resizeImageFile(file);
      setImage(resized);
    } catch {
      setImageError("이미지를 처리하지 못했어요");
    }
  }
```

로 교체한다.

`handleSubmit` 함수를:

```tsx
  async function handleSubmit() {
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
      refreshPostCounts();
      router.push(`/community/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }
```

를:

```tsx
  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/community/posts", {
        method: "POST",
        body: JSON.stringify({ tag: category, title, body, image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "글 작성에 실패했습니다");
        return;
      }
      refreshPostCounts();
      router.push(`/community/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }
```

로 교체한다.

textarea 다음(`showCrisis` 블록 이전)에 이미지 첨부 UI를 추가한다. 다음 블록:

```tsx
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="고민이나 이야기를 자유롭게 적어보세요 💙"
        rows={8}
        className="w-full resize-none text-sm leading-relaxed text-text-2 outline-none placeholder:text-text-faint"
      />
      {showCrisis && (
```

를:

```tsx
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="고민이나 이야기를 자유롭게 적어보세요 💙"
        rows={8}
        className="w-full resize-none text-sm leading-relaxed text-text-2 outline-none placeholder:text-text-faint"
      />

      <div className="mt-4 border-t border-border pt-4">
        {image ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI라 next/image 최적화 대상이 아님 */}
            <img src={image} alt="첨부 이미지 미리보기" className="max-h-48 rounded-xl border border-border" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-bold text-white"
            >
              제거
            </button>
          </div>
        ) : (
          <label className="inline-block cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:border-primary">
            📷 이미지 첨부
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
        )}
        {imageError && <p className="mt-2 text-xs font-semibold text-danger">{imageError}</p>}
      </div>

      {showCrisis && (
```

로 교체한다.

- [ ] **Step 3: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/types.ts" "app/(shell)/community/write/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 4: 브라우저에서 확인**

```bash
npm run dev
```

로그인 후 `/community/write`에서 "📷 이미지 첨부"로 사진을 선택하면 미리보기가 뜨는지, "제거"를 누르면 없어지고 다시 첨부 버튼이 보이는지 확인한다. 큰 사진(스마트폰으로 찍은 3~5MB 사진 등)을 선택했을 때 개발자도구 Network 탭에서 실제 전송되는 요청 본문 크기가 원본보다 훨씬 작은지 확인한다(리사이즈/압축이 실제로 되는지). 이미지 없이도 글 작성이 정상적으로 되는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/community/types.ts" "app/(shell)/community/write/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 글쓰기 페이지에 이미지 첨부(리사이즈+압축) UI 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — 게시글 목록/상세에 이미지 표시

**Files:**
- Modify: `app/(shell)/community/page.tsx`
- Modify: `app/(shell)/community/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `serializePost`가 반환하는 `image` 필드, Task 3이 추가한 `CommunityPost.image` 타입.

- [ ] **Step 1: 게시글 목록 카드에 썸네일 추가**

`app/(shell)/community/page.tsx`의 게시글 카드 블록:

```tsx
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{p.body}</div>
```

를:

```tsx
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
```

로 교체한다.

- [ ] **Step 2: 게시글 상세 페이지에 이미지 표시**

`app/(shell)/community/[id]/page.tsx`의:

```tsx
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>
```

를:

```tsx
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
            <img
              src={post.image}
              alt=""
              className="mb-4 max-h-[480px] w-full rounded-xl border border-border object-contain"
            />
          )}
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>
```

로 교체한다.

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/page.tsx" "app/(shell)/community/[id]/page.tsx"
npm run build
```

Expected: 전부 에러 없음. `npm run build`는 이 플랜의 마지막 파일 변경 태스크이므로 전체 프로젝트를 한 번 더 확인하는 의미로 포함한다.

- [ ] **Step 4: 브라우저에서 확인**

`http://localhost:3000/community`에서 이미지 있는 글과 없는 글이 섞인 목록을 확인한다 — 이미지 있는 글만 오른쪽에 작은 썸네일이 뜨는지, 없는 글은 레이아웃이 안 깨지는지 확인한다. 이미지 있는 글의 상세 페이지에서 제목/작성자 정보 아래에 이미지가 온전히(잘리지 않고, 너무 크지 않게) 보이는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/community/page.tsx" "app/(shell)/community/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 게시글 목록/상세 페이지에 첨부 이미지 표시

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

`https://create-club.vercel.app/community`에서 관리자 계정으로 공지 작성/수정/삭제가 되는지, `/admin/notices`가 없어졌는지, 이미지 있는 게시글을 작성해서 목록/상세에 정상적으로 보이는지 확인한다.

# 공지-게시글 통합 + 게시글 수정/삭제 설계

> 배경: 방금 만든 "공지사항" 기능(별도 탭, 별도 `Notice` 모델)을 네이버카페처럼 바꾼다 — 공지는 더 이상 분리된 탭/모델이 아니라, 글쓰기 화면에서 "공지로 등록" 체크 한 번으로 만드는 **일반 게시글의 한 상태**가 된다. 공지는 전체글 목록에 다른 글과 똑같이 섞여 나오고, 그중 "고정"된 것만 맨 위로 뜬다. 이 통합을 하려면 지금 게시글에 아예 없는 **수정/삭제 기능**을 먼저 만들어야 한다(공지 여부를 나중에 바꾸려면 수정 화면이 있어야 하므로).

## 목표 / 비목표

- 목표: (A) 게시글 수정/삭제 기능 신설(본인 글 + 관리자는 아무 글이나). (B) 공지를 `Notice` 모델에서 `Post` 모델의 `isNotice`/`pinned` 필드로 흡수, 굵게/링크/이미지 에디터를 모든 게시글로 확대, "공지사항" 탭 삭제.
- 비목표: 댓글 수정/삭제, 게시글 신고, 카테고리 체계 변경.

## 실행 순서 (계획 문서는 2개로 나눈다)

이 스펙 하나에 설계를 다 담지만, **구현 계획은 2단계로 나눠서 순서대로 실행**한다 — (B)가 (A)의 수정 화면/PATCH API를 그대로 재사용하기 때문에, (A) 없이 (B)를 만들 수 없다. 각 계획은 그 자체로 동작하는 결과물을 낸다.

- **Plan A — 게시글 수정/삭제**: PATCH/DELETE API, 수정 페이지, 상세 페이지의 수정/삭제 버튼. 이 시점엔 아직 공지 개념이 안 들어간다(순수 CRUD 완성).
- **Plan B — 공지-게시글 통합**: `Post`에 `isNotice`/`pinned` 추가, 에디터를 전체 게시글로 확대, "공지사항" 탭 삭제, 기존 `Notice` 3건을 `Post`로 옮기는 1회성 마이그레이션, `Notice` 관련 파일 삭제.

## A. 데이터 모델 — 소유권 판별

지금 `useAuthStatus()`(`GET /api/auth/me`)는 로그인한 사용자의 `id`를 내려주지 않는다(`name`/`role`/`notificationPrefs`만). 프론트가 "이 글이 내 글인가"를 판단하려면 `id`를 새로 노출시켜야 하는데, 대신 이미 있는 패턴(`likedByMe`/`savedByMe`처럼 서버가 `userId`를 받아 계산해서 내려주는 방식)을 그대로 따라 `serializePost`에 **`isMine: boolean`**을 추가한다. 인증 시스템 자체는 건드리지 않는다.

## B. Plan A — 게시글 수정/삭제

### B-1. 백엔드 (`server/routes/community.js`)

**`serializePost`**에 `isMine: userId ? post.author._id.toString() === userId : false` 추가(populate된 `author`의 `_id` 사용 — 기존 `post.author?.name` 패턴과 동일하게 optional chaining).

**`PATCH /posts/:id`**(신규): `requireAuth`. 게시글을 찾고, 요청자가 작성자 본인이거나 관리자(`User.findById(req.user.id)`로 role 확인)가 아니면 403. `tag`/`title`/`body` 중 보낸 필드만 검증 후 반영(기존 `POST /posts`의 길이 제한 재사용: 태그 필수/제목 100자/본문 5000자). 성공 시 `serializePost` 응답.

**`DELETE /posts/:id`**(신규): `requireAuth`. 작성자 본인이거나 관리자면 `Post.findByIdAndDelete`. 댓글은 `Post` 문서 안에 내장돼 있어서 게시글 삭제 시 자동으로 같이 지워진다(별도 정리 불필요).

### B-2. 프론트엔드

**`app/(shell)/community/[id]/edit/page.tsx`**(신규): `RequireAuth`로 감싼다. `GET /api/community/posts/:id`로 기존 글을 불러와 `post.isMine`이 아니고 관리자도 아니면 "수정 권한이 없어요" 안내 후 상세 페이지로 돌려보낸다. 폼은 `write/page.tsx`와 거의 동일(주제 칩 + 제목 입력 + 본문 textarea) — 이 시점엔 아직 리치 에디터가 아니라 지금 있는 평문 textarea 그대로 재사용한다(에디터 확대는 Plan B에서). 제출 시 `PATCH /api/community/posts/:id`.

**`app/(shell)/community/[id]/page.tsx`**: `post.isMine || (auth.role === 'admin')`일 때 상세 페이지 하단(공감/저장 버튼 근처)에 "수정"(edit 페이지로 이동) / "삭제"(확인 2단계 후 `DELETE`, 성공 시 `/community`로 이동) 버튼을 추가한다.

**`app/(shell)/community/types.ts`**: `CommunityPost`에 `isMine: boolean` 추가.

## C. Plan B — 공지-게시글 통합

### C-1. 데이터 모델

**`server/models/Post.js`**: `isNotice: { type: Boolean, default: false }`, `pinned: { type: Boolean, default: false }` 추가. `body`의 `maxlength`를 5000 → 12,000,000(공지 때 쓰던 값 재사용 — 리치 텍스트 + 이미지 여러 장 수용).

**`server/models/Notice.js`, `server/routes/notices.js`, `server/routes/adminNotices.js`**: 삭제. `server/index.js`에서 이 라우터들을 마운트하던 줄(`app.use("/api/community/notices", ...)`, `app.use("/api/admin/notices", ...)`, 관련 `require`)과 `/api/admin/notices` 전용 바디 크기 제한 줄도 제거.

**`server/lib/sanitizeNotice.js` → `server/lib/sanitizeHtml.js`로 이름 변경**: 내용(= `SANITIZE_OPTIONS`, `sanitizeBody`)은 그대로, 더 이상 공지 전용이 아니라 게시글 전체가 쓰는 공용 모듈이라 이름만 일반화한다.

**게시글 본문 검증/정리 로직을 `adminNotices.js`(삭제 예정)에서 `community.js`로 이식**: `sanitizeAndValidateBody`(sanitize 후 이미지 최대 5장/장당 2MB/전체 12MB 검증), `isBodyEmpty`(태그 제거 후 텍스트도 없고 이미지도 없으면 빈 글로 취급) 함수를 `community.js`에 그대로 옮긴다. `POST /posts`, `PATCH /posts/:id`에서 `body`를 저장하기 전 항상 이 검증을 거친다. 기존에 있던 단독 `image` 필드 입력(요청 바디의 `image`, `IMAGE_RE`/`MAX_IMAGE_LENGTH` 검증)은 **더 이상 받지 않는다** — 이제 이미지는 본문 에디터 안에 인라인으로 들어간다. `Post.image` 스키마 필드 자체는 남겨서 과거 게시글(예: "이미지 테스트" 글) 읽기/표시는 그대로 유지한다.

### C-2. 백엔드 — `POST /posts`, `PATCH /posts/:id`에 `isNotice`/`pinned` 반영

```js
async function resolveNoticeFields(req, payload) {
  const { isNotice, pinned } = payload; // payload = req.body(요청 바디) — Post.body(게시글 본문)와 이름이 겹치지 않도록 구분
  if (typeof isNotice !== "boolean" && typeof pinned !== "boolean") {
    return {}; // 아무것도 안 보냈으면 손대지 않는다
  }
  const requester = await User.findById(req.user.id);
  if (requester?.role !== "admin") {
    return {}; // 관리자가 아니면 조용히 무시(에러 아님 — 일반 사용자는 애초에 이 필드를 안 보냄)
  }
  const result = {};
  if (typeof isNotice === "boolean") result.isNotice = isNotice;
  if (typeof pinned === "boolean") result.pinned = pinned;
  return result;
}
```

`POST /posts`: 위 함수로 `{isNotice, pinned}`를 구해 `Post.create`에 병합. `pinned`는 `isNotice`가 최종적으로 `true`일 때만 유지하고, 아니면 강제로 `false`(별도 400 에러 없이 조용히 보정 — "공지가 아닌데 고정하려 함" 같은 사용자 실수를 굳이 막을 필요 없이 그냥 무시).

`PATCH /posts/:id`: 같은 함수로 얻은 필드를 `post.isNotice`/`post.pinned`에 반영. `isNotice`를 `false`로 내리면 `pinned`도 같이 `false`로 만든다(공지가 아닌데 고정된 상태로 남는 걸 방지).

`serializePost`에 `isNotice: !!post.isNotice`, `pinned: !!post.pinned` 추가.

### C-3. 프론트엔드 — 에디터 통합

**`app/(shell)/community/NoticeEditor.tsx` → `PostEditor.tsx`로 이름 변경**: 내용 그대로, 이름만 일반화(더 이상 공지 전용이 아님).

**`app/globals.css`**: `.notice-body` 클래스를 `.rich-body`로 이름 변경(공지 전용이 아니게 됐으므로). `PostEditor.tsx`(`EditorContent`의 className), 게시글 상세 페이지, `[id]/edit/page.tsx` 세 곳에서 참조를 갱신한다.

**공용 컴포넌트 `app/(shell)/community/PostForm.tsx`(신규)**: 지금 `write/page.tsx`에 있는 폼(주제 칩 + 제목 + 본문 + 제출 버튼 + 위기 감지 안내)을 이 컴포넌트로 옮기고, `write/page.tsx`와 `[id]/edit/page.tsx`가 둘 다 이 컴포넌트를 쓰게 리팩터한다(두 화면이 사실상 같은 폼이라 중복을 없앤다). Props: `postId?: string`(없으면 작성 모드, 있으면 수정 모드), `initial?: { tag; title; body; isNotice; pinned }`(수정 모드일 때만), `onSuccess: (id: string) => void`. 내부에서:
- 본문 입력을 `<textarea>`(Plan A에서 만든 임시 버전)에서 `<PostEditor>`로 교체.
- `useAuthStatus()`로 관리자 여부 확인 — 관리자면 "📌 공지로 등록"(`isNotice`) 체크박스가 보이고, 체크했을 때만 그 아래 "📌 상단 고정"(`pinned`) 체크박스가 나타난다.
- `isNotice`가 체크된 상태에서는 주제 칩 선택 UI를 숨기고 "공지는 별도 배지로 표시돼요" 안내로 대체하며, 제출 시 `tag`를 `"공지"` 문자열로 강제 지정한다.
- 제출 시 `postId`가 있으면 `PATCH /api/community/posts/:postId`, 없으면 `POST /api/community/posts`(관리자가 아니면 `isNotice`/`pinned`는 요청 바디에 아예 안 붙인다 — 어차피 서버도 무시하지만 요청을 깔끔하게 유지).

**`write/page.tsx`**: `RequireAuth`로 `<PostForm onSuccess={(id) => router.push(`/community/${id}`)} />`만 감싸는 얇은 페이지로 축소.

**`[id]/edit/page.tsx`**(Plan A에서 만든 것 수정): 기존 글 로드 후 `<PostForm postId={id} initial={{...}} onSuccess={...} />` 렌더. 레거시 평문(HTML 태그가 하나도 없는) 본문은 `PostEditor`에 넘기기 전에 안전한 HTML로 변환해야 한다 — 지금 `page.tsx`에 있는 `isLegacyPlainText`/`legacyPlainTextToHtml` 헬퍼를 이 파일로 옮겨서 재사용한다(더 이상 다른 곳에서 안 쓰므로 이동, 복사 아님).

### C-4. 프론트엔드 — 목록/정렬/탭 제거

**`app/(shell)/community/page.tsx`**: 공지 인라인 CRUD 관련 코드를 전부 제거한다 — `notices` state, `loadNotices`, `submitCreateNotice`/`startEditNotice`/`submitEditNotice`/`handleDeleteNotice`, `creatingNotice`/`newNotice*`/`editingNoticeId`/`editNotice*`/`confirmDeleteNoticeId` state, `NoticeItem` import, "공지사항" 탭 자체(`Tab` 타입에서 `"notice"` 제거, 탭 버튼 배열에서 제거). `isLegacyPlainText`/`legacyPlainTextToHtml`도 이 파일에서 제거(edit 페이지로 이동했으므로).

목록 카드: 게시글이 `isNotice`면 상단 태그 칩 자리에 `{p.pinned ? "📌 고정 공지" : "공지"}`를 보여주고(기존 공지 카드와 동일한 표현), 배경도 `pinned`일 때 `bg-primary-xlight`로 강조한다. `isNotice`가 아니면 지금처럼 `{p.tag}` 칩 그대로.

정렬(`filtered` useMemo): `tab === "all"`이고 `topic`이 없고 `search`가 비어있을 때만 "고정 공지 먼저, 그다음 선택한 정렬"로 묶는다 — 주제 필터링/검색/인기글 탭에서는 고정을 강제로 끌어올리지 않고 자연스러운 순서에 놔둔다.

```ts
const filtered = useMemo(() => {
  let list = tab === "best" ? pickPopularPosts(posts) : [...posts];
  if (topic) list = list.filter((p) => p.tag === topic);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
  }
  if (tab !== "best") {
    if (sort === "likes") list.sort((a, b) => b.likeCount - a.likeCount);
    else if (sort === "comments") list.sort((a, b) => b.cmtCount - a.cmtCount);
    else if (sort === "views") list.sort((a, b) => b.views - a.views);
    else list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  const showPinnedFirst = tab === "all" && !topic && !search.trim();
  if (showPinnedFirst) {
    const pinned = list.filter((p) => p.isNotice && p.pinned);
    const rest = list.filter((p) => !(p.isNotice && p.pinned));
    return [...pinned, ...rest];
  }
  return list;
}, [tab, search, topic, sort, posts]);
```

우측 사이드바 "📋 공지사항" 카드: `posts.filter(p => p.isNotice).slice(0, 5)`로 바꾼다(더 이상 별도 `notices` state가 없으므로).

`GET /posts`의 서버 쪽 정렬은 지금처럼 `{ createdAt: -1 }` 그대로 둔다(안 건드림) — 고정/필터/정렬 조합은 전부 위 `filtered`에서 클라이언트가 매번 다시 계산하므로, 서버 정렬 순서는 최초 fetch 시점의 기본값 이상의 의미가 없다.

**`app/(shell)/community/types.ts`**: `NoticeItem` 타입 삭제. `CommunityPost`에 `isNotice: boolean`, `pinned: boolean` 추가.

### C-5. 옛 공지 상세 페이지 정리

**`app/(shell)/community/notice/[id]/page.tsx`**: 삭제(공지도 이제 `/community/[id]`로 들어간다). 이 페이지로 들어오는 예전 링크(사이드바 알림 등에 박제된 링크가 있다면)는 404가 뜨는데, 지금 이 프로젝트 규모(개인 캡스톤, 실사용자 극소수)에서는 리다이렉트까지 만들 필요는 없다고 본다.

### C-6. 마이그레이션 (1회성, 코드로 안 남기는 스크립트)

`server/scripts/migrate-notices-to-posts.js`(신규, 1회 실행 후 지워도 되는 성격이지만 실행 기록을 위해 커밋에는 남긴다): `MONGODB_URI` 환경변수로 DB에 연결 → `role: "admin"`인 첫 `User`를 찾아 `authorId`로 사용 → 기존 `Notice` 컬렉션의 모든 문서를 `Post.create([...], { timestamps: false })`로 옮긴다(`author: authorId, tag: "공지", title, body, isNotice: true, pinned, createdAt: notice.createdAt, updatedAt: notice.createdAt` — `{ timestamps: false }` 옵션으로 Mongoose가 `createdAt`을 현재 시각으로 덮어쓰지 않게 한다) → 성공적으로 옮긴 개수를 로그로 출력 → `Notice` 컬렉션을 통째로 drop.

**이 스크립트는 로컬(테스트용 in-memory Mongo)에서 먼저 검증하고, 실제 프로덕션 DB에 대해 실행하는 것은 반드시 사용자 확인을 받은 뒤에 한다** — 되돌리기 어려운 프로덕션 데이터 변경이기 때문이다.

## 영향 범위 및 테스트

- 삭제: `server/models/Notice.js`, `server/routes/notices.js`, `server/routes/adminNotices.js`, `server/tests/notice-routes.test.js`, `server/tests/admin-notices-routes.test.js`, `app/(shell)/community/notice/[id]/page.tsx`.
- 이름 변경: `server/lib/sanitizeNotice.js`→`sanitizeHtml.js`, `app/(shell)/community/NoticeEditor.tsx`→`PostEditor.tsx`, CSS `.notice-body`→`.rich-body`.
- 새 파일: `app/(shell)/community/[id]/edit/page.tsx`, `app/(shell)/community/PostForm.tsx`, `server/scripts/migrate-notices-to-posts.js`.
- 백엔드는 TDD(`node --test`) — PATCH/DELETE 권한(본인/관리자/타인 거부), isNotice/pinned 관리자 전용 처리, pinned가 isNotice=false와 함께 저장 안 되는지, 본문 sanitize/빈 내용/이미지 검증(기존 공지 테스트에서 옮겨옴)을 커버한다.
- 프론트는 tsc/eslint/build + 수동 확인: 일반 사용자로 글 작성 시 공지 체크박스 안 보이는지, 관리자로 공지+고정 작성 시 전체글 목록 맨 위에 뜨는지, 본인 글/타인 글/관리자 시점에서 수정·삭제 버튼 노출이 올바른지, 레거시 평문 공지를 수정해도 줄바꿈이 안 깨지는지, 마이그레이션 후 기존 공지 3개가 게시글 목록에 정상적으로 섞여 나오는지.

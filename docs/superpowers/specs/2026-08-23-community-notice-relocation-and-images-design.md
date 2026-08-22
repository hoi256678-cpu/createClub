# 공지사항 커뮤니티 페이지 이동 + 게시글 이미지 첨부 설계

> 배경: 두 가지 독립적인 요청을 함께 다룬다. (A) 방금 만든 `/admin/notices` 관리자 전용 페이지 대신, 네이버카페처럼 커뮤니티 페이지 안에서 관리자가 바로 공지를 관리할 수 있게 한다. (B) 커뮤니티 게시글에 이미지 1장을 첨부할 수 있게 한다.

## A. 공지사항 관리를 커뮤니티 페이지로 이동

### 현재 상태

`/admin/notices`(관리자 전용 페이지)에서 공지 목록 조회(`GET /api/community/notices`, 공개 API 재사용)와 작성/수정/삭제(`POST`/`PATCH`/`DELETE /api/admin/notices`, 관리자 전용 API)를 처리하고 있다. 백엔드 API는 이미 완성되어 있고 바뀔 필요가 없다 — 이번 변경은 순전히 프론트엔드 UI 위치 이동이다.

### 변경

- `app/admin/notices/page.tsx` 삭제.
- `app/admin/AdminNav.tsx`에서 `{ href: "/admin/notices", label: "공지사항 관리" }` 항목 삭제.
- `app/(shell)/community/page.tsx`의 공지사항 탭(`tab === "notice"`) 안에, 로그인한 사용자가 관리자(`useAuthStatus()`의 `state.role === "admin"`, `state.phase === "in"`)일 때만:
  - 탭 상단에 "새 공지 작성" 버튼 → 제목/내용 입력 폼이 펼쳐짐(기존 `/admin/notices`의 작성 폼과 동일한 필드/검증, `POST /api/admin/notices` 호출).
  - 각 공지 카드에 "수정"/"삭제" 버튼 추가(기존 `/admin/notices`의 수정/삭제 로직을 그대로 옮겨온다 — 인라인 편집 폼, 2단계 삭제 확인).
- 관리자가 아니거나 비로그인 상태에서는 지금과 완전히 동일하게 보인다(읽기 전용 목록).

## B. 커뮤니티 게시글 이미지 첨부

### 범위

- 게시글당 이미지 **최대 1장**. 댓글에는 첨부 불가.
- 저장 방식: **MongoDB에 base64 데이터 URI 문자열로 직접 저장**(별도 이미지 저장 서비스 없음 — 이 프로젝트에 지금까지 이미지 업로드 인프라가 전혀 없었고, 새 외부 서비스 가입 없이 가는 쪽을 선택했다).
- 용량 문제를 줄이기 위해 **브라우저에서 업로드 전에 리사이즈+압축**한다(원본을 그대로 base64로 바꾸지 않는다).

### B-1. 백엔드

**`server/models/Post.js`**: `image: { type: String, default: null }` 필드 추가(data URI 문자열 그대로 저장).

**`server/index.js`**: `app.use(express.json())`의 기본 바디 크기 제한(100KB)으로는 이미지가 포함된 요청이 아예 들어오지 못한다. `app.use(express.json({ limit: "3mb" }))`로 늘린다.

**`server/routes/community.js`의 `POST /posts`**: body에 선택적 `image` 필드를 받는다.
- `image`가 오면: `data:image/(jpeg|png|webp);base64,`로 시작하는 문자열인지 검사(아니면 400), 문자열 길이가 약 2,000,000자(원본 약 1.46MB 상당)를 넘으면 400.
- `image`가 없거나 `null`이면 기존과 동일하게 동작(이미지 없는 게시글).
- 생성된 게시글의 `serializePost` 응답에 `image` 필드를 포함시킨다.

기존 게시글 조회 API(`GET /posts`, `GET /posts/:id`, `GET /my-posts`, `GET /my-saved-posts`)의 `serializePost` 응답에도 `image` 필드가 자동으로 포함되어야 한다(공통 `serializePost` 함수 하나를 여러 라우트가 재사용하므로, 그 함수만 고치면 전부 반영된다).

### B-2. 프론트엔드

**`app/(shell)/community/types.ts`**: `CommunityPost` 타입에 `image: string | null` 필드 추가.

**`app/(shell)/community/write/page.tsx`**: 파일 선택 입력(`<input type="file" accept="image/*">`) 추가.
- 파일 선택 시 브라우저에서 `<canvas>`로 리사이즈(긴 변 기준 최대 1200px)와 JPEG 압축(품질 0.8)을 거쳐 data URI 문자열로 변환한다.
- 원본 파일이 10MB를 넘으면 브라우저가 멈추는 걸 막기 위해 처리 전에 즉시 거부(안내 메시지).
- 미리보기 썸네일 + "제거" 버튼 표시.
- 제출 시 `image`가 있으면 `POST /api/community/posts` body에 함께 보낸다.

**게시글 목록 카드**(`community/page.tsx`)와 **게시글 상세**(`community/[id]/page.tsx`): `post.image`가 있으면 목록에는 작은 썸네일(텍스트 미리보기 옆이나 위), 상세 페이지에는 제목/메타 정보 아래에 원본 크기(반응형으로 폭에 맞춤)로 표시한다. 없으면 지금과 동일하게 텍스트만 보인다.

## 영향 범위 및 테스트

- 변경/삭제 파일: `app/admin/notices/page.tsx`(삭제), `app/admin/AdminNav.tsx`, `app/(shell)/community/page.tsx`, `server/models/Post.js`, `server/index.js`, `server/routes/community.js`, `server/tests/community-routes.test.js`, `app/(shell)/community/types.ts`, `app/(shell)/community/write/page.tsx`, `app/(shell)/community/[id]/page.tsx`.
- 새 npm 의존성 없음(캔버스 리사이즈는 브라우저 내장 API만 사용).
- 백엔드는 TDD, 프론트엔드는 tsc/eslint/build + 수동 확인.
- 수동 확인: 관리자 계정으로 커뮤니티 공지 탭에서 작성/수정/삭제가 실제로 되는지, 관리자가 아닌 계정에는 그 버튼들이 안 보이는지, `/admin/notices` 경로가 더 이상 없는지. 이미지 있는 글/없는 글 둘 다 작성해서 목록과 상세에서 정상 표시되는지, 아주 큰 이미지(예: 8MB짜리 사진)를 선택해도 실제 전송되는 크기는 훨씬 작아지는지(개발자도구 Network 탭에서 확인), 이미지 없이도 기존처럼 글 작성이 되는지.
- 참고(코드 변경 아님): 무료 MongoDB Atlas는 512MB 한도라, 이미지가 쌓이면 텍스트만 있을 때보다 용량이 빨리 찰 수 있다 — 지금 당장 대응할 사항은 아니지만 인지하고 있을 것.

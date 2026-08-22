# 관리자 공지사항 관리 기능 설계

> 배경: 커뮤니티 탭의 "공지사항"이 `app/(shell)/community/mock.ts`의 `NOTICE_POSTS` 하드코딩 배열 3개뿐이고, 관리자가 공지를 추가/수정/삭제할 방법이 전혀 없다. 이 문서는 공지사항을 서버에 저장하고 관리자 페이지에서 CRUD할 수 있게 만드는 설계를 다룬다.

## 범위

1. `Notice` 모델(신규) + 공개 조회 API(목록/상세) + 관리자 전용 생성/수정/삭제 API
2. 커뮤니티 페이지·공지 상세 페이지를 하드코딩 배열 대신 API 조회로 교체
3. `/admin/notices` 신규 페이지 — 목록 + 작성/수정/삭제 폼, `AdminNav`에 메뉴 추가

## A. 백엔드

### A-1. `Notice` 모델 (신규 파일 `server/models/Notice.js`)

```js
{
  title: String (required, maxlength 100),
  body: String (required, maxlength 2000),
  createdAt: Date (timestamps),
}
```

작성자 구분은 두지 않는다 — 관리자 전용 콘텐츠라 "누가 썼는지"보다 "무슨 내용인지"가 중요하고, 기존 `NOTICE_POSTS`도 작성자 개념이 없었다.

### A-2. 공개 조회 (신규 파일 `server/routes/notices.js`, `/api/community/notices`에 마운트)

- `GET /` — 인증 불필요. 전체 공지를 `createdAt` 내림차순(최신 먼저)으로 반환: `[{id, title, body, createdAt}, ...]`. 기존 `community/posts` 목록 조회(`optionalAuth`)와 같은 공개 수준.
- `GET /:id` — 인증 불필요. 없으면 404.

### A-3. 관리자 CRUD (신규 파일 `server/routes/adminNotices.js`, `/api/admin/notices`에 마운트, 전부 `requireAuth`+`requireAdmin`)

- `POST /` — body `{title, body}`. 둘 다 비어있으면 400. 생성된 공지 반환(201).
- `PATCH /:id` — body `{title?, body?}`. 전달된 필드만 갱신. 없으면 404.
- `DELETE /:id` — 없으면 404, 있으면 삭제 후 `{}`.

관리자 페이지의 "목록 보기"는 별도 관리자 전용 엔드포인트를 만들지 않고 A-2의 공개 `GET /api/community/notices`를 그대로 재사용한다 — 공지는 애초에 전부 공개 콘텐츠라 admin용과 public용을 분리할 이유가 없다(신고/게시글 관리와 다른 점).

## B. 프론트엔드 — 커뮤니티 (공지 소비 쪽)

- `app/(shell)/community/mock.ts`: `NOTICE_POSTS` export 제거(`TOPICS`/`TOPIC_EMOJI`는 그대로 유지).
- `app/(shell)/community/time.ts`: `formatNoticeDate(iso: string): string` 추가 — `"2024.03.01"` 형식(기존 정적 배열의 `time` 필드와 같은 표기)으로 절대 날짜를 반환한다. 상대 시간(`formatRelativeTime`)과 다른 이유: 공지는 "3일 전"보다 정확한 날짜가 더 적절하다(기존 표기 방식을 그대로 유지).
- `app/(shell)/community/page.tsx`: 마운트 시 `GET /api/community/notices`를 호출해 상태로 들고, 공지사항 탭과 사이드바 카드 두 곳에서 `NOTICE_POSTS` 대신 이 상태를 쓴다. 날짜 표시는 `formatNoticeDate(n.createdAt)`으로 교체.
- `app/(shell)/community/notice/[id]/page.tsx`: 마운트 시 `GET /api/community/notices/${id}`를 호출한다. 404면 기존과 동일하게 "공지를 찾을 수 없어요" 표시. 날짜 표시는 `formatNoticeDate(notice.createdAt)`으로 교체.

## C. 프론트엔드 — 관리자 페이지

### C-1. 신규 페이지 `app/admin/notices/page.tsx`

`app/admin/reports/page.tsx`와 같은 스타일(목록 카드, `apiFetch` 훅 패턴)을 따른다.

- 상단에 "새 공지 작성" 버튼 — 클릭 시 제목/본문 입력 폼이 펼쳐짐(작성 중엔 버튼이 폼으로 바뀜).
- 목록: 각 공지를 카드로 나열 — 제목, 날짜, 본문 미리보기(2줄 정도), "수정"/"삭제" 버튼.
- "수정" 클릭 시 그 카드가 인라인으로 편집 폼으로 바뀐다(제목/본문 입력창 + 저장/취소).
- "삭제"는 확인 없이 바로 지우지 않고, 클릭 시 버튼이 "정말 삭제할까요?" 확인 상태로 바뀌었다가 다시 누르면 삭제(신규 작성 폼처럼 별도 모달을 띄우지 않는, 이 앱의 기존 삭제 확인 패턴과 일관되게 가볍게 처리).

### C-2. `app/admin/AdminNav.tsx`에 메뉴 추가

`ADMIN_NAV_ITEMS`에 `{ href: "/admin/notices", label: "공지사항 관리" }`를 추가한다(상담 신고와 상담사 인증 사이, 혹은 적절한 위치).

## 영향 범위 및 테스트

- 신규/변경 파일: `server/models/Notice.js`(신규), `server/routes/notices.js`(신규), `server/routes/adminNotices.js`(신규), `server/index.js`(라우터 마운트), `server/tests/notice-routes.test.js`(신규), `server/tests/admin-notices-routes.test.js`(신규), `app/(shell)/community/mock.ts`, `app/(shell)/community/time.ts`, `app/(shell)/community/page.tsx`, `app/(shell)/community/notice/[id]/page.tsx`, `app/admin/notices/page.tsx`(신규), `app/admin/AdminNav.tsx`.
- 새 npm 의존성 없음.
- 백엔드는 TDD(`node --test`), 프론트엔드는 tsc/eslint/build + 수동 확인.
- 수동 확인: 관리자 페이지에서 공지 작성 → 커뮤니티 탭/사이드바에 바로 뜨는지, 공지 클릭 시 상세 페이지가 정상 표시되는지, 관리자 페이지에서 수정하면 반영되는지, 삭제하면 커뮤니티에서 사라지는지, 비로그인 상태로 커뮤니티 공지 조회는 되지만 관리자 API 호출은 401/403이 뜨는지.

# 관리자 페이지(코어) 설계

## 배경

솜잇에는 지금 관리자 개념이 전혀 없다. `User.role`은 `counselor` | `client`뿐이고, 부적절한 게시글/댓글을 지울 방법도, 상담 신고(`Report`)를 처리할 화면도, 상담사 자가 등록을 검증할 방법도 없다. 이 문서는 관리자 로그인과 4가지 관리 기능(사용자/커뮤니티/신고/상담사 인증)의 코어를 다룬다.

방문자/페이지뷰 트래픽 분석은 완전히 별도의 트래킹 인프라가 필요해 이번 범위에서 제외하고, 별도 설계로 나중에 다룬다.

## 범위

**포함**
- 관리자 로그인(기존 `/login` 재사용, role 기반 리다이렉트)
- 사용자 목록 조회, 정지/정지 해제
- 게시글/댓글 삭제
- 상담 신고 처리(review 표시)
- 상담사 인증 승인 (자가 등록 → 승인 대기 → 관리자 승인 흐름으로 전환)

**제외 (이번 범위 아님)**
- 방문자/페이지뷰 트래픽 분석 (별도 라운드)
- 상담사 인증 "거절" 액션 (승인만 있음 — 승인 안 하면 그냥 대기 상태로 남는다)
- 통계 대시보드(가입자 수 등 숫자 요약)
- 게시글/댓글 수정, 사용자 계정 삭제(정지만 지원)

## 확정된 결정 사항

- 관리자 계정은 회원가입으로 만들 수 없다 (`/api/auth/signup`은 계속 `counselor`/`client`만 허용). `server/scripts/promote-admin.js`로 기존 계정을 admin으로 승격시키는 1회성 스크립트를 추가한다 (`seed-counselors.js`와 동일한 실행 패턴).
- 로그인은 `/login` 하나만 쓴다. 로그인 성공 시 `next` 파라미터가 명시되지 않았고 응답의 `role`이 `admin`이면 `/admin`으로, 그 외엔 기존과 동일하게 처리한다.
- 정지된 계정(`suspended: true`)은 로그인 자체가 막힌다 (이미 로그인된 세션을 강제로 끊지는 않음 — 이번 범위에서는 다음 로그인부터 차단으로 충분).
- 상담사 등록 흐름 변경: `POST /counselors/register`가 더 이상 즉시 `verified: true`를 주지 않는다. 등록 폼을 제출하면 `verified: false` 상태로 "승인 대기"가 되고, 관리자가 승인해야 `/counselors` 목록에 노출된다 (목록 라우트는 이미 `verified: true`만 필터링하므로 변경 불필요).
- 관리자 화면은 클라이언트용 `(shell)` 레이아웃(사이드바/하단탭)과 완전히 분리한다. `/admin` 전용 최상위 라우트 그룹에 자체 레이아웃을 둔다.

## 데이터 모델

`server/models/User.js` 수정:
```js
role: { type: String, required: true, enum: ["counselor", "client", "admin"] },
suspended: { type: Boolean, default: false },
```

`Post`, `ChatRoom`, `Report` 스키마 변경 없음 — 기존 필드로 충분하다.

## 백엔드

### 미들웨어

`server/middleware/auth.js`에 추가:
```js
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "관리자만 접근할 수 있어요" });
  }
  next();
}
```
`/api/admin/*`의 모든 라우트는 `requireAuth, requireAdmin` 순서로 체이닝한다.

### 신규 라우트: `server/routes/admin.js` → `index.js`에 `/api/admin`로 마운트

| Method | Path | 설명 |
|---|---|---|
| GET | `/users` | 전체 사용자 목록 (`?role=`로 필터 가능). `id, name, email, role, suspended, createdAt` — `passwordHash` 제외 |
| POST | `/users/:id/suspend` | 정지 상태 토글. 응답: `{ suspended }` |
| GET | `/posts` | 전체 게시글 목록, 댓글까지 포함해서 한 번에 내려줌 (이 규모에서 별도 상세 호출 불필요) |
| DELETE | `/posts/:id` | 게시글 삭제 |
| DELETE | `/posts/:id/comments/:commentId` | 댓글 하나 삭제 (`post.comments.pull()` 후 저장) |
| GET | `/reports` | 신고 목록 (`?status=open`으로 필터 가능), reporter/counselor populate |
| POST | `/reports/:id/review` | `status`를 `reviewed`로 변경 |
| GET | `/counselors/pending` | `role: "counselor", "counselorProfile.verified": false, "counselorProfile.major": { $exists: true, $ne: "" }` — 등록 폼을 제출했지만 미승인인 계정만 (가입만 하고 등록 안 한 상담사는 제외) |
| POST | `/counselors/:id/approve` | `counselorProfile.verified = true` |

`POST /counselors/register` 수정: `user.counselorProfile.verified = true` → `false`로 변경.

`POST /auth/login` 수정: 비밀번호 검증 통과 후 `if (user.suspended) return res.status(403).json({ error: "정지된 계정이에요. 관리자에게 문의해주세요." })` 추가.

## 프론트엔드

- `app/hooks/useAuthStatus.tsx`: `LoggedInUser.role` 타입에 `"admin"` 추가.
- `app/components/RequireAdmin.tsx` (신규, `RequireAuth`와 동일한 구조):
  - `phase === "loading"` → 스피너
  - `phase === "out"` → `/login?next=<현재 경로>`로 리다이렉트
  - `phase === "in"`이지만 `role !== "admin"` → `/`로 리다이렉트
  - `role === "admin"` → children 렌더
- `app/login/page.tsx`: 로그인 성공 후 `nextPath`가 기본값(파라미터 없음)이고 `role === "admin"`이면 `/admin`으로 이동.
- `app/(shell)/counselors/register/...` (등록 폼): 제출 성공 메시지를 "등록 완료, 목록에 바로 노출"에서 "등록 완료, 관리자 승인 후 노출돼요"로 문구 수정.

### 신규 라우트: `app/admin/`

`(shell)` 밖의 별도 최상위 그룹. `app/admin/layout.tsx`가 `RequireAdmin`으로 감싸고, 자체 사이드바(대시보드/사용자/커뮤니티/신고/상담사 인증) 렌더.

- `app/admin/page.tsx` — 4개 섹션으로 가는 메뉴만 (통계 대시보드 없음, 이번 범위 아님)
- `app/admin/users/page.tsx` — 사용자 목록 테이블(이름/이메일/역할/가입일) + 역할 필터 + 정지 토글 버튼
- `app/admin/community/page.tsx` — 게시글 목록, 각 글 펼치면 댓글까지 보이고 게시글/댓글 각각 삭제 버튼
- `app/admin/reports/page.tsx` — 신고 목록(신고자/상담사/사유/상태/날짜) + open 상태에 "처리완료로 표시" 버튼
- `app/admin/counselors/page.tsx` — 승인 대기 상담사 목록(이름/전공/소개/태그) + "승인" 버튼

## 에러 처리

기존 패턴과 동일: 인증 실패 401, 권한 없음 403, 유효성 검증 실패 400 + 한글 메시지. 관리자 화면에서 fetch 실패 시 "불러오는 중 오류가 발생했어요" 안내.

## 테스트

`server/tests/admin-routes.test.js`를 `community-routes.test.js`와 동일한 패턴(`mongodb-memory-server` + `supertest`)으로 작성. 최소 커버리지:
- admin이 아닌 로그인 사용자가 `/api/admin/*` 호출 → 403
- 비로그인 → 401
- 사용자 정지 토글 → 정지된 계정으로 로그인 시도하면 403
- 게시글/댓글 삭제 → 목록에서 사라짐
- 신고 review 처리 → status가 reviewed로 바뀜
- 상담사 등록 후 `/counselors` 목록에 안 보임(미승인) → 승인 후 노출됨
- `/counselors/pending`에는 등록 폼 제출한 계정만 나오고, 가입만 한 계정은 안 나옴

프론트는 이 코드베이스 관례대로(백엔드만 테스트, 프론트는 타입체크/린트/빌드 + 라이브 배포 후 수동 확인)로 검증한다.

## 미해결/추후 과제 (이번 범위 아님)

- 방문자/페이지뷰 트래픽 분석 (별도 설계)
- 상담사 인증 "거절" 액션
- 통계 대시보드
- 정지된 계정의 기존 로그인 세션 강제 종료
- 게시글/댓글 수정, 사용자 계정 완전 삭제

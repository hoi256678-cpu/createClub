# 회원가입/로그인 (Slice 1) — 설계 문서 (승인됨)

> 상태: **승인 완료**. `writing-plans` 스킬로 넘어가 구현 계획 작성 예정.

## 배경

`2026-07-31-counselor-matching-design.md`에서 상담사-내담자 매칭 앱의 구현 순서로 **C안(기능 단위 수직 슬라이스)**이 승인됨. 이 문서는 그 첫 번째 슬라이스인 **회원가입/로그인**을 다룬다.

배포 파이프라인(`2026-08-01-deployment-pipeline-design.md`)은 이미 완료되어 `main`에 머지됨:
- 프론트(Vercel): `create-club-5kro.vercel.app`
- 백엔드(Railway): `createclub-production.up.railway.app`, 저장소 내 `/server` (Express + Mongoose, 순수 JS)
- DB: MongoDB Atlas M0 (`somit` 데이터베이스)

이번 슬라이스는 이 배포 위에 실제 회원가입/로그인 기능을 얹는다. 완료되면 기능 단위로 계속 push하며 자동 배포된다.

## 이번 슬라이스에서 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 회원가입 필드 (상담사/내담자 공통) | 이름, 이메일, 비밀번호만. 역할 선택은 가입 화면 내 탭으로 (별도 URL 분리 안 함) |
| 상담사 전용 필드(전공/학년/상담분야/자기소개) | 이번 슬라이스에서 입력 안 받음. 스키마에는 optional로 미리 만들어두고, 나중에 프로필 수정 기능에서 채움 |
| 내담자 전용 필드(연령대/고민 카테고리) | 위와 동일 — 나중에 |
| 이메일 인증 | 없음. 가입 즉시 사용 가능 |
| 비밀번호 정책 | 최소 4자 (그 외 제약 없음) — 학교 과제 스코프, 무거운 보안 절차 불필요 |
| 인증 방식 | JWT를 httpOnly + Secure + SameSite=None 쿠키로 전달 (프론트 Vercel ↔ 백엔드 Railway가 서로 다른 도메인이라 필요) |
| 로그인 실패 메시지 | 이메일 없음/비밀번호 틀림 구분 없이 동일한 401 메시지 (이메일 존재 여부 노출 방지) |
| 로그인 후 이동 | 별도 대시보드 없음 — 홈페이지가 로그인 상태를 반영 (Slice 2에서 상담사 리스트 페이지 생기면 그쪽으로 변경) |
| 테스트 전략 | node:test + supertest로 최소 라우트 테스트 (signup/login/me/logout) |

## 아키텍처

```
[app/signup, app/login, app/components/AuthStatus.tsx]
        |  fetch(credentials:'include')
        v
[server/routes/auth.js] --requireAuth--> [server/middleware/auth.js]
        |
        v
[server/models/User.js] --Mongoose--> [MongoDB Atlas]
```

- 백엔드: `server/models/User.js`(스키마), `server/middleware/auth.js`(쿠키의 JWT 검증), `server/routes/auth.js`(signup/login/logout/me)
- 비밀번호 해싱: `bcryptjs`(순수 JS, 네이티브 바인딩 없음 — 배포 환경 상관없이 동작)
- 프론트: `app/signup/page.tsx`, `app/login/page.tsx`, `app/components/AuthStatus.tsx`(기존 `SystemStatus`와 같은 패턴)

## 컴포넌트

### 백엔드
- **`server/models/User.js`**
  ```js
  {
    name: String (required),
    email: String (required, unique, lowercase),
    passwordHash: String (required),
    role: String (enum: 'counselor' | 'client', required),
    counselorProfile: { major, year, specialties: [String], bio } (전부 optional, 이번 슬라이스 미사용),
    clientProfile: { ageGroup, concerns: [String] } (전부 optional, 이번 슬라이스 미사용),
    createdAt: Date (default now)
  }
  ```
- **`server/middleware/auth.js`**: `requireAuth(req, res, next)` — 쿠키의 JWT를 검증해 `req.user = { id, role }` 채움. 실패 시 401. 이후 매칭 라우트에서도 재사용
- **`server/routes/auth.js`**:
  - `POST /api/auth/signup` — `{name, email, password, role}` → 이메일 중복 체크(409) → 비밀번호 길이 체크(400) → bcrypt 해싱 → 저장 → JWT 쿠키 발급 → `{name, role}` 반환
  - `POST /api/auth/login` — `{email, password}` → bcrypt 비교 → 성공 시 JWT 쿠키 발급 + `{name, role}` 반환, 실패 시 401(통일 메시지)
  - `POST /api/auth/logout` — 쿠키 즉시 만료
  - `GET /api/auth/me` — `requireAuth` 통과 시 `{name, role}` 반환, 아니면 401
- **`server/index.js`**: `cookie-parser` 미들웨어 추가, CORS를 `credentials: true`로 변경(기존 `cors({origin: FRONTEND_URL})`에 `credentials:true` 추가), `app.use('/api/auth', authRouter)`

### 프론트
- **`app/signup/page.tsx`**: 역할 선택 탭(상담사/내담자) + 이름/이메일/비밀번호 폼. 제출 시 `POST /api/auth/signup`, 성공하면 홈으로 이동
- **`app/login/page.tsx`**: 이메일/비밀번호 폼. 제출 시 `POST /api/auth/login`, 성공하면 홈으로 이동
- **`app/components/AuthStatus.tsx`**: 마운트 시 `GET /api/auth/me` 호출. 로그인 상태면 "OO님 환영합니다" + 로그아웃 버튼, 아니면 로그인/가입 링크. 기존 `app/page.tsx`의 `SystemStatus` 배지 아래에 삽입
- **`lib/api.ts`**: 공통 fetch 래퍼 — `NEXT_PUBLIC_API_URL` 접두사 + `credentials: 'include'` 기본 포함

## 데이터 흐름

1. **회원가입**: 폼 제출 → `POST /api/auth/signup` → 이메일 중복 확인 → bcrypt 해싱 → `User` 저장 → JWT 쿠키 발급 → 프론트 로그인 상태 전환, 홈 이동
2. **로그인**: `POST /api/auth/login` → bcrypt 비교 → JWT 쿠키 발급 → 홈 이동
3. **로그인 상태 확인**: 홈 로드 시 `AuthStatus`가 `GET /api/auth/me` 호출 → 쿠키 유효하면 `{name, role}`, 아니면 401
4. **로그아웃**: `POST /api/auth/logout` → 쿠키 만료 → 홈 새로고침

## 에러 처리

- 이메일 중복 가입 → 409 "이미 가입된 이메일입니다"
- 로그인 실패(이메일 없음/비밀번호 틀림) → 401 "이메일 또는 비밀번호가 올바르지 않습니다" (통일된 메시지)
- 비밀번호 4자 미만/필수 필드 누락 → 400, 필드별 메시지
- 프론트: 제출 중 버튼 비활성화 + 로딩 표시, 실패 시 폼 위 에러 메시지. 백엔드 자체가 다운된 경우는 기존 `SystemStatus` 패턴처럼 조용히 실패 표시

## 테스트 전략

`node:test`(Node 내장) + `supertest`로 `server/routes/auth.js`의 4개 라우트에 대한 최소 라우트 테스트를 작성한다:
- 회원가입 성공 → 201, 쿠키 설정 확인
- 중복 이메일 회원가입 → 409
- 짧은 비밀번호 회원가입 → 400
- 로그인 성공/실패(401, 통일 메시지)
- `/me` — 로그인 상태/비로그인 상태 각각
- 로그아웃 → 이후 `/me`가 401

테스트용 DB는 실제 Atlas에 테스트 데이터를 남기지 않도록, 테스트 실행 시에만 별도 컬렉션이나 로컬 in-memory MongoDB(`mongodb-memory-server`)를 쓸지, 아니면 Atlas의 별도 테스트 DB를 쓸지는 구현 계획 단계에서 정한다.

## 범위 밖 (Out of scope)

- 상담사 리스트/프로필 조회 (Slice 2)
- 매칭 신청/수락/거절 (Slice 3)
- 상담사/내담자 프로필 상세 필드(전공/학년/연령대 등) 입력 — 이번엔 스키마만 준비, 실제 입력 폼은 이후 프로필 수정 기능에서
- 이메일 인증, 비밀번호 재설정, 소셜 로그인

## 다음 세션에서 할 일

1. 이 스펙을 바탕으로 `writing-plans` 스킬로 구현 계획 작성
2. 계획 승인 후 구현 → 로컬 검증 → 배포(main push, 기존 파이프라인이 자동 배포)
3. Slice 1 완료 후 `2026-07-31-counselor-matching-design.md`로 돌아가 Slice 2(상담사 리스트/프로필 조회) 설계 시작

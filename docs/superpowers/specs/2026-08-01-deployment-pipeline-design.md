# 배포 파이프라인 구축 — 설계 문서 (승인됨)

> 상태: **승인 완료**. `writing-plans` 스킬로 넘어가 구현 계획 작성 예정.

## 배경

과제 제출 산출물 요구사항 (원문 그대로):
1. 프론트엔드 → Vercel
2. 백엔드 → Railway (또는 사용 중인 다른 서비스)
3. DB → 외부 DB, MongoDB Atlas Free Tier 추천 (또는 사용 중인 다른 서비스)

현재 프로젝트(`create-club`, 코드네임 "솜잇")는 Next.js 16 canary / React 19 / Tailwind v4 기반 Hello World 스캐폴드 상태이며, 상담사-내담자 매칭 기능(회원가입/로그인, 리스트, 신청-수락)은 아직 하나도 구현되지 않았다. 실제 매칭 기능 설계는 `docs/superpowers/specs/2026-07-31-counselor-matching-design.md`에 별도 draft로 진행 중이며 아직 사용자 승인 전이다.

이 문서는 매칭 기능과 별개로, **배포 파이프라인 자체를 먼저 구축**하는 것을 다룬다. 배포 인프라를 먼저 세워두고, 이후 세션에서 기능을 하나씩 추가할 때마다 git push만으로 자동 재배포되게 하는 것이 목표다.

## 참고자료

`C:\Users\hoi25\Desktop\CreateClub\create-club참고자료\`에 SOMIT 브랜딩/화면 목업(HTML, 채팅·커뮤니티·심리검사 등 포함)과 사업계획서(.hwp)가 있음. 이번 배포 스켈레톤 범위에는 포함하지 않지만, 추후 UI/기능 설계 단계에서 참고할 것.

## 결정된 사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 배포 시점 | 기능 구현 전, 스켈레톤 상태로 지금 바로 배포 | 3가지 산출물(URL)을 먼저 확보하고, 이후 기능을 하나씩 추가하며 계속 배포(CD) |
| 백엔드 코드 위치 | 같은 저장소(`hoi256678-cpu/createClub`) 안의 `/server` 하위 폴더 | 저장소 1개로 관리, Railway는 Root Directory 지정 배포 지원 |
| 배포 방식 | GitHub 연동 자동배포 (Vercel + Railway 모두 저장소에 연결, `main` push 시 자동 재배포) | 매 세션마다 수동 배포 명령 반복 안 해도 됨 |
| 백엔드 언어 | 순수 JavaScript (TypeScript 빌드 단계 없음) | 첫 배포의 실패 지점을 줄이기 위함. 프론트는 기존대로 TypeScript 유지 |
| 계정 상태 | Vercel 계정 있음 / Railway·MongoDB Atlas 계정 없음 (새로 가입 필요) | 가입 자체는 브라우저 작업이라 사용자가 직접 진행, 필요 시 claude-in-chrome으로 동행 가능 |
| DB 접근 | 프론트엔드는 DB에 직접 접근하지 않고 반드시 백엔드를 거침 | 프론트→백엔드→Atlas 3단 구조 |

## 아키텍처

```
[Vercel]                     [Railway]                  [MongoDB Atlas]
Next.js (repo root)  --fetch-->  Express (/server)  --mongoose-->  M0 Free Cluster
  NEXT_PUBLIC_API_URL              MONGODB_URI, FRONTEND_URL
```

- **루트**: 기존 Next.js 프론트엔드 (경로 변경 없음) — Vercel이 리포 루트 기준으로 빌드/배포
- **`/server`**: 신규 Express + Mongoose 백엔드 (독립 `package.json`) — Railway가 Root Directory를 `/server`로 지정해 배포
- **MongoDB Atlas**: 독립 클러스터, 백엔드에서만 접근

세 산출물이 실제로 서로 연결되어 동작함을 백엔드 헬스체크로 증명한다.

## 컴포넌트

### 프론트엔드 (`app/page.tsx`)
- "시스템 상태" 섹션 추가: 클라이언트에서 `${NEXT_PUBLIC_API_URL}/api/health` 호출, 로딩 → 정상/오류 상태 렌더링
- 환경변수: `NEXT_PUBLIC_API_URL` (Vercel 프로젝트 설정에 등록, `.env.local`은 로컬 개발용으로만 사용)

### 백엔드 (`/server`)
- `server/index.js`: Express 앱 진입점
  - CORS 미들웨어: `FRONTEND_URL` 환경변수로 지정된 origin만 허용
  - 시작 시 `mongoose.connect(MONGODB_URI)` (연결 실패해도 서버 프로세스는 죽지 않음)
  - `GET /api/health` — `{ status: 'ok', mongoConnected: boolean, timestamp }` 응답
- `server/package.json`: express, mongoose, cors, dotenv 의존성. `start` 스크립트로 `node index.js`
- `server/.env.example`: `MONGODB_URI`, `FRONTEND_URL`, `PORT` 나열 (실제 값은 커밋 안 함)
- Railway 설정: Root Directory `/server`, Start Command `npm start` (또는 자동 감지)

## 데이터 흐름

1. 브라우저가 Vercel의 Next.js 페이지 로드
2. 페이지가 `${NEXT_PUBLIC_API_URL}/api/health` 호출
3. Express가 `mongoose.connection.readyState`로 DB 연결 상태 확인 후 JSON 응답
4. 프론트가 응답을 받아 로딩 → 정상/오류 상태로 렌더링

## 에러 처리

- 백엔드: `mongoose.connect` 실패를 try/catch로 감싸 로그만 남기고 서버는 계속 기동 — health 응답의 `mongoConnected: false`로 상태를 알림
- 프론트: fetch를 try/catch로 감싸 실패 시 "백엔드 연결 실패" 메시지 표시 (throw 안 함)
- 가장 흔한 첫 배포 실패 지점은 CORS — `FRONTEND_URL`(백엔드 쪽)과 `NEXT_PUBLIC_API_URL`(프론트 쪽) 값이 실제 배포 도메인과 정확히 일치해야 함

## 테스트 전략

로직 없는 배관(plumbing) 단계이므로 자동화 테스트는 만들지 않는다 (YAGNI). 배포된 `/api/health` URL을 직접 호출하고 프론트 상태 카드를 눈으로 확인하는 수동 검증으로 충분하다. 다음 세션에서 회원가입/로그인 등 실제 로직이 들어갈 때부터 테스트를 추가한다.

## 범위 밖 (Out of scope)

- 상담사-내담자 매칭 기능 자체 (별도 스펙 `2026-07-31-counselor-matching-design.md`에서 다룸, 아직 미승인)
- SOMIT 브랜딩/UI 적용 (참고자료 폴더의 목업 반영은 추후 기능 설계 단계에서)
- 인증/세션(JWT) — 이번 스켈레톤에는 없음, 매칭 기능 설계에서 다룰 예정

## 다음 세션에서 할 일

1. 이 스펙을 바탕으로 `writing-plans` 스킬로 구현 계획 작성
2. 계획 승인 후: `/server` 폴더 생성, Railway/MongoDB Atlas 계정 가입(사용자 직접 또는 claude-in-chrome 동행), 각 서비스 GitHub 연동 설정, 환경변수 등록, 배포 확인
3. 3개 산출물(Vercel URL, Railway URL, Atlas 연결 확인 스크린샷 또는 health 응답)을 과제 제출용으로 기록
4. 이후 `2026-07-31-counselor-matching-design.md`의 A/B/C 방안 승인을 받아 매칭 기능 구현 재개

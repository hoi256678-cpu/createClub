# 상담사 배정/채팅 시스템 (1단계) 설계

> 배경: 사용자가 전달한 8개 요청 중 5,6,7,8번(또래상담사 배정, 단일 상담 제한, 채팅 상호작용)을 다루는 문서. 브레인스토밍 과정에서 범위가 커져 "상담사 목록 실제 계정화 + 실제 평점 + 실사용 채팅"까지 포함하게 되었고, 그중 **상담사가 직접 로그인해서 실시간으로 답장하는 UI(대시보드/채팅함)는 2단계로 분리**했다. 이 문서는 1단계(클라이언트 쪽 전체 플로우 + 백엔드)만 다룬다.

## 범위

1단계에서 하는 것:
- 상담사 목록을 mock(`counselors/mock.ts`)에서 실제 `User`(role: "counselor") 기반으로 전환
- 상담 신청 → 배정 + 채팅방 생성 (실제 DB)
- 상담이 이미 배정되어 있으면 상담사 상세 페이지의 CTA가 "채팅 상담으로 이동"으로 바뀜 (신규 신청 차단)
- 클라이언트가 보낸 메시지를 실제로 저장
- "상담 종료하기" — 별점(선택) 남기고 배정 해제
- "신고하기" — 사유 제출 + 자동 종료

1단계에서 하지 않는 것 (2단계로 분리):
- 상담사가 자기 계정으로 로그인해서 채팅방을 보고 답장하는 화면. 1단계 종료 시점엔 채팅방에 클라이언트의 메시지만 쌓이고 상담사 쪽 응답은 없다.
- 후기(텍스트) 작성 기능 — 평점 숫자만 남긴다.
- 실시간 메시지 전달(WebSocket/polling) — 2단계에서 상담사가 실제로 붙기 전까지는 필요 없다.

## 데이터 모델

### `User.counselorProfile` 확장 (`server/models/User.js`)

기존 필드(`major`, `year`, `specialties`, `bio`)는 유지하고 아래를 추가한다:

```js
counselorProfile: {
  major: String, year: String, specialties: [String], bio: String,
  avatarBg: String,
  avatarColor: String,
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  sessionCount: { type: Number, default: 0 },
  recentSessions: { type: Number, default: 0 },
  online: { type: Boolean, default: false },
},
```

`specialties`를 기존 mock의 `tags`(`CounselorTag`) 용도로 그대로 쓴다. `bio`를 기존 mock의 `intro` 용도로 그대로 쓴다. 후기(`reviews`) 필드는 만들지 않는다.

### `ChatRoom` (신규, `server/models/ChatRoom.js`)

`Post.comments`가 embedded subdocument인 것과 같은 패턴으로 메시지를 embed한다. 배정 상태를 별도 모델로 분리하지 않고 `ChatRoom.status`가 배정 여부를 겸한다 — 방이 `active`면 배정된 것이고, `ended`/`reported`면 해제된 것이다.

```js
const messageSchema = new mongoose.Schema(
  { from: { type: String, enum: ["client"], required: true }, text: { type: String, required: true, maxlength: 1000 } },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const chatRoomSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "ended", "reported"], default: "active" },
    messages: [messageSchema],
    rating: { type: Number, min: 1, max: 5, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

`from`을 지금은 `"client"`만 허용한다 — 2단계에서 상담사가 답장하게 되면 `"counselor"`를 추가한다.

### `Report` (신규, `server/models/Report.js`)

```js
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

## API (`server/routes/counseling.js`)

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/api/counselors` | `optionalAuth` | 상담사 목록. `role:"counselor"`인 User를 조회해 `{id, name, major, bio, avatarBg, avatarColor, tags, rating, ratingCount, sessionCount, recentSessions, online}` 형태로 반환. 로그인 없이도 조회 가능(기존 mock 동작과 동일) |
| GET | `/api/counselors/:id` | `optionalAuth` | 상담사 상세. 로그인 없이도 조회 가능 |
| POST | `/api/counseling/rooms` | `requireAuth` | `{ counselorId }`. 요청자가 이미 `status:"active"` 방을 갖고 있으면 409. 없으면 방 생성 + 해당 상담사 `sessionCount`, `recentSessions` 각 +1 |
| GET | `/api/counseling/rooms` | `requireAuth` | 내(요청자) 채팅방 목록 |
| GET | `/api/counseling/rooms/:id` | `requireAuth` | 방 상세 + 메시지. 본인 방이 아니면 403 |
| POST | `/api/counseling/rooms/:id/messages` | `requireAuth` | `{ text }`. 본인 방이 아니면 403, `status`가 `active`가 아니면 400 |
| POST | `/api/counseling/rooms/:id/end` | `requireAuth` | `{ rating?: 1~5 }`. `status:"ended"`, `endedAt` 기록. `rating`이 있으면 상담사 `rating`을 running average로 갱신하고 `ratingCount` +1 |
| POST | `/api/counseling/rooms/:id/report` | `requireAuth` | `{ reason }`. `Report` 생성 + 방 `status:"reported"`(평점 갱신 없이 바로 종료) |

**에러 규칙:** 이미 활성 방이 있는데 신규 신청 → 409 / 남의 방에 접근·메시지·종료·신고 → 403 / rating이 1~5 범위 밖 → 400 / reason이 빈 문자열 → 400 / 존재하지 않는 상담사·방 id → 404

## 프론트엔드 변경

- `app/(shell)/counselors/page.tsx`, `[id]/page.tsx`: `COUNSELORS` mock 배열 대신 `GET /api/counselors`(목록)/`GET /api/counselors/:id`(상세) 호출로 전환. `lib/matching.ts`의 `matchScore`/`isEligible`/`isNewCounselor`/`reserveSlotForNewcomer`는 로직 변경 없이 API 응답 배열에 그대로 적용
- `counselors/[id]/page.tsx`의 CTA 버튼: 로그인한 클라이언트가 활성 방이 없으면 기존처럼 "상담 신청하기"(→ 방 생성 → `/chat/:roomId`로 이동). **활성 방이 있으면** "채팅 상담으로 이동" 버튼으로 교체(→ 그 활성 방으로 이동). 이게 6·7번 요구사항. 활성 방 여부는 상세 페이지 진입 시 `GET /api/counseling/rooms`를 호출해 `status==="active"`인 항목이 있는지로 판단
- `app/(shell)/chat/mock.ts` 삭제
- `app/hooks/useChatRooms.tsx`: `CHAT_ROOMS` mock + `somit:chat:read`/`somit:chat:sent` localStorage 로직을 걷어내고 API 호출(`GET/POST /api/counseling/rooms*`) 기반으로 재작성. 읽음상태(`markRoomRead`, `unread`)는 1단계에선 상담사 응답이 없어 의미가 없으므로 제거하고, 2단계에서 상담사 답장이 생길 때 다시 추가한다
- `app/(shell)/chat/[id]/page.tsx`: 헤더에 "⋯" 메뉴를 추가해 "상담 종료하기"(별점 1~5 모달, 건너뛰기 가능 → `POST .../end`)와 "신고하기"(사유 입력 모달 → `POST .../report`, 성공 시 채팅 목록으로 이동) 액션 추가

## 마이그레이션

기존 `counselors/mock.ts`의 5명(c1~c5)을 1회성 스크립트 `server/scripts/seed-counselors.js`로 실제 `User` 문서로 옮긴다. 이메일은 `counselor{n}@example.com` 형태로 더미 생성, 비밀번호는 임의 문자열을 bcrypt 해시. 이메일 기준으로 upsert하므로 스크립트를 다시 실행해도 중복 생성되지 않는다. 기존 문자열 id(`c1` 등)는 버리고 새 `ObjectId`를 쓴다 — 프론트/백엔드 어디에도 `c1` 같은 id를 하드코딩해서 참조하는 곳이 없으므로 문제 없다.

## 테스트

`server/`는 `node --test`로 실행하는 기존 스타일 유지 — `server/tests/counseling-routes.test.js`에 위 API 엔드포인트별 성공/에러 케이스(특히 409 중복 배정, 403 남의 방 접근)를 추가한다. 프론트는 이 프로젝트 전체가 테스트 러너가 없으므로 A그룹 때와 동일하게 `tsc`/`eslint`/`build` + 브라우저 수동 확인으로 검증한다.

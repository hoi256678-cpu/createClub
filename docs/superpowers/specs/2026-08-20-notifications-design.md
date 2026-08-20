# 알림 시스템(신고 처리 알림) 설계

## 배경

지금 `app/(shell)/notifications/**`와 알림 벨(`TopBar`/`NotificationPanel`)은 전부 프론트엔드 mock으로만 동작한다. 화면에 보이는 알림은 (1) `notifications/mock.ts`의 하드코딩된 가짜 시나리오 3개(매칭완료/심리검사결과/환영)와 (2) `ChatRoom` 안읽음 상태에서 실시간으로 파생되는 채팅 알림뿐이다. 읽음/삭제 상태는 `localStorage`에 저장된다. 서버(`server/`)에는 Notification 개념이 전혀 없다.

관리자가 상담 신고를 처리(`POST /api/admin/reports/:id/review`)해도 신고한 사람에게는 아무 알림이 가지 않는다. 이 문서는 서버에 실제 Notification 서브시스템을 만들고, 신고 처리 완료를 그 첫 이벤트로 연결하는 설계를 다룬다.

## 범위

**포함**
- 범용 Notification 백엔드(모델 + API) — `type` 필드로 나중에 다른 이벤트도 쉽게 추가할 수 있는 구조
- 신고 처리(`POST /api/admin/reports/:id/review`) 완료 시 신고자에게 Notification 생성
- 알림 목록 조회 / 읽음 처리(개별·전체) / 삭제 API
- 프론트 `useNotifications` 훅을 mock 기반에서 실데이터(폴링) 기반으로 교체

**제외 (이번 범위 아님)**
- `report_reviewed` 외의 다른 알림 타입 실제 발급(매칭 완료 등) — 모델/API는 범용으로 만들지만 이번에 발급하는 이벤트는 신고 처리 하나뿐
- 실시간 푸시(웹소켓/SSE) — 기존 채팅과 동일하게 폴링 방식 사용
- 브라우저 푸시 알림(OS 알림)

## 확정된 결정 사항

- 기존 가짜 시나리오 알림 3개(매칭완료/심리검사결과/환영)와 `notifications/mock.ts`는 삭제한다. 가짜 데이터라 실제 알림 시스템과 혼재시키지 않는다.
- 채팅 안읽음에서 파생되는 알림(`chat:${roomId}` 항목)은 지금 방식 그대로 유지한다 — 별도 DB 컬렉션으로 옮기지 않고, 프론트에서 실제 Notification 목록과 합쳐서 보여준다.
- 알림 조회/수신은 `useChatRooms`와 동일한 패턴(`usePolling`, 5초 간격, 로그인 상태에서만 폴링)을 그대로 재사용한다.
- 읽음/삭제 상태는 이제 서버(DB)가 정답이다. 기존 `localStorage` 기반 읽음/삭제 상태(`somit:notifications:read`, `somit:notifications:deleted`)는 제거한다.
- 알림은 받는 사람 본인만 조회/조작할 수 있다 — 다른 사용자의 알림 id로 읽음/삭제 요청하면 404.

## 데이터 모델

`server/models/Notification.js`를 신규 추가한다. `Report.js`와 같은 패턴(타임스탬프는 `createdAt`만).

```js
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, enum: ["report_reviewed"] },
    icon: { type: String, required: true },
    title: { type: String, required: true },
    desc: { type: String, required: true },
    href: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

## 백엔드

### 신규 라우트: `server/routes/notifications.js` → `index.js`에 `/api/notifications`로 마운트

모든 라우트는 `requireAuth`. 본인 소유가 아닌 알림에 대한 읽음/삭제 요청은 404로 응답한다(존재 자체를 숨김).

| Method | Path | 설명 |
|---|---|---|
| GET | `/` | 본인 알림 목록, 최신순, 최근 50개 |
| POST | `/:id/read` | 읽음 처리. 응답: `{ read: true }` |
| POST | `/read-all` | 본인의 안읽은 알림 전체를 읽음 처리 |
| DELETE | `/:id` | 알림 삭제 |

응답 형태 예시 (목록 항목) — 프론트 `NotificationItem` 타입과 1:1 대응:
```json
{
  "id": "66af...",
  "icon": "📮",
  "title": "신고가 처리됐어요",
  "desc": "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
  "href": null,
  "unread": true,
  "time": "2026-08-20T04:38:30.000Z"
}
```
상대 시간 변환은 커뮤니티/채팅과 동일하게 프론트에서 처리하므로, 서버는 `createdAt`을 `time` 필드로 그대로 내려주고 `read`는 반전해서 `unread`로 내려준다(기존 `NotificationItem.unread` 필드명 유지).

### 신고 처리 트리거

`server/routes/admin.js`의 `POST /reports/:id/review`에서 `report.status = "reviewed"`를 저장한 직후, `report.reporter`에게 Notification을 하나 생성한다:

```js
await Notification.create({
  user: report.reporter,
  type: "report_reviewed",
  icon: "📮",
  title: "신고가 처리됐어요",
  desc: "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
});
```
알림 생성 실패로 신고 처리 자체가 실패하면 안 되므로, 알림 생성은 신고 상태 저장(`report.save()`)이 성공한 뒤에 별도로 시도하고, 알림 생성 중 오류가 나도 신고 처리 응답은 정상(200)으로 내려준다(에러는 로그만 남김).

## 프론트엔드

`app/hooks/useNotifications.tsx`를 다음과 같이 교체한다:

- `notifications/mock.ts` import 및 `NOTIFICATIONS` 배열, `isCounselor` 분기 제거. `NotificationItem` 타입은 이 훅 파일로 옮기고 `mock.ts`는 삭제한다.
- `useChatRooms`와 동일한 구조로 `/api/notifications`를 폴링(`usePolling`, 5000ms, 로그인 상태에서만)해서 `items` state로 유지. 로그아웃 시 즉시 비운다. 서버가 내려주는 `time`(raw ISO)은 채팅 알림과 동일하게 `formatRelativeTime`을 프론트에서 적용해 `NotificationItem.time`으로 변환한다(서버가 미리 포맷하지 않음).
- `markRead(id)`: `id`가 `chat:` 접두사면 기존처럼 `markRoomRead` 호출. 아니면 `POST /api/notifications/:id/read` 호출 + 로컬 state 낙관적 갱신.
- `markAllRead()`: 안읽은 채팅방들 `markRoomRead` 처리 + `POST /api/notifications/read-all` 호출 + 로컬 state 낙관적 갱신.
- `deleteNotification(id)`: `chat:` 접두사면 기존처럼 읽음 처리로 대체. 아니면 `DELETE /api/notifications/:id` 호출 + 로컬 state에서 제거.
- 최종 `items`는 기존과 동일하게 `[...chatItems, ...serverNotifications]` 순서로 합친다(정렬 기준 변경 없음).
- `NotificationPanel`, `notifications/page.tsx`, `TopBar`의 뱃지 카운트는 훅의 반환값만 바라보는 구조라 코드 변경이 필요 없다.

## 에러 처리

- 목록 조회 폴링 실패: `useChatRooms`와 동일하게 최초 로드 실패는 빈 목록, 폴링 중 실패는 기존 목록 유지.
- 읽음/삭제 API 실패: 조용히 실패 처리(다음 폴링에서 실제 서버 상태로 다시 맞춰짐) — 이 앱의 다른 낙관적 업데이트(좋아요 등)와 동일한 수준의 처리.
- 본인 소유가 아닌 알림 id로 요청: 404.

## 테스트

`server/tests/notification-routes.test.js`를 `community-routes.test.js`와 동일한 패턴(`mongodb-memory-server` + `supertest`)으로 작성한다. 최소 커버리지:
- 비로그인 조회/읽음/삭제 → 401
- 본인 알림만 조회됨(다른 사용자 알림은 안 보임)
- 개별 읽음 처리 → `read`가 true로 바뀜
- 전체 읽음 처리 → 안읽은 알림이 모두 읽음으로 바뀜
- 삭제 → 목록에서 사라짐
- 다른 사용자의 알림 id로 읽음/삭제 시도 → 404
- 관리자가 신고를 처리(`POST /api/admin/reports/:id/review`)하면 신고자에게 `type: "report_reviewed"` Notification이 생성됨

프론트는 이 코드베이스 관례대로(백엔드만 테스트, 프론트는 타입체크/린트/빌드 + 라이브 배포 후 수동 확인)로 검증한다.

## 미해결/추후 과제 (이번 범위 아님)

- 신고 처리 외 다른 이벤트(상담 매칭 완료, 심리검사 결과 등)의 실제 Notification 발급
- 실시간 푸시(웹소켓/SSE), 브라우저 OS 푸시 알림
- 알림 보관 기간/정리(오래된 읽은 알림 자동 삭제 등)

# 상담사 로그인/답장 화면 (2단계) 설계

> 배경: [1단계 설계 문서](./2026-08-18-counseling-assignment-design.md)에서 "상담사가 직접 로그인해서 채팅방을 보고 답장하는 화면"을 2단계로 분리해뒀다. 1단계 종료 시점엔 채팅방에 클라이언트의 메시지만 쌓이고 상담사 쪽 응답이 없었다. 이 문서는 그 2단계(상담사 답장 + 가벼운 폴링 + 읽음/알림 연동)를 다룬다.

## 범위

2단계에서 하는 것:
- 상담사가 로그인 후 자신에게 배정된 채팅방 목록(진행중/전체)을 보고, 방에 들어가 답장
- 클라이언트·상담사 양쪽 다 "상담 종료하기" 가능 (상담사가 종료하면 평점 없이 종료만)
- 가벼운 폴링(5초 간격, 탭이 백그라운드면 정지)으로 새로고침 없이 상대 메시지가 보임
- 안읽은 메시지 배지(채팅 메뉴)와 마이페이지 > 알림 탭 연동

2단계에서 하지 않는 것 (범위 밖):
- 대시보드/통계 요약 화면 — 평점·세션수는 이미 client측 상담사 상세 페이지에서 보여주고 있음, 상담사 전용 요약 화면은 만들지 않음
- 텍스트 후기 작성 — 여전히 별점 숫자만
- 웹소켓 등 진짜 실시간 push — 폴링으로 충분한 규모(무료 티어)라 판단
- 상담사가 신고하기(신고는 계속 client 전용)
- 진짜 서버 알림 백엔드 — 마이페이지 알림 탭은 여전히 정적 mock(`app/(shell)/notifications/mock.ts`) 기반이며, 채팅 알림은 서버에 저장되지 않고 매번 `ChatRoom` 폴링 데이터로부터 그때그때 합성한 항목일 뿐

## 데이터 모델

### `ChatRoom.messages.from` (`server/models/ChatRoom.js`)

`enum: ["client"]` → `enum: ["client", "counselor"]`로 확장. 나머지 필드는 1단계와 동일.

## API (`server/routes/counseling.js`)

| Method | Path | 변경 내용 |
|---|---|---|
| GET | `/api/counseling/rooms` | 뷰어 role에 따라 필터 기준 전환: `role==="client"`면 `client===me`, `role==="counselor"`면 `counselor===me`. `?status=active` 쿼리로 진행중만 필터(생략 시 전체, 종료/신고 포함). 응답 항목에 `lastMessageAt`(마지막 메시지 시각, 없으면 방 생성 시각), `lastMessageFrom`(`"client"` \| `"counselor"` \| `null`) 필드 추가 — 프론트가 방을 열지 않고도 안읽음 여부를 계산하기 위함 |
| GET | `/api/counseling/rooms/:id` | 403 체크를 `client===me`에서 `(client===me \|\| counselor===me)`로 확장 |
| POST | `/api/counseling/rooms/:id/messages` | 403 체크 동일 확장. `from`은 하드코딩 대신 요청자가 room의 `client`인지 `counselor`인지로 자동 결정. `status!=="active"`면 여전히 400 |
| POST | `/api/counseling/rooms/:id/end` | **양쪽 다 호출 가능하도록 확장.** 요청자가 `client===me`면 기존과 동일(`rating` 1~5 선택 가능, 있으면 상담사 rating running average 갱신). 요청자가 `counselor===me`면 `rating`은 무시(있어도 반영 안 함) — `status:"ended"`, `endedAt`만 기록. 둘 다 아니면 403. 이미 `active`가 아니면 400 |
| POST | `/api/counseling/rooms/:id/report` | 변경 없음 — 계속 client 전용 |

에러 규칙은 1단계와 동일하게 유지 (403/400/404), 위 표에 명시한 확장만 추가된다.

## 프론트엔드 변경

### Provider 순서 (`app/layout.tsx`)

알림 쪽이 채팅 데이터를 구독해야 하므로 `AuthProvider > NotificationsProvider > ChatRoomsProvider` → `AuthProvider > ChatRoomsProvider > NotificationsProvider`로 순서 변경.

### `useChatRooms` (`app/hooks/useChatRooms.tsx`)

- 방 목록 조회를 5초 간격 `setInterval`로 재조회. `document.visibilityState !== "visible"`이면 폴링 정지, 다시 보이면 즉시 1회 조회 후 재개
- 읽음상태를 localStorage(`somit:chat:read`, 방 id → 마지막으로 읽은 시각 ISO 문자열)로 재도입. `unreadCount`(방별 `lastMessageFrom`이 "내가 아닌 쪽"이고 `lastMessageAt`이 저장된 읽은시각보다 최신인 방의 개수)와 `markRoomRead(id)`를 새로 노출
- `ChatRoom` 타입에 `lastMessageAt`, `lastMessageFrom` 추가

### `app/(shell)/chat/page.tsx` (목록)

- 진행중/전체 탭 UI 추가 (`?status=active` 쿼리로 API 재호출)
- role 무관하게 같은 컴포넌트 — 상담사는 여러 클라이언트의 방이 나열됨

### `app/(shell)/chat/[id]/page.tsx` (상세)

- 진입 시 `markRoomRead(id)` 호출
- 열려있는 동안 해당 방만 5초 간격으로 재조회(같은 visibility 정지 규칙)해서 새 메시지 반영 + 자동 스크롤
- 입력창은 role 무관 공통. "⋯" 메뉴: `role==="client"`면 종료하기+신고하기, `role==="counselor"`면 종료하기만
- 메시지 말풍선의 좌/우 배치는 "내가 보낸 메시지인지"(`from === 내 role`) 기준으로 뒤집힘

### 알림 연동 (`app/hooks/useNotifications.tsx`)

- `useChatRooms()`를 구독해서 안읽은 방들을 `{ id: "chat:<roomId>", title: "OO 상담사님이 답장했어요" (또는 클라이언트 이름), unread: true, href: "/chat/<roomId>", ... }` 형태의 합성 항목으로 만들어 기존 mock `NOTIFICATIONS` 항목들과 합쳐서 `items`에 노출 (서버 저장 없음, 매 렌더 계산)
- `NotificationItem.id` 타입을 `number` → `string | number`로 확장
- `markRead(id)`가 `id`가 `"chat:"`로 시작하면 숫자 배열에 추가하는 대신 `markRoomRead(roomId)`를 호출하도록 분기 (채팅 배지·알림탭·방 안 읽음상태가 하나의 소스로 일관됨)

### Sidebar / BottomNav

- 채팅 메뉴 항목에 `useChatRooms().unreadCount` 배지 추가
- `role==="counselor"`일 때 client 전용 메뉴(심리검사, 상담사 목록/신청)를 숨김. 커뮤니티/채팅함/마이페이지/설정은 공통 유지

## 마이그레이션

스키마 변경은 `messages.from`의 enum 값 추가뿐이라 기존 문서에 영향 없음 (기존 문서는 전부 `"client"` 메시지만 가지고 있어 그대로 유효). 별도 마이그레이션 스크립트 불필요.

## 에러 처리 / 엣지 케이스

- 권한 체크는 항상 room의 `client`/`counselor` 필드와 요청자 ID 매칭으로 하며 `req.user.role` 클레임을 신뢰하지 않는다 (1단계와 동일 패턴)
- `end`를 거의 동시에 두 번 호출 → 두 번째는 이미 `active`가 아니므로 400
- 상담사가 2단계 배포 후 처음 로그인 시, 1단계 때 쌓인 클라이언트 메시지가 전부 "안읽음"으로 보이는 것이 의도된 동작

## 테스트

- `server/tests/counseling-routes.test.js`에 추가: 상담사 role 필터 조회, 상담사가 보낸 메시지의 `from:"counselor"` 저장, 상담사가 rating 없이 종료 가능, 당사자 아닌 유저는 여전히 403, 종료된 방엔 양쪽 다 메시지/종료 불가(400), report는 여전히 client만 가능
- 프론트는 테스트 러너 없음(프로젝트 전체 방침) — `tsc`/`eslint`/`build` + 브라우저 수동 확인: 클라이언트 계정과 상담사 계정을 각각 다른 브라우저 프로필로 동시에 열어 메시지 교환, 새로고침 없이 폴링 반영되는지, 배지·알림탭이 갱신/클리어되는지 확인

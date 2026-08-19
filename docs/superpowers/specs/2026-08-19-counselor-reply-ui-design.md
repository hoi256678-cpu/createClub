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
| GET | `/api/counseling/rooms` | `$or: [{client: me}, {counselor: me}]`로 조회(내가 어느 쪽이든 참여한 방, 진행중+종료 전체). 응답 항목에 `lastMessageAt`(마지막 메시지 시각, 없으면 방 생성 시각), `lastMessageFrom`(`"client"` \| `"counselor"` \| `null`) 필드 추가 — 프론트가 방을 열지 않고도 안읽음 여부를 계산하기 위함. **아래 "응답 필드 보정" 참고**. 진행중/전체 탭 필터는 서버 쿼리가 아니라 프론트에서 이미 받은 목록을 `status`로 거르는 방식으로 처리(안읽음 배지가 탭과 무관하게 전체 방 기준이어야 하므로 목록 자체는 항상 전체를 받아야 함) |
| GET | `/api/counseling/rooms/:id` | 403 체크를 `client===me`에서 `(client===me \|\| counselor===me)`로 확장 |
| POST | `/api/counseling/rooms/:id/messages` | 403 체크 동일 확장. `from`은 하드코딩 대신 요청자가 room의 `client`인지 `counselor`인지로 자동 결정. `status!=="active"`면 여전히 400 |
| POST | `/api/counseling/rooms/:id/end` | **양쪽 다 호출 가능하도록 확장.** 요청자가 `client===me`면 기존과 동일(`rating` 1~5 선택 가능, 있으면 상담사 rating running average 갱신). 요청자가 `counselor===me`면 `rating`은 무시(있어도 반영 안 함) — `status:"ended"`, `endedAt`만 기록. 둘 다 아니면 403. 이미 `active`가 아니면 400 |
| POST | `/api/counseling/rooms/:id/report` | 변경 없음 — 계속 client 전용 |

에러 규칙은 1단계와 동일하게 유지 (403/400/404), 위 표에 명시한 확장만 추가된다.

### 응답 필드 보정 (1단계 스펙 대비 정정)

1단계 `serializeRoom`은 `counselorId`/`counselorName`/`counselorMajor`/`avatarBg`/`avatarColor`처럼 "상담사 정보"를 고정 필드명으로 반환했다. 클라이언트가 보는 화면에선 문제없었지만(항상 상대방=상담사), **상담사가 자기 채팅함을 보면 상대방은 내담자**이고, 내담자 `User`에는애초에 `avatarBg`/`avatarColor`/`major`(= `counselorProfile`의 필드) 자체가 없다. 그대로 두면 상담사 화면에서 정보가 비거나 잘못 나온다.

그래서 응답 필드를 **뷰어 기준 상대방(other party) 필드**로 바꾼다:

```
{
  id, status, createdAt, lastMessage, lastMessageAt, lastMessageFrom,
  otherPartyId, otherPartyName,
  otherPartyMajor,       // 상대방이 상담사일 때만 값이 있음, 상대방이 내담자면 ""
  otherPartyAvatarBg,    // 상대방이 상담사일 때만 counselorProfile 값, 아니면 기본값 "#e8eff9"
  otherPartyAvatarColor, // 위와 동일, 기본값 "#7a9cc5"
}
```

`serializeRoom(room, viewerId)`로 시그니처를 바꿔서, `room.client._id`가 `viewerId`와 같으면 `counselor` 쪽을, 다르면 `client` 쪽을 "상대방"으로 골라 위 필드를 채운다. 상대방이 내담자(`client`)면 `counselorProfile`이 없으므로 `major`는 빈 문자열, 아바타는 상담사 목록과 동일한 기본값(`#e8eff9`/`#7a9cc5`)을 쓴다. `GET /rooms`, `GET /rooms/:id` 둘 다 이 로직을 쓰려면 두 쿼리 모두 `client`와 `counselor`를 **양쪽 다 populate**해야 한다(1단계는 `counselor`만 populate했음).

프론트엔드 `ChatRoom`/`RoomDetail` 타입의 `counselorId`/`counselorName`/`counselorMajor`/`avatarBg`/`avatarColor` 필드명도 `otherPartyId`/`otherPartyName`/`otherPartyMajor`/`otherPartyAvatarBg`/`otherPartyAvatarColor`로 함께 바뀐다 (아래 프론트엔드 섹션에 반영).

## 프론트엔드 변경

### Provider 순서 (`app/layout.tsx`)

알림 쪽이 채팅 데이터를 구독해야 하므로 `AuthProvider > NotificationsProvider > ChatRoomsProvider` → `AuthProvider > ChatRoomsProvider > NotificationsProvider`로 순서 변경.

### `useChatRooms` (`app/hooks/useChatRooms.tsx`)

- 방 목록 조회를 5초 간격 `setInterval`로 재조회. `document.visibilityState !== "visible"`이면 폴링 정지, 다시 보이면 즉시 1회 조회 후 재개
- 읽음상태를 localStorage(`somit:chat:read`, 방 id → 마지막으로 읽은 시각 ISO 문자열)로 재도입. 방별 "안읽음"은 `room.lastMessageFrom`이 **내 계정 role과 다르고**(role은 방마다 다른 게 아니라 계정 전체에 하나뿐이라 `useAuthStatus().role`로 비교하면 충분), `lastMessageAt`이 저장된 읽은시각보다 최신인 경우로 판정. `unreadCount`(그 조건을 만족하는 방의 개수)와 `markRoomRead(id)`를 새로 노출
- `ChatRoom` 타입에 `lastMessageAt`, `lastMessageFrom` 추가하고, `counselorId`/`counselorName`/`counselorMajor`/`avatarBg`/`avatarColor`를 `otherPartyId`/`otherPartyName`/`otherPartyMajor`/`otherPartyAvatarBg`/`otherPartyAvatarColor`로 이름 변경 ("응답 필드 보정" 참고)

### `app/(shell)/chat/page.tsx` (목록)

- 진행중/전체 탭 UI 추가 (이미 받아온 `rooms` 배열을 `status==="active"`로 클라이언트에서 거르기만 함, API 재호출 없음)
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

## 최종 리뷰 반영 (구현 완료 후 발견된 정정)

전체 브랜치를 리뷰한 결과, 아래 항목들은 스펙/플랜 자체의 결함으로 드러나 구현과 함께 정정했다.

**뷰어 role이 아니라 room 참여 side로 "내 메시지"를 판단한다.** 원래 프론트는 `m.from === myRole`(계정 전체의 role)로 메시지 소유를 판단했는데, 이는 "한 계정은 항상 한 room에서 같은 쪽"이라는 암묵적 가정에 기대고 있었다. 그런데 `/counselors` 신청 화면(홈 CTA·채팅함 빈 상태 링크)이 상담사 role에게 숨겨져 있지 않아서, 상담사 계정이 다른 상담사에게 상담을 신청하면(또래 지원을 상담사도 받을 수 있다는 게 이 앱 취지상 이상하지 않음) 그 room에서는 자신이 client가 되고, `myRole==="counselor"`와 어긋나면서 말풍선 정렬·안읽음 계산이 뒤집힌다. 그래서 `serializeRoom`이 `viewerSide: "client" | "counselor"`(그 room에서 뷰어가 어느 쪽인지)를 추가로 반환하고, 프론트는 `m.from === viewerSide`로, 안읽음도 `lastMessageFrom !== viewerSide`로 비교하도록 바꿨다. 상담사가 client로 신청하는 것 자체를 막지는 않는다(스펙이 금지한 적 없고, 막을지는 별도 제품 결정) — 어느 쪽이든 UI가 room 단위로 정확히 그려지는 게 목표다.

**상담사 목록/신청 진입점은 실제로는 숨겨진 적이 없었다.** `상담사 목록/신청`을 숨긴다는 문구(위 Sidebar/BottomNav 절)는 `NAV_ITEMS`에만 적용했는데, `/counselors`는애초에 메인 네비게이션 항목이 아니라 홈 화면 CTA와 채팅함 빈 상태 링크로만 진입한다. 두 진입점 모두 `role==="counselor"`일 때 숨기도록 정정.

**`app/(shell)/counselors/[id]/page.tsx`의 "이미 배정된 상담" 판별을 뷰어 side 기준으로 정정.** 1단계엔 `GET /counseling/rooms`가 client 소유 room만 반환했지만, 2단계에서 `$or`로 넓어지면서 상담사가 자기 counselor-side room까지 포함해 받는다. 이 페이지는 그중 아무 active room이나 있으면 "채팅 상담으로 이동"으로 CTA를 바꿔버렸으므로, 이제는 `otherPartyId === 상세페이지의 상담사 id`인 active room이 있을 때만 그렇게 바뀌도록 좁혔다.

**읽음 시각은 서버의 `lastMessageAt`을 저장한다, 클라이언트 시계가 아니라.** `markRoomRead`가 `new Date().toISOString()`(내 기기 시계)를 저장하던 걸, 방금 폴링으로 받은 메시지의 `lastMessageAt`(서버 값)을 저장하도록 바꿨다. 기기 시계 오차로 배지가 영영 안 사라지거나 반대로 안 본 메시지가 읽음 처리되는 문제, 그리고 지금 열어보고 있는 방이 폴링 도중 다시 "안읽음"으로 뒤집히는 문제(마운트 시에만 읽음 처리하고 이후 새 메시지가 와도 안 갱신했음) 둘 다 이걸로 해결된다 — 상세 페이지가 폴링 결과의 마지막 메시지가 바뀔 때마다 읽음 처리를 다시 호출하도록 함께 정정.

**폴링은 로그인 상태에서만 돈다.** `ChatRoomsProvider`가 루트 레이아웃에 있다 보니, 로그인 안 한 방문자도 홈/커뮤니티/심리검사 등 어느 페이지에 있든 5초마다 `GET /api/counseling/rooms`를 호출해 매번 401을 받고 있었다. `auth.phase==="in"`일 때만 조회/폴링하도록, 로그아웃 시엔 목록을 비우도록 정정.

**폴링 실패 시 화면을 비우지 않는다.** 처음 로드 실패(방/목록이 아예 없음)와 그 이후 폴링 중 일시적 실패(백엔드 콜드스타트 등)를 구분하지 않고 둘 다 `null`/빈 배열로 덮어써서, 열어보고 있던 채팅방이 일시적 502 하나에 "채팅방을 찾을 수 없어요"로 바뀌는 문제가 있었다. 폴링 갱신 실패는 이전 상태를 유지하도록 정정.

**자동 스크롤 — 이 문서 "프론트엔드 변경 > chat/[id]/page.tsx" 절에 적어뒀던 요구사항이 실제 구현에서 빠져있었다.** 새 메시지가 폴링으로 도착하면 메시지 목록 하단으로 자동 스크롤하도록 추가.

## 테스트

- `server/tests/counseling-routes.test.js`에 추가: 상담사 role 필터 조회, 상담사가 보낸 메시지의 `from:"counselor"` 저장, 상담사가 rating 없이 종료 가능, 당사자 아닌 유저는 여전히 403, 종료된 방엔 양쪽 다 메시지/종료 불가(400), report는 여전히 client만 가능
- 프론트는 테스트 러너 없음(프로젝트 전체 방침) — `tsc`/`eslint`/`build` + 브라우저 수동 확인: 클라이언트 계정과 상담사 계정을 각각 다른 브라우저 프로필로 동시에 열어 메시지 교환, 새로고침 없이 폴링 반영되는지, 배지·알림탭이 갱신/클리어되는지 확인

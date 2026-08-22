# 기분 기록 상담사 공유 기능 설계

> 배경: `/mood` 페이지의 "상담을 시작할 때 최근 2주 기분 기록을 상담사에게 보여줄게요" 동의 체크박스가 실제로는 아무 데도 연결되지 않은 장식용 기능이었다(`somit:mood:share` 값이 로컬스토리지에 저장만 될 뿐, 그 값을 읽는 코드가 앱 전체에 없었고, 애초에 기분 기록 자체가 로컬스토리지에만 있어 상담사가 볼 방법이 없었다). 이 문서는 기분 기록을 서버에 저장하고, 클라이언트가 동의했을 때만 담당 상담사가 실제로 조회할 수 있게 만드는 설계를 다룬다.

## 범위

1. 기분 기록을 서버에 저장(`MoodEntry` 모델 신규) — 로컬스토리지는 오프라인 캐시/폴백으로 유지
2. 공유 동의 여부를 서버에 저장(`User.moodShareEnabled`) — 상담사 쪽 API가 이 값을 신뢰할 수 있어야 하므로 로컬스토리지만으로는 불충분
3. 상담사가 **활성(active) 상담방**에서, **해당 클라이언트가 동의했을 때만**, 최근 14개 기록을 조회할 수 있는 API + 채팅방 화면 UI
4. 기존에 로컬스토리지에만 있던 기록은 첫 로딩 시 자동으로 서버에 백필(업로드)

## A. 백엔드

### A-1. `MoodEntry` 모델 (신규 파일 `server/models/MoodEntry.js`)

```js
{
  user: ObjectId (ref User, required),
  date: String (required, "YYYY-MM-DD"),
  score: Number (required, min 1, max 5),
  note: String (default "", maxlength 200),
  checks: [String] (default []),
}
```

`{ user: 1, date: 1 }`에 유니크 인덱스 — 사용자당 하루 1개 기록만 존재하게 강제한다(현재 프론트엔드 로직과 동일한 제약).

### A-2. `User` 모델에 필드 추가

```js
moodShareEnabled: { type: Boolean, default: false }
```

`notificationPrefs`와 같은 이유로 서버에 둔다 — 로컬스토리지 값은 클라이언트가 임의로 조작할 수 있어 "상담사가 볼 수 있는지"를 판단하는 근거로 쓸 수 없다.

### A-3. `GET /api/mood/entries` (신규 파일 `server/routes/mood.js`, `requireAuth`)

로그인한 사용자 본인의 전체 기록 + 공유 설정을 반환한다.

```json
{ "shareEnabled": false, "entries": [{ "date": "2026-08-22", "score": 4, "note": "", "checks": ["sleep"] }, ...] }
```

`entries`는 `date` 내림차순(최신이 먼저) — 프론트엔드의 `lowStreak` 계산이 "배열의 앞쪽이 최신"이라는 가정에 의존하므로 이 순서를 반드시 지켜야 한다.

### A-4. `PUT /api/mood/entries/:date` (`server/routes/mood.js`, `requireAuth`)

`:date`가 `YYYY-MM-DD` 형식이 아니면 400. body `{ score, note, checks }` — `score`가 1~5 사이 숫자가 아니면 400. 해당 사용자의 그 날짜 기록을 upsert(없으면 생성, 있으면 덮어쓰기)하고 저장된 기록을 반환한다. 오늘 날짜만 허용하는 제약은 두지 않는다 — 로컬에만 있던 과거 날짜 기록을 백필(A-6)할 때도 이 엔드포인트를 그대로 쓴다.

### A-5. `PATCH /api/mood/share` (`server/routes/mood.js`, `requireAuth`)

body `{ enabled: boolean }` — `boolean`이 아니면 400. `user.moodShareEnabled`를 갱신하고 `{ enabled }`를 반환한다.

### A-6. `GET /api/counseling/rooms/:id/mood` (`server/routes/counseling.js`에 추가, `requireAuth`)

상담사가 담당 클라이언트의 최근 기분 기록을 보는 엔드포인트.

- 방이 없으면 404
- `room.counselor`가 요청자 본인이 아니면 403 "접근 권한이 없어요" (클라이언트 쪽은 이 API를 쓰지 않는다 — 본인 기록은 A-3으로 이미 볼 수 있다)
- `room.status !== "active"`면 403 "활성 상담방에서만 볼 수 있어요" — 상담이 끝나면 상담사는 더 이상 볼 수 없다(오늘 결정한 범위)
- 클라이언트(`room.client`)가 `moodShareEnabled`가 아니면 403 `{ error: "...", shareDisabled: true }` — 프론트엔드가 "공유 꺼짐" 상태를 다른 에러와 구분해서 조용히 표시할 수 있도록 `shareDisabled` 플래그를 따로 둔다
- 통과하면 그 클라이언트의 `MoodEntry`를 `date` 내림차순으로 최대 14개 조회해 **시간순(오래된 것부터)으로 뒤집어서** 반환한다: `{ entries: [{ date, score, note, checks }, ...] }`. (정확히 "최근 14일"의 날짜 범위를 서버가 타임존 계산으로 판단하지 않고, 그냥 "가장 최근 기록 14개"로 단순화한다 — 오늘 세션에서 타임존 버그를 한 번 겪었으니 같은 종류의 계산을 또 만들지 않는다.)

## B. 프론트엔드 — 기분 페이지(`app/(shell)/mood/page.tsx`)

기존 로컬스토리지 기반 동작은 오프라인 폴백으로 계속 유지한다. 정상적으로 네트워크가 되면 서버가 진실의 원천이 된다.

- **첫 로딩**: 로컬스토리지 값으로 즉시 렌더링(기존과 동일, 로딩 깜빡임 없음) → 백그라운드로 `GET /api/mood/entries` 호출 → 성공하면: 로컬에만 있고 서버에 없는 날짜의 기록을 찾아 `PUT /api/mood/entries/:date`로 한 번씩 올려보낸 뒤, 서버 기록과 방금 올려보낸 로컬 기록을 합쳐 `entries` state와 로컬스토리지 캐시를 갱신한다. 실패하면(오프라인 등) 로컬스토리지 값을 그대로 쓴다 — 이번 로딩에서는 동기화를 시도하지 않고 다음 성공 시로 미룬다.
- **공유 설정 초기값**도 같은 응답의 `shareEnabled`에서 가져온다. 조회 실패 시엔 기존처럼 로컬스토리지 `somit:mood:share` 값으로 폴백한다.
- **저장(`save`)**: 기존처럼 로컬스토리지에는 무조건 저장(안정성 유지) + `PUT /api/mood/entries/${date}`를 함께 호출해 서버에도 반영한다. 서버 호출이 실패해도 로컬 저장은 이미 끝난 뒤이므로 사용자는 기록을 잃지 않는다(다음 로딩 때 백필됨).
- **공유 토글(`toggleShare`)**: `PATCH /api/mood/share`를 호출해 서버 값을 실제로 바꾼다. 로컬스토리지에도 값을 미러링해 오프라인일 때의 표시용 폴백으로 남겨둔다.

## C. 프론트엔드 — 상담 채팅방(`app/(shell)/chat/[id]/page.tsx`, 상담사 시점)

`room.viewerSide === "counselor" && room.status === "active"`일 때만, 메시지 목록 위쪽에 접었다 펼 수 있는 섹션 "최근 2주 기분 기록 보기"를 추가한다.

- 처음 펼칠 때 `GET /api/counseling/rooms/${id}/mood`를 호출한다.
- 응답이 `shareDisabled: true`인 403이면 "클라이언트가 기분 기록 공유를 켜지 않았어요"를 조용한 톤(회색 안내문)으로 보여준다 — 경고나 강조 없이, 그냥 정보로.
- 그 외 에러면 "불러오지 못했어요" 정도의 짧은 문구만 보여준다.
- 정상 응답이면 최근 14개 기록을 **가로로 나열된 작은 타일**(이모지 + 날짜, 클라이언트 달력의 이모지 매핑을 그대로 재사용)로 보여주고, 타일을 클릭하면 그 날짜의 체크리스트(✓/○)와 한줄 메모를 아래에 펼쳐 보여준다 — 클라이언트 쪽 달력 상세 카드와 같은 정보 구성이나, 월 그리드 대신 가로 한 줄 스트립으로 압축한다(채팅창 안에 들어가는 보조 UI이므로).

## 영향 범위 및 테스트

- 변경/신규 파일: `server/models/MoodEntry.js`(신규), `server/models/User.js`, `server/routes/mood.js`(신규), `server/routes/counseling.js`, `server/index.js`(새 라우터 마운트), `server/tests/mood-routes.test.js`(신규), `server/tests/counseling-routes.test.js`, `app/(shell)/mood/page.tsx`, `app/(shell)/chat/[id]/page.tsx`.
- 새 npm 의존성 없음.
- 백엔드는 TDD(`node --test`), 프론트엔드는 이 프로젝트에 테스트 러너가 없으므로 tsc/eslint/build + 수동 확인으로 대체.
- 수동 확인: 기분 기록 후 새로고침해도 유지되는지(서버 저장 확인), 공유 켜기 → 상담사 계정으로 활성 상담방 열어서 최근 기록이 보이는지, 공유 끄면 상담사 쪽에 "공유 안 함" 문구가 뜨는지, 상담이 종료된 방에서는 상담사가 더 이상 못 보는지, 예전 로컬스토리지 전용 데이터가 있는 계정으로 로그인했을 때 자동으로 서버에 올라가는지.

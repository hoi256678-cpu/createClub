# 상담사 로그인/답장 화면 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담사가 로그인해서 자신에게 배정된 채팅방을 보고 답장할 수 있게 하고, 가벼운 폴링·읽음상태·알림 연동까지 붙인다.

**Architecture:** 서버는 기존 `ChatRoom`/`counseling.js`를 확장(양방향 메시지, 뷰어 기준 상대방 필드, 양쪽 종료 가능)한다. 프론트는 클라이언트/상담사가 같은 채팅 목록·상세 컴포넌트를 role 분기로 공유하고, 새 `usePolling` 훅으로 5초 간격 재조회, localStorage 기반 읽음상태를 재도입하고, 그 읽음상태를 알림 탭·사이드바 배지와 하나의 소스로 연결한다.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (프론트), Express + Mongoose (백엔드), `node --test` + `supertest` + `mongodb-memory-server` (백엔드 테스트, 프론트는 테스트 러너 없음 — `tsc`/`eslint`/`build` + 수동 확인)

**Spec:** `docs/superpowers/specs/2026-08-19-counselor-reply-ui-design.md`

## Global Constraints

- 권한 체크는 항상 `room.client`/`room.counselor` 필드와 요청자 ID 매칭으로 하고, `req.user.role` 클레임에 의존하지 않는다 (스펙 "에러 처리" 절)
- 신고(`report`)는 계속 client 전용 — 상담사에게 노출하지 않는다
- 텍스트 후기, 대시보드/통계 화면, 웹소켓 실시간 전달은 이번 범위 밖 (스펙 "범위" 절)
- 프론트는 프로젝트 전체에 테스트 러너가 없다 — 각 프론트 태스크의 검증은 `npx tsc --noEmit`, `npm run lint`, `npm run build` + 수동 확인으로 한다
- 이 저장소는 직접 `main`에 커밋/푸시하는 워크플로우를 쓴다 — 각 태스크는 별도 브랜치 없이 커밋 후 바로 푸시한다

---

## Task 1: 서버 — `ChatRoom` 모델 + 목록/상세 조회 (뷰어 기준 상대방 필드)

**Files:**
- Modify: `server/models/ChatRoom.js`
- Modify: `server/routes/counseling.js` (`serializeRoom`, `POST /counseling/rooms`, `GET /counseling/rooms`, `GET /counseling/rooms/:id`)
- Modify: `server/tests/counseling-routes.test.js`

**Interfaces:**
- Produces: `serializeRoom(room, viewerId)` — `room`은 `client`와 `counselor` 둘 다 populate된 문서, 반환값은 `{ id, otherPartyId, otherPartyName, otherPartyMajor, otherPartyAvatarBg, otherPartyAvatarColor, status, lastMessage, lastMessageAt, lastMessageFrom, createdAt }`. Task 2가 이 함수를 그대로 재사용한다 (시그니처 변경 없음).

- [ ] **Step 1: `ChatRoom.messages.from` enum에 `"counselor"` 추가**

`server/models/ChatRoom.js`의 `messageSchema`를 수정:

```js
const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["client", "counselor"], required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
```

- [ ] **Step 2: 실패하는 테스트부터 작성 — 상담사 목록/상세 조회**

`server/tests/counseling-routes.test.js` 맨 위 `signupClient` 헬퍼 바로 아래에 카운셀러용 인증 쿠키 헬퍼를 추가하고(로그인 플로우 없이 `signToken`으로 직접 쿠키를 만든다 — `createCounselor()`로 만든 계정은 알 수 없는 비밀번호 해시라 `/api/auth/login`으로는 로그인할 수 없다):

```js
const { signToken, COOKIE_NAME } = require("../lib/token");

function counselorCookie(counselor) {
  const token = signToken({ id: counselor._id.toString(), role: "counselor" });
  return `${COOKIE_NAME}=${token}`;
}
```

기존 테스트 "로그인한 클라이언트가 상담사에게 신청하면 방이 생성되지만..." (130~145줄) 안의 아래 두 줄을 필드명 변경에 맞게 고친다:

```js
  assert.equal(res.body.counselorId, counselor._id.toString());
  assert.equal(res.body.counselorName, "이지원");
```
→
```js
  assert.equal(res.body.otherPartyId, counselor._id.toString());
  assert.equal(res.body.otherPartyName, "이지원");
```

파일 끝에 새 테스트 4개를 추가:

```js
test("클라이언트가 방 목록을 조회하면 otherPartyName이 상담사 이름/전공이다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].otherPartyName, "이지원");
  assert.equal(res.body[0].otherPartyMajor, "상담심리학과 4학년");
});

test("상담사가 방 목록을 조회하면 자신이 배정된 방만, otherPartyName은 내담자 이름이다", async () => {
  const counselor = await createCounselor();
  const otherCounselor = await createCounselor({ email: "counselor2@test.com" });
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app).get("/api/counseling/rooms").set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].otherPartyName, "내담자");
  assert.equal(res.body[0].otherPartyMajor, "");

  const res2 = await request(app).get("/api/counseling/rooms").set("Cookie", counselorCookie(otherCounselor));
  assert.equal(res2.body.length, 0);
});

test("상담사가 방 상세를 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.equal(res.body.otherPartyName, "내담자");
});

test("메시지를 보내면 목록의 lastMessageFrom/lastMessageAt이 갱신된다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.body[0].lastMessageFrom, "client");
  assert.ok(res.body[0].lastMessageAt);
});
```

- [ ] **Step 2b: 테스트 실행해서 실패 확인**

Run: `cd server && npm test`
Expected: 위 4개 신규 테스트 + 수정한 기존 테스트가 FAIL (아직 `otherPartyId`/`otherPartyName` 필드가 없고, 상담사 계정으로는 403/빈 배열이 나옴)

- [ ] **Step 3: `serializeRoom` + 조회 라우트 구현**

`server/routes/counseling.js`에서 `serializeRoom` 함수를 아래로 교체:

```js
const DEFAULT_AVATAR_BG = "#e8eff9";
const DEFAULT_AVATAR_COLOR = "#7a9cc5";

function serializeRoom(room, viewerId) {
  const client = room.client;
  const counselor = room.counselor;
  if (!client || typeof client.name !== "string" || !counselor || typeof counselor.name !== "string") {
    throw new Error("serializeRoom: client/counselor가 populate되지 않았습니다");
  }
  const isViewerClient = client._id.toString() === viewerId;
  const other = isViewerClient ? counselor : client;
  const otherProfile = other.counselorProfile || {};
  const last = room.messages.length ? room.messages[room.messages.length - 1] : null;

  return {
    id: room._id.toString(),
    otherPartyId: other._id.toString(),
    otherPartyName: other.name,
    otherPartyMajor: otherProfile.major || "",
    otherPartyAvatarBg: otherProfile.avatarBg || DEFAULT_AVATAR_BG,
    otherPartyAvatarColor: otherProfile.avatarColor || DEFAULT_AVATAR_COLOR,
    status: room.status,
    lastMessage: last ? last.text : null,
    lastMessageAt: last ? last.createdAt : room.createdAt,
    lastMessageFrom: last ? last.from : null,
    createdAt: room.createdAt,
  };
}
```

`POST /counseling/rooms` 안의 populate와 응답 부분을 교체:

```js
    await room.populate([
      { path: "client", select: "name counselorProfile" },
      { path: "counselor", select: "name counselorProfile" },
    ]);
    res.status(201).json(serializeRoom(room, req.user.id));
```

`GET /counseling/rooms` 라우트 전체를 교체:

```js
router.get("/counseling/rooms", requireAuth, async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ $or: [{ client: req.user.id }, { counselor: req.user.id }] })
      .sort({ createdAt: -1 })
      .populate("client", "name counselorProfile")
      .populate("counselor", "name counselorProfile");
    res.json(rooms.map((r) => serializeRoom(r, req.user.id)));
  } catch (err) {
    console.error("채팅방 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

`GET /counseling/rooms/:id` 라우트 전체를 교체:

```js
router.get("/counseling/rooms/:id", requireAuth, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id)
      .populate("client", "name counselorProfile")
      .populate("counselor", "name counselorProfile");
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    const isParticipant =
      room.client._id.toString() === req.user.id || room.counselor._id.toString() === req.user.id;
    if (!isParticipant) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    res.json({ ...serializeRoom(room, req.user.id), messages: room.messages.map(serializeMessage) });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("채팅방 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && npm test`
Expected: PASS (전체 `counseling-routes.test.js`, 특히 Step 2의 4개 신규 테스트 + 수정한 기존 테스트)

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add server/models/ChatRoom.js server/routes/counseling.js server/tests/counseling-routes.test.js
git commit -m "feat: 채팅방 목록/상세를 뷰어(상담사/클라이언트) 양쪽에서 조회 가능하게 확장"
git push
```

---

## Task 2: 서버 — 메시지 전송 / 종료를 양쪽 다 가능하게

**Files:**
- Modify: `server/routes/counseling.js` (`POST /counseling/rooms/:id/messages`, `POST /counseling/rooms/:id/end`)
- Modify: `server/tests/counseling-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `serializeMessage(m)` (변경 없음, 그대로 재사용)
- Produces: 없음 (라우트 동작 변경만, 다른 태스크가 이 파일의 export를 직접 참조하지 않음)

- [ ] **Step 1: 실패하는 테스트부터 작성**

`server/tests/counseling-routes.test.js` 파일 끝에 추가 (Task 1에서 추가한 `counselorCookie` 헬퍼를 재사용):

```js
test("상담사가 배정된 방에 메시지를 보내면 from이 counselor로 저장된다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/messages`)
    .set("Cookie", counselorCookie(counselor))
    .send({ text: "안녕하세요, 무슨 일로 오셨나요?" });
  assert.equal(res.status, 201);
  assert.equal(res.body[res.body.length - 1].from, "counselor");
});

test("당사자가 아닌 상담사가 메시지를 보내면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const otherCounselor = await createCounselor({ email: "counselor2@test.com" });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/messages`)
    .set("Cookie", counselorCookie(otherCounselor))
    .send({ text: "몰래 보내는 메시지" });
  assert.equal(res.status, 403);
});

test("상담사가 상담을 종료할 수 있고, 평점/세션수는 반영되지만 상담사 rating은 안 바뀐다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(counselor))
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, null);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.sessionCount, 113);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
});

test("상담사가 종료하며 rating을 보내도 무시된다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(counselor))
    .send({ rating: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.rating, null);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
});

test("당사자가 아닌 상담사가 종료를 요청하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const otherCounselor = await createCounselor({ email: "counselor2@test.com" });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(otherCounselor))
    .send({});
  assert.equal(res.status, 403);
});

test("이미 종료된 방을 상담사가 다시 종료하려 하면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(counselor))
    .send({});
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && npm test`
Expected: 위 6개 테스트 FAIL (지금은 `room.client.toString() !== req.user.id`만 체크해서 상담사는 전부 403을 받음)

- [ ] **Step 3: 라우트 구현**

`POST /counseling/rooms/:id/messages` 라우트를 교체:

```js
router.post("/counseling/rooms/:id/messages", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ error: "메시지를 입력해주세요" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ error: "메시지는 1000자를 넘을 수 없어요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    const isClient = room.client.toString() === req.user.id;
    const isCounselor = room.counselor.toString() === req.user.id;
    if (!isClient && !isCounselor) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "종료된 상담이에요" });
    }

    room.messages.push({ from: isClient ? "client" : "counselor", text: text.trim() });
    await room.save();

    res.status(201).json(room.messages.map(serializeMessage));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("메시지 전송 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

`POST /counseling/rooms/:id/end` 라우트를 교체:

```js
router.post("/counseling/rooms/:id/end", requireAuth, async (req, res) => {
  try {
    const { rating } = req.body || {};
    if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "평점은 1~5 사이여야 해요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    const isClient = room.client.toString() === req.user.id;
    const isCounselor = room.counselor.toString() === req.user.id;
    if (!isClient && !isCounselor) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    room.status = "ended";
    room.endedAt = new Date();
    // rating은 client가 종료할 때만 반영한다 — 상담사가 자기 평점을 남기는 건 의미가 없다.
    const effectiveRating = isClient ? rating : undefined;
    if (effectiveRating) room.rating = effectiveRating;
    await room.save();

    const hadMessages = room.messages.length > 0;

    if (hadMessages || effectiveRating) {
      const counselor = await User.findById(room.counselor);
      const p = counselor.counselorProfile;

      // 실제 대화(메시지 교환)가 있었던 방만 상담사 통계에 반영한다.
      // 신청 직후 바로 종료하는 것을 반복해 통계를 조작하는 것을 막기 위함이다.
      if (hadMessages) {
        p.sessionCount = (p.sessionCount || 0) + 1;
        p.recentSessions = (p.recentSessions || 0) + 1;
      }

      if (effectiveRating && hadMessages) {
        const prevCount = p.ratingCount || 0;
        const prevAvg = p.rating || 0;
        p.ratingCount = prevCount + 1;
        p.rating = (prevAvg * prevCount + effectiveRating) / p.ratingCount;
      }

      await counselor.save();
    }

    res.json({ id: room._id.toString(), status: room.status, rating: room.rating });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("상담 종료 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && npm test`
Expected: PASS (전체 테스트 스위트, `report`는 손대지 않았으니 관련 테스트도 그대로 통과해야 함)

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add server/routes/counseling.js server/tests/counseling-routes.test.js
git commit -m "feat: 상담사도 메시지 전송/상담 종료를 할 수 있게 확장"
git push
```

---

## Task 3: 프론트 — 채팅 목록/상세를 role 공유 + 폴링 + 읽음상태

**Files:**
- Create: `app/hooks/usePolling.ts`
- Modify: `app/hooks/useChatRooms.tsx` (전체 재작성)
- Modify: `app/layout.tsx` (Provider 순서)
- Modify: `app/(shell)/chat/page.tsx` (전체 재작성)
- Modify: `app/(shell)/chat/[id]/page.tsx` (전체 재작성)

**Interfaces:**
- Produces: `usePolling(callback: () => void, intervalMs: number): void` — Task 3 안에서 목록/상세 둘 다 이걸 쓰고, 다른 태스크는 쓰지 않는다.
- Produces: `useChatRooms()`가 반환하는 `ChatRoomsContextValue`에 `unreadCount: number`, `markRoomRead: (id: string) => void`, `isRoomUnread: (room: ChatRoom) => boolean`이 새로 추가됨. Task 4(알림)와 Task 5(사이드바 배지)가 이 세 값을 그대로 가져다 쓴다.
- Produces: `ChatRoom` 타입 필드명 변경: `counselorId→otherPartyId`, `counselorName→otherPartyName`, `counselorMajor→otherPartyMajor`, `avatarBg→otherPartyAvatarBg`, `avatarColor→otherPartyAvatarColor`, `lastMessageAt: string`, `lastMessageFrom: "client" | "counselor" | null` 추가. Task 4가 이 타입을 그대로 import해서 쓴다.

이 태스크는 프론트 전용이라 자동 테스트가 없다(프로젝트 전체 방침). 검증은 각 단계 뒤 `npx tsc --noEmit`으로 한다.

- [ ] **Step 1: `usePolling` 훅 작성**

`app/hooks/usePolling.ts` 새로 작성:

```ts
"use client";

import { useEffect, useRef } from "react";

/**
 * intervalMs 간격으로 callback을 반복 호출한다.
 * 탭이 백그라운드로 가면 멈추고, 다시 보이면 즉시 1회 호출한 뒤 재개한다.
 */
export function usePolling(callback: () => void, intervalMs: number): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      callbackRef.current();
    }
    function start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}
```

- [ ] **Step 2: `useChatRooms` 재작성**

`app/hooks/useChatRooms.tsx` 전체를 교체:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { readJSON, writeJSON } from "@/lib/storage";
import { useAuthStatus } from "./useAuthStatus";
import { usePolling } from "./usePolling";

const READ_STATE_KEY = "somit:chat:read";
const POLL_INTERVAL_MS = 5000;

export type ChatRoom = {
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyMajor: string;
  otherPartyAvatarBg: string;
  otherPartyAvatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageFrom: "client" | "counselor" | null;
  createdAt: string;
};

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  unreadCount: number;
  /** 종료/신고 등으로 목록이 바뀐 뒤 다시 불러올 때 쓴다. */
  refresh: () => Promise<void>;
  markRoomRead: (id: string) => void;
  isRoomUnread: (room: ChatRoom) => boolean;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

async function fetchChatRooms(
  setRooms: (rooms: ChatRoom[]) => void,
  setLoading: (loading: boolean) => void,
) {
  try {
    const res = await apiFetch("/api/counseling/rooms");
    setRooms(res.ok ? await res.json() : []);
  } catch {
    setRooms([]);
  } finally {
    setLoading(false);
  }
}

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuthStatus();
  const myRole = auth.phase === "in" ? auth.role : null;

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [readState, setReadState] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadState(readJSON<Record<string, string>>(READ_STATE_KEY, {}));
  }, []);

  const refresh = useCallback(() => fetchChatRooms(setRooms, setLoading), []);

  useEffect(() => {
    fetchChatRooms(setRooms, setLoading);
  }, []);

  usePolling(refresh, POLL_INTERVAL_MS);

  const markRoomRead = useCallback((id: string) => {
    setReadState((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      writeJSON(READ_STATE_KEY, next);
      return next;
    });
  }, []);

  const isRoomUnread = useCallback(
    (room: ChatRoom) => {
      if (!myRole || !room.lastMessageFrom || room.lastMessageFrom === myRole) return false;
      const lastRead = readState[room.id];
      return !lastRead || new Date(room.lastMessageAt) > new Date(lastRead);
    },
    [myRole, readState],
  );

  const unreadCount = useMemo(() => rooms.filter(isRoomUnread).length, [rooms, isRoomUnread]);

  const value = useMemo(
    () => ({ rooms, loading, unreadCount, refresh, markRoomRead, isRoomUnread }),
    [rooms, loading, unreadCount, refresh, markRoomRead, isRoomUnread],
  );

  return <ChatRoomsContext.Provider value={value}>{children}</ChatRoomsContext.Provider>;
}

export function useChatRooms(): ChatRoomsContextValue {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) {
    throw new Error("useChatRooms must be used within a ChatRoomsProvider");
  }
  return ctx;
}
```

- [ ] **Step 3: Provider 순서 변경**

`app/layout.tsx`에서 (import는 그대로, 중첩 순서만) 아래처럼 `ChatRoomsProvider`가 `NotificationsProvider`보다 바깥(위)이 되도록 바꾼다:

```tsx
        <AuthProvider>
          <ChatRoomsProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </ChatRoomsProvider>
        </AuthProvider>
```

- [ ] **Step 4: `tsc`로 이 시점 확인**

Run: `npx tsc --noEmit`
Expected: `app/(shell)/chat/page.tsx`와 `app/(shell)/chat/[id]/page.tsx`가 옛 필드명(`counselorName` 등)을 쓰고 있어서 타입 에러가 남. 다음 두 스텝에서 그 파일들을 고치면 사라진다 — 여기서는 "그 두 파일에서만" 에러가 나는지 확인.

- [ ] **Step 5: 채팅 목록 페이지 재작성**

`app/(shell)/chat/page.tsx` 전체를 교체:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useChatRooms, type ChatRoom } from "@/app/hooks/useChatRooms";

export default function ChatListPage() {
  const { rooms, loading, isRoomUnread } = useChatRooms();
  const [tab, setTab] = useState<"active" | "all">("active");

  const visibleRooms = tab === "active" ? rooms.filter((r) => r.status === "active") : rooms;

  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shell:grid-cols-[300px_1fr]">
        <div className="border-b border-border shell:border-b-0 shell:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <span className="font-extrabold text-text">상담 목록</span>
            <div className="flex gap-1 rounded-lg bg-bg p-0.5 text-[12px] font-bold">
              <button
                onClick={() => setTab("active")}
                className={`rounded-md px-2.5 py-1 ${
                  tab === "active" ? "bg-surface text-primary-dark shadow-sm" : "text-text-faint"
                }`}
              >
                진행중
              </button>
              <button
                onClick={() => setTab("all")}
                className={`rounded-md px-2.5 py-1 ${
                  tab === "all" ? "bg-surface text-primary-dark shadow-sm" : "text-text-faint"
                }`}
              >
                전체
              </button>
            </div>
          </div>
          <div>
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">불러오는 중이에요...</div>
            ) : visibleRooms.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">
                {tab === "active" ? "진행 중인 상담이 없어요" : "아직 상담이 없어요"}
              </div>
            ) : (
              visibleRooms.map((r) => <ChatRoomRow key={r.id} room={r} unread={isRoomUnread(r)} />)
            )}
          </div>
        </div>
        <div className="hidden flex-col items-center justify-center gap-4 py-24 text-text-faint shell:flex">
          왼쪽에서 상담을 선택해주세요
          <Link
            href="/counselors"
            className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-primary-dark transition-colors hover:border-primary-dark"
          >
            새 상담사 찾아보기 →
          </Link>
        </div>
      </div>
    </RequireAuth>
  );
}

function ChatRoomRow({ room, unread }: { room: ChatRoom; unread: boolean }) {
  return (
    <Link
      href={`/chat/${room.id}`}
      className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-primary-xlight"
    >
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
        style={{ background: room.otherPartyAvatarBg, color: room.otherPartyAvatarColor }}
      >
        {room.otherPartyName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold text-text">
          {room.otherPartyName}
          {room.status !== "active" && (
            <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-text-faint">종료됨</span>
          )}
        </div>
        <div className="truncate text-xs text-text-muted">{room.lastMessage ?? "아직 메시지가 없어요"}</div>
      </div>
      {unread && <div className="h-2 w-2 flex-shrink-0 rounded-full bg-danger" />}
    </Link>
  );
}
```

- [ ] **Step 6: 채팅 상세 페이지 재작성**

`app/(shell)/chat/[id]/page.tsx` 전체를 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import { usePolling } from "@/app/hooks/usePolling";

type Message = { id: string; from: "client" | "counselor"; text: string; createdAt: string };

type RoomDetail = {
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyMajor: string;
  otherPartyAvatarBg: string;
  otherPartyAvatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageFrom: "client" | "counselor" | null;
  createdAt: string;
  messages: Message[];
};

const POLL_INTERVAL_MS = 5000;

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const myRole = auth.phase === "in" ? auth.role : null;
  const { refresh: refreshRoomList, markRoomRead } = useChatRooms();
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"end" | "report" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  function openModal(next: "end" | "report" | null) {
    setModalError(null);
    setModal(next);
  }

  async function loadRoom() {
    try {
      const res = await apiFetch(`/api/counseling/rooms/${params.id}`);
      setRoom(res.ok ? await res.json() : null);
    } catch {
      setRoom(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 방 상세는 마운트/id 변경 시 API 호출 후 setState한다
    loadRoom();
    markRoomRead(params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  usePolling(loadRoom, POLL_INTERVAL_MS);

  async function send() {
    if (!room || !input.trim() || room.status !== "active") return;
    const text = input.trim();
    setInput("");
    setSendError(null);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setInput(text);
        setSendError("메시지 전송에 실패했어요");
        return;
      }
      const messages = await res.json();
      setRoom({ ...room, messages, lastMessage: text });
    } catch {
      setInput(text);
      setSendError("백엔드에 연결할 수 없어요");
    }
  }

  async function handleEnd(rating: number | null) {
    if (!room) return;
    setModalError(null);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/end`, {
        method: "POST",
        body: JSON.stringify(rating ? { rating } : {}),
      });
      if (!res.ok) {
        setModalError("상담 종료에 실패했어요");
        return;
      }
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    } catch {
      setModalError("백엔드에 연결할 수 없어요");
    }
  }

  async function handleReport(reason: string) {
    if (!room || !reason.trim()) return;
    setModalError(null);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        setModalError("신고 접수에 실패했어요");
        return;
      }
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    } catch {
      setModalError("백엔드에 연결할 수 없어요");
    }
  }

  if (room === undefined) {
    return (
      <RequireAuth>
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      </RequireAuth>
    );
  }

  if (!room) {
    return (
      <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
        <div className="py-16 text-center text-text-faint">채팅방을 찾을 수 없어요.</div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="flex h-[calc(100dvh-200px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shell:h-[calc(100dvh-160px)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <button onClick={() => router.push("/chat")} className="text-text-muted">
            ←
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: room.otherPartyAvatarBg, color: room.otherPartyAvatarColor }}
          >
            {room.otherPartyName.slice(0, 1)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-text">{room.otherPartyName}</div>
            {room.otherPartyMajor && <div className="text-xs text-text-muted">{room.otherPartyMajor}</div>}
          </div>
          {room.status === "active" && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="px-2 text-lg text-text-muted">
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      openModal("end");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-text hover:bg-bg"
                  >
                    상담 종료하기
                  </button>
                  {myRole === "client" && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openModal("report");
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-danger hover:bg-bg"
                    >
                      신고하기
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {room.status !== "active" && (
          <div className="border-b border-border bg-bg px-5 py-2 text-center text-xs font-semibold text-text-faint">
            {room.status === "reported" ? "신고 접수 후 종료된 상담이에요" : "종료된 상담이에요"}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-5">
          {room.messages.map((m) => {
            const isMine = m.from === myRole;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[420px] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? "rounded-br-md bg-primary-dark text-white"
                      : "rounded-bl-md border border-border bg-surface text-text"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>

        {sendError && <p className="px-5 pt-2 text-xs font-semibold text-danger">{sendError}</p>}

        <div className="flex items-end gap-2 border-t border-border bg-surface px-5 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={room.status !== "active"}
            placeholder={room.status === "active" ? "메시지를 입력하세요" : "종료된 상담이에요"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={room.status !== "active"}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>

      {modal === "end" && (
        <EndModal
          onSubmit={handleEnd}
          onClose={() => openModal(null)}
          error={modalError}
          showRating={myRole === "client"}
        />
      )}
      {modal === "report" && (
        <ReportModal onSubmit={handleReport} onClose={() => openModal(null)} error={modalError} />
      )}
    </RequireAuth>
  );
}

function EndModal({
  onSubmit,
  onClose,
  error,
  showRating,
}: {
  onSubmit: (rating: number | null) => void;
  onClose: () => void;
  error: string | null;
  showRating: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">상담을 종료할까요?</h2>
        {showRating ? (
          <>
            <p className="mt-1 text-[13px] text-text-muted">상담사에게 별점을 남길 수 있어요 (선택)</p>
            <div className="mt-4 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  aria-label={`${n}점`}
                  className={`text-2xl ${rating !== null && n <= rating ? "text-[#f0b429]" : "text-border"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-text-muted">상담을 종료하면 다시 되돌릴 수 없어요.</p>
        )}
        {error && <p className="mt-3 text-center text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(showRating ? rating : null)}
            className="flex-1 rounded-xl bg-primary-dark py-2.5 text-sm font-extrabold text-white"
          >
            {showRating ? (rating ? "평점 남기고 종료" : "건너뛰고 종료") : "종료하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({
  onSubmit,
  onClose,
  error,
}: {
  onSubmit: (reason: string) => void;
  onClose: () => void;
  error: string | null;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">신고하기</h2>
        <p className="mt-1 text-[13px] text-text-muted">신고 접수와 함께 상담이 바로 종료돼요.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="어떤 점이 불편했는지 알려주세요"
          className="mt-4 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={!reason.trim()}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
          >
            신고하고 종료
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 셋 다 에러 없이 통과. (백엔드가 로컬에서 떠 있다면 `npm run dev`로 켜고, 로그인한 클라이언트 계정으로 `/chat`에 들어가 진행중/전체 탭이 동작하는지, 방을 열었을 때 메시지가 여전히 보이는지 눈으로 확인 — 상담사 쪽 동작 확인은 Task 6에서 종합적으로 한다)

- [ ] **Step 8: 커밋 + 푸시**

```bash
git add app/hooks/usePolling.ts app/hooks/useChatRooms.tsx app/layout.tsx "app/(shell)/chat/page.tsx" "app/(shell)/chat/[id]/page.tsx"
git commit -m "feat: 채팅 목록/상세를 상담사·클라이언트가 공유하도록 하고 폴링/읽음상태 추가"
git push
```

---

## Task 4: 프론트 — 새 채팅 답장을 알림 탭에 연동

**Files:**
- Modify: `app/(shell)/notifications/mock.ts` (`NotificationItem.id` 타입)
- Modify: `app/hooks/useNotifications.tsx`
- Modify: `app/(shell)/notifications/page.tsx` (`handleClick` id 타입)

**Interfaces:**
- Consumes: Task 3의 `useChatRooms()` → `rooms`, `isRoomUnread`, `markRoomRead` / `ChatRoom.otherPartyName`, `lastMessage`, `lastMessageAt`
- Produces: 없음 (알림 페이지가 최종 소비자)

- [ ] **Step 1: `NotificationItem.id` 타입 확장**

`app/(shell)/notifications/mock.ts`의 타입 선언 한 줄만 수정:

```ts
export type NotificationItem = {
  id: string | number;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  href?: string;
};
```

- [ ] **Step 2: `useNotifications`가 채팅방을 구독하도록 재작성**

`app/hooks/useNotifications.tsx` 전체를 교체:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NOTIFICATIONS, type NotificationItem } from "@/app/(shell)/notifications/mock";
import { formatRelativeTime } from "@/app/(shell)/community/time";
import { readJSON, writeJSON } from "@/lib/storage";
import { useChatRooms } from "./useChatRooms";

const STORAGE_KEY = "somit:notifications:read";

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string | number) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  // 읽은 mock 알림 id 목록만 저장한다. 채팅 알림은 useChatRooms의 읽음상태를 그대로 쓴다.
  const [readIds, setReadIds] = useState<number[]>([]);
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();

  // localStorage는 렌더 중에 읽으면 서버/클라이언트 HTML이 달라져 하이드레이션이 깨진다.
  // 반드시 마운트 후 effect에서 읽는다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadIds(readJSON<number[]>(STORAGE_KEY, []));
  }, []);

  const persist = useCallback((next: number[]) => {
    setReadIds(next);
    writeJSON(STORAGE_KEY, next);
  }, []);

  const markRead = useCallback(
    (id: string | number) => {
      if (typeof id === "string" && id.startsWith("chat:")) {
        markRoomRead(id.slice("chat:".length));
        return;
      }
      setReadIds((prev) => {
        if (prev.includes(id as number)) return prev;
        const next = [...prev, id as number];
        writeJSON(STORAGE_KEY, next);
        return next;
      });
    },
    [markRoomRead],
  );

  const markAllRead = useCallback(() => {
    persist(NOTIFICATIONS.map((n) => n.id));
    rooms.filter(isRoomUnread).forEach((r) => markRoomRead(r.id));
  }, [persist, rooms, isRoomUnread, markRoomRead]);

  const chatItems = useMemo<NotificationItem[]>(
    () =>
      rooms
        .filter(isRoomUnread)
        .map((r) => ({
          id: `chat:${r.id}`,
          icon: "💬",
          title: `${r.otherPartyName}님이 메시지를 보냈어요`,
          desc: r.lastMessage ?? "",
          time: formatRelativeTime(r.lastMessageAt),
          unread: true,
          href: `/chat/${r.id}`,
        })),
    [rooms, isRoomUnread],
  );

  const items = useMemo<NotificationItem[]>(
    () => [
      ...chatItems,
      ...NOTIFICATIONS.map((n) => ({ ...n, unread: n.unread && !readIds.includes(n.id) })),
    ],
    [chatItems, readIds],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const value = useMemo(
    () => ({ items, unreadCount, markRead, markAllRead }),
    [items, unreadCount, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
```

- [ ] **Step 3: 알림 페이지의 id 타입 맞추기**

`app/(shell)/notifications/page.tsx`에서 `handleClick` 시그니처만 수정:

```tsx
  function handleClick(id: string | number, href?: string) {
    markRead(id);
    if (href) router.push(href);
  }
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 통과. 수동 확인: 클라이언트 계정으로 상담사가 보낸(Task 6에서 상담사 계정으로 보낼) 메시지가 있는 상태로 `/mypage` → 알림에 들어가면 "OO님이 메시지를 보냈어요" 항목이 보이고, 클릭하면 해당 방으로 이동하면서 안읽음 배지가 사라지는지 (본격적인 두 계정 교차 테스트는 Task 6에서)

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add "app/(shell)/notifications/mock.ts" app/hooks/useNotifications.tsx "app/(shell)/notifications/page.tsx"
git commit -m "feat: 새 채팅 답장을 알림 탭에도 노출"
git push
```

---

## Task 5: 프론트 — 채팅 배지 + 상담사용 메뉴 숨김

**Files:**
- Modify: `app/components/shell/nav-items.tsx`
- Modify: `app/components/shell/Sidebar.tsx`
- Modify: `app/components/shell/BottomNav.tsx`

**Interfaces:**
- Consumes: Task 3의 `useChatRooms().unreadCount`

- [ ] **Step 1: `NavItem`에 role별 숨김 옵션 추가**

`app/components/shell/nav-items.tsx`의 타입/배열 정의를 수정:

```ts
export type NavItem = {
  href: string;
  label: string;
  requiresAuth: boolean;
  hideForRole?: "counselor" | "client";
  Icon: (props: { className?: string }) => React.JSX.Element;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", requiresAuth: false, Icon: HomeIcon },
  { href: "/community", label: "커뮤니티", requiresAuth: false, Icon: CommunityIcon },
  { href: "/chat", label: "채팅 상담", requiresAuth: true, Icon: ChatIcon },
  { href: "/test", label: "심리검사", requiresAuth: false, hideForRole: "counselor", Icon: TestIcon },
  { href: "/mypage", label: "마이페이지", requiresAuth: true, Icon: MypageIcon },
];
```

- [ ] **Step 2: `Sidebar`에 필터링 + 배지 반영**

`app/components/shell/Sidebar.tsx`에서 import와 nav 렌더링 부분을 수정. 파일 상단 import에 추가:

```tsx
import { useChatRooms } from "@/app/hooks/useChatRooms";
```

컴포넌트 본문 시작 부분(`const { state: auth } = useAuthStatus();` 바로 아래)에 추가:

```tsx
  const { unreadCount } = useChatRooms();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !(auth.phase === "in" && item.hideForRole === auth.role),
  );
```

`{NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {` 를 `{visibleNavItems.map(({ href, label, requiresAuth, Icon }) => {` 로 바꾸고, 그 안의 `<Icon className="h-[18px] w-[18px]" />`를 아래로 교체:

```tsx
              <span className="relative">
                <Icon className="h-[18px] w-[18px]" />
                {href === "/chat" && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
                )}
              </span>
```

- [ ] **Step 3: `BottomNav`에도 동일하게 반영**

`app/components/shell/BottomNav.tsx` 전체를 교체:

```tsx
"use client";

import AuthLink from "@/app/components/AuthLink";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function BottomNav({ pathname }: { pathname: string }) {
  const { state: auth } = useAuthStatus();
  const { unreadCount } = useChatRooms();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !(auth.phase === "in" && item.hideForRole === auth.role),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shell:hidden">
      {visibleNavItems.map(({ href, label, requiresAuth, Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <AuthLink
            key={href}
            href={href}
            requiresAuth={requiresAuth}
            className={`flex flex-col items-center gap-1 px-2 text-[10px] font-bold ${
              active ? "text-primary-dark" : "text-text-faint"
            }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {href === "/chat" && unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
              )}
            </span>
            {label}
          </AuthLink>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 통과. 수동 확인은 Task 6에서 상담사 계정으로 로그인해 "심리검사" 탭이 사라지는지, 안읽은 방이 있을 때 배지가 뜨는지 확인

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add app/components/shell/nav-items.tsx app/components/shell/Sidebar.tsx app/components/shell/BottomNav.tsx
git commit -m "feat: 채팅 안읽음 배지 추가 및 상담사 계정에서 client 전용 메뉴 숨김"
git push
```

---

## Task 6: 마무리 — seed 스크립트 주석 정정 + 전체 수동 검증

**Files:**
- Modify: `server/scripts/seed-counselors.js` (주석 한 줄)

**Interfaces:** 없음 (마지막 태스크)

- [ ] **Step 1: 오래된 주석 정정**

`server/scripts/seed-counselors.js`의 아래 주석은 1단계 때("상담사 로그인 기능이 없어 비밀번호가 안 쓰인다") 쓴 것인데, 2단계로 상담사 로그인이 생기면서 더 이상 맞지 않는다. seed된 상담사 계정(`counselor1@example.com` 등)은 여전히 로그인할 수 없는 무작위 비밀번호를 쓴다는 사실을 명확히 남긴다:

```js
    // seed된 상담사 계정은 무작위 비밀번호를 쓴다 — 실제 로그인 테스트용이 아니라
    // /api/counselors 목록에 노출할 "표시용" 데이터를 만드는 스크립트다.
    // 상담사로 로그인해서 테스트하려면 /signup에서 역할을 "상담사"로 선택해 새 계정을 만들 것.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
```

- [ ] **Step 2: 서버 전체 테스트 한 번 더 확인**

Run: `cd server && npm test`
Expected: 전체 PASS

- [ ] **Step 3: 프론트 전체 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 전체 통과

- [ ] **Step 4: 두 계정으로 수동 통합 테스트**

1. `npm run dev`(프론트)와 `cd server && npm run dev`(백엔드)를 각각 띄운다.
2. 브라우저 프로필 A에서 `/signup`으로 client 역할 테스트 계정을 만들고, `/counselors`에서 아무 상담사에게 상담을 신청해 채팅방을 연다.
3. 브라우저 프로필 B(시크릿창 등, 세션 분리 위해)에서 `/signup`으로 counselor 역할 테스트 계정을 만든다. `GET /api/counselors`에는 `counselorProfile.verified===true`인 계정만 나오므로, 방금 만든 계정으로 A가 상담을 신청할 수는 없다 — 대신 MongoDB에서 그 계정의 `counselorProfile.verified`를 수동으로 `true`로 바꾸거나(로컬 DB에서), A가 신청할 때 seed된 상담사가 아니라 이 신규 계정의 `_id`를 쓰도록 임시로 API를 직접 호출(`POST /api/counseling/rooms`)해 방을 만든다.
4. B(상담사)로 `/chat`에 들어가 진행중 탭에 A의 방이 보이는지, 심리검사 탭이 사이드바에서 사라졌는지 확인
5. B에서 답장 메시지를 보내고, A 화면을 새로고침 없이 5초 안에 상대 메시지가 뜨는지, 사이드바 채팅 배지가 뜨는지, `/mypage`>알림에 항목이 뜨는지 확인
6. A에서 방을 열어(`markRoomRead`) 배지/알림이 사라지는지 확인
7. B에서 "⋯ > 상담 종료하기"로 별점 없이 종료 — A 쪽에서도 "종료된 상담이에요"로 바뀌는지, `/chat` 전체 탭에는 남고 진행중 탭에서는 빠지는지 확인
8. A에서 별도로 다른 상담사에게 새로 신청해 "⋯ > 신고하기"가 A(client)에게만 보이고 B(counselor)에게는 안 보이는지 확인

- [ ] **Step 5: 커밋 + 푸시**

```bash
git add server/scripts/seed-counselors.js
git commit -m "docs: seed 상담사 계정 비밀번호 관련 주석을 2단계 기준으로 정정"
git push
```

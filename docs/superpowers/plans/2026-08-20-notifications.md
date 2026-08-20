# 알림 시스템(신고 처리 알림) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버에 범용 Notification 서브시스템(모델 + API)을 만들고, 관리자가 상담 신고를 처리 완료로 표시하면 신고자에게 실제 알림이 가도록 연결한다. 프론트엔드 알림 벨/패널/페이지는 mock 데이터 대신 이 실데이터를 폴링해서 보여준다.

**Architecture:** `Report`/`Post`와 같은 패턴으로 `Notification` Mongoose 모델과 `server/routes/notifications.js`를 신규 추가하고, `requireAuth`로 본인 알림만 조회/조작하도록 제한한다. 신고 처리 라우트(`POST /api/admin/reports/:id/review`)에서 저장 성공 후 `Notification.create`를 호출해 신고자에게 알림을 만든다. 프론트 `useNotifications` 훅은 `useChatRooms`와 동일한 `usePolling`(5초 간격, 로그인 중에만) 패턴으로 `/api/notifications`를 폴링하고, 읽음/전체읽음/삭제는 실제 API를 호출한다. 채팅 안읽음에서 파생되는 알림은 기존 방식 그대로 유지하고 서버 알림과 합쳐서 보여준다. 기존 mock 알림 3개와 `notifications/mock.ts`는 삭제한다.

**Tech Stack:** Next.js 16 (App Router) + React 19 (프론트), Express + Mongoose (백엔드), `mongodb-memory-server` + `supertest` + Node 내장 `node:test` (백엔드 테스트).

**Spec:** `docs/superpowers/specs/2026-08-20-notifications-design.md`

## Global Constraints

- 알림은 받는 사람 본인만 조회/읽음/삭제할 수 있다. 다른 사용자의 알림 id로 접근하면 404 (존재 자체를 숨김).
- `type`은 `enum: ["report_reviewed"]` 하나뿐이지만, 나중에 다른 이벤트도 추가하기 쉽도록 필드 이름은 범용으로 둔다.
- 신고 처리 시 알림 생성이 실패해도 신고 처리 자체(`report.save()`)는 이미 성공했으므로 응답은 정상 200으로 내려간다 — 알림 생성 실패는 로그만 남긴다.
- 채팅 안읽음에서 파생되는 알림(`chat:${roomId}` id)은 이번에도 DB로 옮기지 않고 기존 프론트 로직을 그대로 유지한다.
- 프론트엔드는 이 프로젝트에 테스트 러너가 없으므로(백엔드만 `node --test` 보유) 타입체크(`npx tsc --noEmit -p .`) + 린트(`npx eslint <파일>`)로 검증한다. 백엔드는 TDD로 작성한다.
- 커밋은 각 태스크 완료 시 바로 만든다. 실행자는 배포/푸시는 하지 말 것 — 전체 플랜 완료 후 사용자가 한 번에 판단한다.

---

## Task 1: Notification 모델 + 알림 API

**Files:**
- Create: `server/models/Notification.js`
- Create: `server/routes/notifications.js`
- Modify: `server/index.js`
- Test: `server/tests/notification-routes.test.js`

**Interfaces:**
- Produces: `Notification` 모델 (`server/models/Notification.js`, `module.exports = mongoose.model("Notification", notificationSchema)`) — 필드: `user`(ObjectId ref User), `type`(String enum `["report_reviewed"]`), `icon`(String), `title`(String), `desc`(String), `href`(String, optional), `read`(Boolean, default false), `createdAt`. Task 2에서 그대로 재사용한다.
- Produces: `GET /api/notifications` (본인 알림 목록, 최신순, 최근 50개), `POST /api/notifications/:id/read`(응답 `{ read: true }`), `POST /api/notifications/read-all`, `DELETE /api/notifications/:id`. 전부 `requireAuth`.

- [ ] **Step 1: Notification 모델 작성**

`server/models/Notification.js` 신규 작성:

```js
const mongoose = require("mongoose");

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

module.exports = mongoose.model("Notification", notificationSchema);
```

- [ ] **Step 2: 실패하는 테스트 작성**

`server/tests/notification-routes.test.js` 신규 작성:

```js
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;
let User;
let Notification;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Notification = require("../models/Notification");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function signup(agent, overrides = {}) {
  const payload = {
    name: "테스트유저",
    email: "user@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

async function signedUpUserId(payload) {
  const user = await User.findOne({ email: payload.email });
  return user._id;
}

async function createNotification(userId, overrides = {}) {
  return Notification.create({
    user: userId,
    type: "report_reviewed",
    icon: "📮",
    title: overrides.title ?? "신고가 처리됐어요",
    desc: overrides.desc ?? "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
    read: overrides.read ?? false,
  });
}

test("비로그인 상태로 알림 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/notifications");
  assert.equal(res.status, 401);
});

test("비로그인 상태로 알림을 읽음 처리하면 401을 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).post(`/api/notifications/${missingId}/read`);
  assert.equal(res.status, 401);
});

test("비로그인 상태로 알림을 삭제하면 401을 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).delete(`/api/notifications/${missingId}`);
  assert.equal(res.status, 401);
});

test("로그인한 사용자는 본인의 알림만 조회한다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });

  await createNotification(myId, { title: "내 알림" });
  await createNotification(other._id, { title: "남의 알림" });

  const res = await agent.get("/api/notifications");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "내 알림");
  assert.equal(res.body[0].unread, true);
});

test("알림을 읽음 처리하면 unread가 false가 된다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const notification = await createNotification(myId);

  const res = await agent.post(`/api/notifications/${notification._id}/read`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { read: true });

  const listRes = await agent.get("/api/notifications");
  assert.equal(listRes.body[0].unread, false);
});

test("전체 읽음 처리하면 안읽은 알림이 모두 읽음으로 바뀐다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  await createNotification(myId, { title: "알림1" });
  await createNotification(myId, { title: "알림2" });

  const res = await agent.post("/api/notifications/read-all");
  assert.equal(res.status, 200);

  const listRes = await agent.get("/api/notifications");
  assert.ok(listRes.body.every((n) => n.unread === false));
});

test("알림을 삭제하면 목록에서 사라진다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const notification = await createNotification(myId);

  const res = await agent.delete(`/api/notifications/${notification._id}`);
  assert.equal(res.status, 200);

  const listRes = await agent.get("/api/notifications");
  assert.equal(listRes.body.length, 0);
});

test("다른 사용자의 알림을 읽음 처리하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });
  const othersNotification = await createNotification(other._id);

  const res = await agent.post(`/api/notifications/${othersNotification._id}/read`);
  assert.equal(res.status, 404);
});

test("다른 사용자의 알림을 삭제하려 하면 404를 반환하고 삭제되지 않는다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });
  const othersNotification = await createNotification(other._id);

  const res = await agent.delete(`/api/notifications/${othersNotification._id}`);
  assert.equal(res.status, 404);

  const stillThere = await Notification.findById(othersNotification._id);
  assert.ok(stillThere);
});

test("존재하지 않는 알림을 읽음 처리하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();

  const res = await agent.post(`/api/notifications/${missingId}/read`);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/notification-routes.test.js`
Expected: FAIL (라우트가 아직 마운트되지 않아 404 등으로 실패, `Notification` 모듈은 Step 1에서 이미 만들었으므로 require 자체는 성공)

- [ ] **Step 4: notifications.js 라우트 작성 및 index.js에 마운트**

`server/routes/notifications.js` 신규 작성:

```js
const express = require("express");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function serializeNotification(n) {
  return {
    id: n._id.toString(),
    icon: n.icon,
    title: n.title,
    desc: n.desc,
    href: n.href,
    unread: !n.read,
    time: n.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications.map(serializeNotification));
  } catch (err) {
    console.error("알림 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });
    if (!notification) {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    notification.read = true;
    await notification.save();
    res.json({ read: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    console.error("알림 읽음 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("알림 전체 읽음 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!notification) {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    console.error("알림 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;
```

`server/index.js` 수정 — `adminRouter` require 아래에 추가:

```js
const notificationsRouter = require("./routes/notifications");
```

`app.use("/api/admin", adminRouter);` 아래에 추가:

```js
app.use("/api/notifications", notificationsRouter);
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/notification-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 6: 전체 백엔드 테스트 스위트 실행 (회귀 확인)**

Run: `cd server && npm test`
Expected: 기존 테스트 포함 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add server/models/Notification.js server/routes/notifications.js server/index.js server/tests/notification-routes.test.js
git commit -m "feat: 알림 백엔드 추가 - Notification 모델과 조회/읽음/삭제 API"
```

---

## Task 2: 신고 처리 시 신고자에게 알림 생성

**Files:**
- Modify: `server/routes/admin.js`
- Modify: `server/tests/admin-routes.test.js`

**Interfaces:**
- Consumes: `Notification` 모델 (Task 1의 `server/models/Notification.js`) — `Notification.create({ user, type, icon, title, desc })`.
- Produces: 신고 처리 성공 시 신고자에게 `type: "report_reviewed"` Notification 문서 하나가 생성된다는 사이드 이펙트. `POST /api/admin/reports/:id/review`의 응답 형태(`{ status }`)는 그대로 유지된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/admin-routes.test.js` 상단 선언부 수정 — `let ChatRoom;` 아래에 `let Notification;` 추가:

```js
let ChatRoom;
let Notification;
```

`before()` 안, `ChatRoom = require("../models/ChatRoom");` 아래에 추가:

```js
Notification = require("../models/Notification");
```

`test("존재하지 않는 신고를 처리하면 404를 반환한다", ...)` 테스트 바로 다음(파일의 승인 대기 상담사 섹션 시작 전)에 새 테스트 추가:

```js
test("admin이 신고를 처리하면 신고자에게 신고 처리 알림이 생성된다", async () => {
  const admin = await createAdmin();
  const report = await createReport();

  const res = await request(app)
    .post(`/api/admin/reports/${report._id}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const notifications = await Notification.find({ user: report.reporter });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "report_reviewed");
  assert.equal(notifications[0].read, false);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: FAIL (`notifications.length`가 0이라 `assert.equal(notifications.length, 1)`에서 실패)

- [ ] **Step 3: admin.js에 알림 생성 로직 추가**

`server/routes/admin.js` 최상단 require 목록 — `const Report = require("../models/Report");` 아래에 추가:

```js
const Notification = require("../models/Notification");
```

`router.post("/reports/:id/review", ...)` 핸들러를 다음으로 교체:

```js
router.post("/reports/:id/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    report.status = "reviewed";
    await report.save();

    try {
      await Notification.create({
        user: report.reporter,
        type: "report_reviewed",
        icon: "📮",
        title: "신고가 처리됐어요",
        desc: "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
      });
    } catch (notifyErr) {
      console.error("신고 처리 알림 생성 중 오류:", notifyErr);
    }

    res.json({ status: report.status });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    console.error("신고 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd server && node --test tests/admin-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 5: 전체 백엔드 테스트 스위트 실행**

Run: `cd server && npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add server/routes/admin.js server/tests/admin-routes.test.js
git commit -m "feat: 신고 처리 시 신고자에게 알림 발송"
```

---

## Task 3: 프론트엔드 알림 훅을 실데이터로 교체

**Files:**
- Modify: `app/hooks/useNotifications.tsx`
- Modify: `app/components/shell/NotificationPanel.tsx`
- Modify: `lib/storage.ts`
- Delete: `app/(shell)/notifications/mock.ts`

**Interfaces:**
- Consumes: `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `DELETE /api/notifications/:id` (Task 1). `apiFetch`(`@/lib/api`), `usePolling`(`@/app/hooks/usePolling`), `formatRelativeTime`(`@/app/(shell)/community/time`), `useChatRooms`, `useAuthStatus`.
- Produces: `NotificationItem` 타입(`{ id: string; icon: string; title: string; desc: string; time: string; unread: boolean; href?: string }`)과 `useNotifications()` 훅 — `NotificationPanel`/`TopBar`가 이미 이 인터페이스만 소비하므로 두 컴포넌트의 로직 변경은 없다(타입만 좁아짐).

- [ ] **Step 1: useNotifications.tsx를 실데이터 기반으로 교체**

`app/hooks/useNotifications.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/app/(shell)/community/time";
import { useAuthStatus } from "./useAuthStatus";
import { useChatRooms } from "./useChatRooms";
import { usePolling } from "./usePolling";

const POLL_INTERVAL_MS = 5000;

export type NotificationItem = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  href?: string;
};

type ServerNotification = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  href?: string;
  unread: boolean;
  time: string;
};

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** 알림을 목록에서 지운다. 서버 알림은 삭제 API를 호출하고, 채팅 알림은 읽음 처리(=배지도 같이 사라짐)와 동일하게 동작한다. */
  deleteNotification: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

async function fetchNotifications(
  setNotifications: (updater: (prev: ServerNotification[]) => ServerNotification[]) => void,
  setLoading: (loading: boolean) => void,
  isFirstLoad: boolean,
) {
  try {
    const res = await apiFetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setNotifications(() => data);
    } else if (isFirstLoad) {
      // 최초 로드 실패는 빈 목록으로 보여주는 게 맞다. 폴링 중 실패(콜드스타트 등)는
      // 이미 불러온 목록을 그대로 유지해서 화면이 갑자기 비지 않도록 한다.
      setNotifications(() => []);
    }
  } catch {
    if (isFirstLoad) setNotifications(() => []);
  } finally {
    setLoading(false);
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";

  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [, setLoading] = useState(true);
  const firstLoadDoneRef = useRef(false);

  const refresh = useCallback(() => {
    const isFirstLoad = !firstLoadDoneRef.current;
    firstLoadDoneRef.current = true;
    return fetchNotifications(setNotifications, setLoading, isFirstLoad);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      // 로그아웃 상태거나 아직 인증 확인 중이면 조회하지 않는다. 로그아웃 직후엔
      // 이전 계정의 알림 목록/배지가 남아있지 않도록 비운다.
      firstLoadDoneRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그아웃 전환 시 이전 목록을 즉시 비운다
      setNotifications([]);
      setLoading(false);
      return;
    }
    refresh();
  }, [isLoggedIn, refresh]);

  usePolling(refresh, isLoggedIn ? POLL_INTERVAL_MS : null);

  const markRead = useCallback(
    (id: string) => {
      if (id.startsWith("chat:")) {
        const roomId = id.slice("chat:".length);
        const room = rooms.find((r) => r.id === roomId);
        if (room) markRoomRead(room.id, room.lastMessageAt);
        return;
      }
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
      apiFetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
    },
    [rooms, markRoomRead],
  );

  const markAllRead = useCallback(() => {
    rooms.filter(isRoomUnread).forEach((r) => markRoomRead(r.id, r.lastMessageAt));
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    apiFetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, [rooms, isRoomUnread, markRoomRead]);

  const deleteNotification = useCallback(
    (id: string) => {
      if (id.startsWith("chat:")) {
        // 채팅 알림은 별도 저장소가 없다 — 안읽음 상태에서 파생될 뿐이라, 지우는 것도 읽음 처리와 동일하다.
        markRead(id);
        return;
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      apiFetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [markRead],
  );

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

  const serverItems = useMemo<NotificationItem[]>(
    () => notifications.map((n) => ({ ...n, time: formatRelativeTime(n.time) })),
    [notifications],
  );

  const items = useMemo<NotificationItem[]>(() => [...chatItems, ...serverItems], [chatItems, serverItems]);

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const value = useMemo(
    () => ({ items, unreadCount, markRead, markAllRead, deleteNotification }),
    [items, unreadCount, markRead, markAllRead, deleteNotification],
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

- [ ] **Step 2: mock.ts 삭제**

```bash
git rm "app/(shell)/notifications/mock.ts"
```

- [ ] **Step 3: NotificationPanel.tsx의 id 타입을 string으로 좁히기**

`app/components/shell/NotificationPanel.tsx`에서:

```tsx
  function handleClick(id: string | number, href?: string) {
```

를 다음으로 교체:

```tsx
  function handleClick(id: string, href?: string) {
```

- [ ] **Step 4: storage.ts 주석에서 알림 언급 제거**

`lib/storage.ts`의 다음 주석:

```
 * 채팅/알림은 아직 목업 데이터라 서버에 읽음 상태를 저장할 곳이 없다.
 * 백엔드에 read API가 생기면 이 파일을 쓰는 곳만 교체하면 된다.
```

를 다음으로 교체:

```
 * 채팅은 아직 목업 데이터라 서버에 읽음 상태를 저장할 곳이 없다.
 * 백엔드에 read API가 생기면 이 파일을 쓰는 곳만 교체하면 된다.
```

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

Run: `npx eslint app/hooks/useNotifications.tsx app/components/shell/NotificationPanel.tsx lib/storage.ts`
Expected: 에러 없음

- [ ] **Step 6: 개발 서버로 수동 확인**

`npm run dev`로 프론트를, `cd server && npm run dev`로 백엔드를 띄운 뒤:
1. 클라이언트 계정으로 로그인해 상담사에게 신고를 접수한다(기존 채팅 신고 기능 사용).
2. 관리자 계정(`server/scripts/promote-admin.js`로 승격된 계정)으로 로그인해 `/admin/reports`에서 해당 신고를 "처리완료로 표시".
3. 다시 클라이언트 계정으로 돌아와(또는 5초 폴링을 기다려) 알림 벨 배지에 안읽음 표시가 뜨는지, 패널/`/notifications` 페이지에 "신고가 처리됐어요" 항목이 보이는지, 클릭하면 읽음 처리되는지, 삭제 버튼이 동작하는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add app/hooks/useNotifications.tsx app/components/shell/NotificationPanel.tsx lib/storage.ts "app/(shell)/notifications/mock.ts"
git commit -m "feat: 알림 벨/패널/페이지를 실제 알림 API에 연결"
```

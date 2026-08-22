# 설정 화면 실기능화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/settings` 화면의 장식용 항목(저장/연동되지 않는 알림 토글, 실체 없는 "닉네임 익명 표시"/"대화 내용 암호화")을 제거하고, 알림 토글은 실제로 서버에 저장되어 알림 벨/배지에 반영되게 하며, 비밀번호 변경과 회원 탈퇴 기능을 새로 추가한다.

**Architecture:** 백엔드(`server/`)에 `User.notificationPrefs` 필드와 3개 엔드포인트(`PATCH /notification-prefs`, `PATCH /password`, `DELETE /me`)를 추가한다. 계정 삭제가 가능해지면 다른 사람 화면에서 탈퇴한 유저를 참조하던 게시글 작성자/댓글 작성자/상담 채팅 상대방/신고 목록 이름 표시가 깨질 수 있으므로, 이 참조들에 안전한 폴백을 먼저 적용한다(Task 4). 프론트엔드는 `useAuthStatus`가 알림 설정을 들고 있게 하고, `useNotifications`가 그 설정으로 알림을 필터링하며, `settings/page.tsx`가 토글/폼 UI를 제공한다.

**Tech Stack:** Express, Mongoose, bcryptjs, `node --test` + `supertest` + `mongodb-memory-server`(백엔드) / Next.js App Router, React 19, TypeScript, Tailwind CSS v4(프론트엔드).

**Spec:** `docs/superpowers/specs/2026-08-22-mood-calendar-and-settings-design.md` (섹션 B).스펙에는 없었지만 계획 작성 중 발견한 추가 위험 지점 두 곳(`server/routes/admin.js`의 신고 목록 작성자 표시, `GET /counseling/rooms/:id`의 참여자 권한 체크)도 같은 이유(탈퇴 계정 참조 시 500 방지)로 Task 4에 포함한다.

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 브라우저에서 실제로 확인하는 단계로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 새 npm 의존성 없음.
- 회원 탈퇴는 `User` 문서와 그 사람의 `Notification` 문서만 지운다. 게시글/댓글/상담 채팅 기록은 지우지 않는다(상대방 데이터 보존).

---

## Task 1: `User` 모델에 알림 설정 필드 추가 + `GET /me` 응답에 포함

**Files:**
- Modify: `server/models/User.js`
- Modify: `server/routes/auth.js`
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Produces: `User` 문서에 `notificationPrefs: { chatMessages: boolean, systemAlerts: boolean }` (기본값 둘 다 `true`). `GET /api/auth/me` 응답에 `notificationPrefs` 필드가 추가됨 — 이후 모든 태스크가 이 응답 형태를 전제로 한다.

- [ ] **Step 1: 기존 테스트 확인 (베이스라인)**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: 현재 전부 PASS.

- [ ] **Step 2: 실패하는 테스트 작성**

`server/tests/auth-routes.test.js`의 `test("로그인한 상태에서 /me는 사용자 정보를 반환한다", ...)` 블록(96~106번 줄)을 다음으로 교체한다(기존 `assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });`는 새 필드가 추가되면 실패하므로 함께 갱신):

```js
test("로그인한 상태에서 /me는 사용자 정보와 기본 알림 설정을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.get("/api/auth/me");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    name: "홍길동",
    role: "counselor",
    notificationPrefs: { chatMessages: true, systemAlerts: true },
  });
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: FAIL (`res.body.notificationPrefs`가 `undefined`).

- [ ] **Step 4: `User` 모델에 필드 추가**

`server/models/User.js`의 `suspended: { type: Boolean, default: false },` 다음 줄에 추가한다:

```js
  notificationPrefs: {
    chatMessages: { type: Boolean, default: true },
    systemAlerts: { type: Boolean, default: true },
  },
```

- [ ] **Step 5: `/me` 응답에 포함**

`server/routes/auth.js`의 `/me` 라우트에서:

```js
    res.json({ name: user.name, role: user.role });
```

를 다음으로 교체한다:

```js
    res.json({ name: user.name, role: user.role, notificationPrefs: user.notificationPrefs });
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
git add server/models/User.js server/routes/auth.js server/tests/auth-routes.test.js
git commit -m "$(cat <<'EOF'
feat: User에 알림 설정 필드 추가, /me 응답에 포함

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `PATCH /api/auth/notification-prefs` 엔드포인트

**Files:**
- Modify: `server/routes/auth.js`
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `User.notificationPrefs` 필드.
- Produces: `PATCH /api/auth/notification-prefs` — body `{ chatMessages?: boolean, systemAlerts?: boolean }`(`requireAuth`), 성공 시 200과 갱신된 `{ chatMessages, systemAlerts }` 반환. Task 6(프론트 `useAuthStatus`)이 이 엔드포인트를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/auth-routes.test.js` 맨 끝(198번 줄, 마지막 `test(...)` 다음)에 추가한다:

```js
test("알림 설정을 변경하면 즉시 반영되고 /me에서도 확인된다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const patchRes = await agent.patch("/api/auth/notification-prefs").send({ chatMessages: false });
  assert.equal(patchRes.status, 200);
  assert.deepEqual(patchRes.body, { chatMessages: false, systemAlerts: true });

  const meRes = await agent.get("/api/auth/me");
  assert.deepEqual(meRes.body.notificationPrefs, { chatMessages: false, systemAlerts: true });
});

test("로그인하지 않은 상태에서 알림 설정을 변경하면 401을 반환한다", async () => {
  const res = await request(app).patch("/api/auth/notification-prefs").send({ chatMessages: false });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: FAIL (404, 라우트가 없음).

- [ ] **Step 3: 엔드포인트 구현**

`server/routes/auth.js`의 `/me` 라우트 다음(`module.exports = router;` 이전)에 추가한다:

```js
router.patch("/notification-prefs", requireAuth, async (req, res) => {
  try {
    const { chatMessages, systemAlerts } = req.body || {};
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    if (typeof chatMessages === "boolean") user.notificationPrefs.chatMessages = chatMessages;
    if (typeof systemAlerts === "boolean") user.notificationPrefs.systemAlerts = systemAlerts;
    await user.save();
    res.json(user.notificationPrefs);
  } catch (err) {
    console.error("알림 설정 변경 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/routes/auth.js server/tests/auth-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 알림 설정 변경 엔드포인트 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `PATCH /api/auth/password` 엔드포인트

**Files:**
- Modify: `server/routes/auth.js`
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Produces: `PATCH /api/auth/password` — body `{ currentPassword: string, newPassword: string }`(`requireAuth`). 현재 비밀번호 오류 401, 새 비밀번호 4자 미만 400, 성공 시 200 `{}`. Task 8(프론트 비밀번호 변경 폼)이 이 엔드포인트를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/auth-routes.test.js` 끝에 추가한다:

```js
test("비밀번호 변경 성공 시 새 비밀번호로 로그인할 수 있다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent
    .patch("/api/auth/password")
    .send({ currentPassword: "1234", newPassword: "5678" });
  assert.equal(res.status, 200);

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "5678" });
  assert.equal(loginRes.status, 200);

  const oldLoginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "1234" });
  assert.equal(oldLoginRes.status, 401);
});

test("현재 비밀번호가 틀리면 401을 반환하고 비밀번호는 바뀌지 않는다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent
    .patch("/api/auth/password")
    .send({ currentPassword: "wrong", newPassword: "5678" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "현재 비밀번호가 올바르지 않습니다");

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "1234" });
  assert.equal(loginRes.status, 200);
});

test("새 비밀번호가 4자 미만이면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent
    .patch("/api/auth/password")
    .send({ currentPassword: "1234", newPassword: "12" });
  assert.equal(res.status, 400);
});

test("로그인하지 않은 상태에서 비밀번호 변경은 401을 반환한다", async () => {
  const res = await request(app)
    .patch("/api/auth/password")
    .send({ currentPassword: "1234", newPassword: "5678" });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: FAIL (404, 라우트가 없음).

- [ ] **Step 3: 엔드포인트 구현**

`server/routes/auth.js`에서 Task 2의 `/notification-prefs` 라우트 다음에 추가한다:

```js
router.patch("/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return res.status(400).json({ error: "새 비밀번호는 4자 이상이어야 합니다" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "현재 비밀번호가 올바르지 않습니다" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({});
  } catch (err) {
    console.error("비밀번호 변경 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/routes/auth.js server/tests/auth-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 비밀번호 변경 엔드포인트 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 탈퇴 계정 참조 시 화면이 깨지지 않도록 안전한 폴백 적용

**Files:**
- Modify: `server/routes/community.js`
- Modify: `server/routes/counseling.js`
- Modify: `server/routes/admin.js`
- Test: `server/tests/community-routes.test.js`, `server/tests/counseling-routes.test.js`, `server/tests/admin-routes.test.js`

**Interfaces:**
- 이 태스크는 Task 5(회원 탈퇴)가 안전하게 동작하기 위한 선행 조건이다. 외부 응답 형태는 유지하되, 참조가 끊긴 경우(`populate` 결과가 `null`) `authorName`/`otherPartyName`/`reporterName`/`counselorName`이 `"(탈퇴한 회원)"`으로, `authorRole`이 `"회원"`으로 대체된다.

- [ ] **Step 1: 실패하는 테스트 작성 — 게시글/댓글**

`server/tests/community-routes.test.js`에 기존 `signup` 헬퍼를 참고해 끝에 추가한다:

```js
test("게시글 작성자 계정이 삭제돼도 목록 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const agent = request.agent(app);
  const author = await signup(agent, { email: "author@test.com" });
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(createRes.status, 201);

  const User = require("../models/User");
  await User.findOneAndDelete({ email: author.email });

  const res = await request(app).get("/api/community/posts");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].authorName, "(탈퇴한 회원)");
  assert.equal(res.body[0].authorRole, "회원");
});

test("댓글 작성자 계정이 삭제돼도 게시글 상세 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const postAgent = request.agent(app);
  await signup(postAgent, { email: "poster@test.com" });
  const createRes = await postAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const commentAgent = request.agent(app);
  const commenter = await signup(commentAgent, { email: "commenter@test.com" });
  await commentAgent.post(`/api/community/posts/${createRes.body.id}/comments`).send({ text: "댓글입니다" });

  const User = require("../models/User");
  await User.findOneAndDelete({ email: commenter.email });

  const res = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.comments[0].authorName, "(탈퇴한 회원)");
});
```

(댓글 작성 라우트 경로가 다르면 `server/routes/community.js`에서 실제 경로를 확인해 맞춘다 — `router.post("/posts/:id/comments", ...)` 형태를 그대로 사용하면 된다.)

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: FAIL (`Cannot read properties of null (reading 'name')` 등의 500 에러).

- [ ] **Step 3: `community.js` 수정**

`server/routes/community.js`의 상단 헬퍼 함수들을:

```js
function authorLabel(user) {
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorName: post.author.name,
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}

function serializeComment(comment) {
  return {
    id: comment._id.toString(),
    authorName: comment.author.name,
    authorRole: authorLabel(comment.author),
    text: comment.text,
    createdAt: comment.createdAt,
  };
}
```

다음으로 교체한다:

```js
function authorLabel(user) {
  if (!user) return "회원";
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}

function serializeComment(comment) {
  return {
    id: comment._id.toString(),
    authorName: comment.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(comment.author),
    text: comment.text,
    createdAt: comment.createdAt,
  };
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/community-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 실패하는 테스트 작성 — 상담 채팅방**

`server/tests/counseling-routes.test.js` 끝에 추가한다(파일에 이미 있는 `createCounselor`, `signupClient`, `counselorCookie` 헬퍼를 사용):

```js
test("상담 상대방 계정이 삭제돼도 채팅방 목록 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(createRes.status, 201);

  await counselor.deleteOne();

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].otherPartyName, "(탈퇴한 회원)");
  assert.equal(res.body[0].otherPartyId, null);
});

test("클라이언트 계정이 삭제돼도 상담사가 채팅방 상세를 폴백 이름으로 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const User = require("../models/User");
  await User.findOneAndDelete({ email: "client@test.com" });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.equal(res.body.otherPartyName, "(탈퇴한 회원)");
});
```

- [ ] **Step 6: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/counseling-routes.test.js
```

Expected: FAIL (500, 또는 `isParticipant` 계산에서 `Cannot read properties of null`).

- [ ] **Step 7: `counseling.js` 수정**

`serializeRoom` 함수를:

```js
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
    viewerSide: isViewerClient ? "client" : "counselor",
    createdAt: room.createdAt,
  };
}
```

다음으로 교체한다(`client`/`counselor`가 `null`인 것은 "탈퇴한 유저"라는 정상 상태로 허용하고, `populate` 자체를 빠뜨린 프로그래밍 실수만 계속 걸러낸다):

```js
function serializeRoom(room, viewerId) {
  const client = room.client;
  const counselor = room.counselor;
  if ((client && typeof client.name !== "string") || (counselor && typeof counselor.name !== "string")) {
    throw new Error("serializeRoom: client/counselor가 populate되지 않았습니다");
  }
  const isViewerClient = !client ? false : !counselor ? true : client._id.toString() === viewerId;
  const other = isViewerClient ? counselor : client;
  const otherProfile = (other && other.counselorProfile) || {};
  const last = room.messages.length ? room.messages[room.messages.length - 1] : null;

  return {
    id: room._id.toString(),
    otherPartyId: other ? other._id.toString() : null,
    otherPartyName: other?.name ?? "(탈퇴한 회원)",
    otherPartyMajor: otherProfile.major || "",
    otherPartyAvatarBg: otherProfile.avatarBg || DEFAULT_AVATAR_BG,
    otherPartyAvatarColor: otherProfile.avatarColor || DEFAULT_AVATAR_COLOR,
    status: room.status,
    lastMessage: last ? last.text : null,
    lastMessageAt: last ? last.createdAt : room.createdAt,
    lastMessageFrom: last ? last.from : null,
    viewerSide: isViewerClient ? "client" : "counselor",
    createdAt: room.createdAt,
  };
}
```

`GET /counseling/rooms/:id`의 참여자 권한 체크를:

```js
    const isParticipant =
      room.client._id.toString() === req.user.id || room.counselor._id.toString() === req.user.id;
```

다음으로 교체한다:

```js
    const isParticipant =
      (room.client && room.client._id.toString() === req.user.id) ||
      (room.counselor && room.counselor._id.toString() === req.user.id);
```

- [ ] **Step 8: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/counseling-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 9: 실패하는 테스트 작성 — 신고 목록(관리자)**

`server/tests/admin-routes.test.js`에 이미 있는 `createReport` 헬퍼(258~269번 줄)를 사용해 끝에 추가한다:

```js
test("신고자 계정이 삭제돼도 admin 신고 목록 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const admin = await createAdmin();
  await createReport({ reporterEmail: "gone@test.com" });

  await User.findOneAndDelete({ email: "gone@test.com" });

  const res = await request(app).get("/api/admin/reports").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body[0].reporterName, "(탈퇴한 회원)");
});
```

- [ ] **Step 10: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/admin-routes.test.js
```

Expected: FAIL (500).

- [ ] **Step 11: `admin.js` 수정**

`server/routes/admin.js`의 `serializeReport` 함수를:

```js
function serializeReport(report) {
  return {
    id: report._id.toString(),
    reporterName: report.reporter.name,
    counselorName: report.counselor.name,
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt,
  };
}
```

다음으로 교체한다:

```js
function serializeReport(report) {
  return {
    id: report._id.toString(),
    reporterName: report.reporter?.name ?? "(탈퇴한 회원)",
    counselorName: report.counselor?.name ?? "(탈퇴한 회원)",
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt,
  };
}
```

- [ ] **Step 12: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/admin-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 13: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/routes/community.js server/routes/counseling.js server/routes/admin.js \
  server/tests/community-routes.test.js server/tests/counseling-routes.test.js server/tests/admin-routes.test.js
git commit -m "$(cat <<'EOF'
fix: 탈퇴한 유저 참조 시 게시글/채팅/신고 목록이 500 대신 폴백 이름을 보여주게 함

다음 회원 탈퇴 기능(DELETE /me) 도입을 앞두고, populate 결과가
null이 되는 경우를 프로그래밍 실수(populate 누락)와 구분해
정상적인 "탈퇴한 회원" 상태로 처리하도록 수정.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `DELETE /api/auth/me` 엔드포인트 (회원 탈퇴)

**Files:**
- Modify: `server/routes/auth.js`
- Test: `server/tests/auth-routes.test.js`

**Interfaces:**
- Consumes: Task 4에서 안전해진 참조 표시.
- Produces: `DELETE /api/auth/me` — body `{ password: string }`(`requireAuth`). 비밀번호 불일치 401, 누락 400, 성공 시 200 `{}` + 쿠키 clear + 해당 유저의 `User`/`Notification` 문서 삭제. Task 9(프론트 회원 탈퇴 폼)가 이 엔드포인트를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/auth-routes.test.js` 끝에 추가한다:

```js
test("회원 탈퇴 성공 시 계정과 알림이 삭제되고 더 이상 로그인할 수 없다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const Notification = require("../models/Notification");
  const User = require("../models/User");
  const me = await User.findOne({ email: "hong@test.com" });
  await Notification.create({
    user: me._id,
    type: "report_reviewed",
    icon: "📮",
    title: "신고가 처리됐어요",
    desc: "확인했어요",
  });

  const res = await agent.delete("/api/auth/me").send({ password: "1234" });
  assert.equal(res.status, 200);

  assert.equal(await User.findOne({ email: "hong@test.com" }), null);
  assert.equal(await Notification.countDocuments({ user: me._id }), 0);

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "1234" });
  assert.equal(loginRes.status, 401);
});

test("회원 탈퇴 시 비밀번호가 틀리면 401을 반환하고 계정은 남아있다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.delete("/api/auth/me").send({ password: "wrong" });
  assert.equal(res.status, 401);

  const User = require("../models/User");
  assert.ok(await User.findOne({ email: "hong@test.com" }));
});

test("회원 탈퇴 시 비밀번호를 안 보내면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.delete("/api/auth/me").send({});
  assert.equal(res.status, 400);
});

test("로그인하지 않은 상태에서 회원 탈퇴는 401을 반환한다", async () => {
  const res = await request(app).delete("/api/auth/me").send({ password: "1234" });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: FAIL (404, 라우트가 없음).

- [ ] **Step 3: 엔드포인트 구현**

`server/routes/auth.js` 상단 import에 `Notification` 모델을 추가한다:

```js
const Notification = require("../models/Notification");
```

`/password` 라우트 다음에 추가한다:

```js
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: "비밀번호를 입력해주세요" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다" });
    }

    await Notification.deleteMany({ user: user._id });
    await user.deleteOne();

    const { maxAge, ...clearCookieOptions } = COOKIE_OPTIONS;
    res.clearCookie(COOKIE_NAME, clearCookieOptions);
    res.json({});
  } catch (err) {
    console.error("회원 탈퇴 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/auth-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/routes/auth.js server/tests/auth-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 회원 탈퇴(DELETE /me) 엔드포인트 추가

비밀번호 확인 후 User 문서와 그 사람의 Notification을 삭제한다.
게시글/댓글/상담 채팅 기록은 상대방 데이터 보존을 위해 지우지 않는다
(대신 Task 4에서 추가한 폴백 표시로 렌더링된다).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 프론트엔드 훅 — 알림 설정 상태 관리 + 알림 필터링

**Files:**
- Modify: `app/hooks/useAuthStatus.tsx`
- Modify: `app/hooks/useNotifications.tsx`

**Interfaces:**
- Produces: `useAuthStatus.tsx`에서 `export type NotificationPrefs = { chatMessages: boolean; systemAlerts: boolean }`, `export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs`, `AuthState`의 `"in"` 케이스에 `notificationPrefs: NotificationPrefs` 필드 추가, `updateNotificationPrefs(patch: Partial<NotificationPrefs>): void`(컨텍스트 값에 추가). Task 7~9가 이 타입/함수를 그대로 사용한다.

- [ ] **Step 1: `useAuthStatus.tsx`에 알림 설정 타입/상태 추가**

`app/hooks/useAuthStatus.tsx`의:

```tsx
export type LoggedInUser = { name: string; role: "counselor" | "client" | "admin" };

export type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | ({ phase: "in" } & LoggedInUser);

type AuthContextValue = {
  state: AuthState;
  /** 로그인/회원가입 성공 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedIn: (user: LoggedInUser) => void;
  /** 로그아웃 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedOut: () => void;
  /** 서버에 현재 세션을 다시 물어본다. */
  refresh: () => Promise<void>;
};
```

를 다음으로 교체한다:

```tsx
export type NotificationPrefs = { chatMessages: boolean; systemAlerts: boolean };

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { chatMessages: true, systemAlerts: true };

export type LoggedInUser = {
  name: string;
  role: "counselor" | "client" | "admin";
  notificationPrefs?: NotificationPrefs;
};

type LoggedInAuth = { name: string; role: "counselor" | "client" | "admin"; notificationPrefs: NotificationPrefs };

export type AuthState = { phase: "loading" } | { phase: "out" } | ({ phase: "in" } & LoggedInAuth);

type AuthContextValue = {
  state: AuthState;
  /** 로그인/회원가입 성공 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedIn: (user: LoggedInUser) => void;
  /** 로그아웃 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedOut: () => void;
  /** 서버에 현재 세션을 다시 물어본다. */
  refresh: () => Promise<void>;
  /** 알림 설정을 낙관적으로 반영하고 서버에 저장한다. 실패하면 refresh()로 되돌린다. */
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
};
```

- [ ] **Step 2: `refresh()`/`setLoggedIn()`이 알림 설정을 채우도록 수정**

```tsx
      const data = (await res.json()) as LoggedInUser;
      if (myGeneration !== generationRef.current || !mountedRef.current) return;
      setState({ phase: "in", name: data.name, role: data.role });
```

를:

```tsx
      const data = (await res.json()) as LoggedInUser;
      if (myGeneration !== generationRef.current || !mountedRef.current) return;
      setState({
        phase: "in",
        name: data.name,
        role: data.role,
        notificationPrefs: data.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      });
```

로, 그리고:

```tsx
  const setLoggedIn = useCallback(
    (user: LoggedInUser) => commit({ phase: "in", name: user.name, role: user.role }),
    [commit],
  );
```

를:

```tsx
  const setLoggedIn = useCallback(
    (user: LoggedInUser) =>
      commit({
        phase: "in",
        name: user.name,
        role: user.role,
        notificationPrefs: user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      }),
    [commit],
  );
```

로 교체한다.

- [ ] **Step 3: `updateNotificationPrefs` 추가**

`setLoggedOut` 정의 다음에 추가한다:

```tsx
  const updateNotificationPrefs = useCallback((patch: Partial<NotificationPrefs>) => {
    generationRef.current += 1;
    setState((prev) =>
      prev.phase === "in" ? { ...prev, notificationPrefs: { ...prev.notificationPrefs, ...patch } } : prev,
    );
    apiFetch("/api/auth/notification-prefs", { method: "PATCH", body: JSON.stringify(patch) })
      .then((res) => {
        if (!res.ok) refresh();
      })
      .catch(() => refresh());
  }, [refresh]);
```

`value`를 만드는 `useMemo`에 추가한다:

```tsx
  const value = useMemo(
    () => ({ state, setLoggedIn, setLoggedOut, refresh }),
    [state, setLoggedIn, setLoggedOut, refresh],
  );
```

를:

```tsx
  const value = useMemo(
    () => ({ state, setLoggedIn, setLoggedOut, refresh, updateNotificationPrefs }),
    [state, setLoggedIn, setLoggedOut, refresh, updateNotificationPrefs],
  );
```

로 교체한다.

- [ ] **Step 4: `useNotifications.tsx`에서 알림 설정으로 필터링**

`app/hooks/useNotifications.tsx` 상단 import에 `DEFAULT_NOTIFICATION_PREFS`를 추가한다:

```tsx
import { useAuthStatus } from "./useAuthStatus";
```

를:

```tsx
import { useAuthStatus, DEFAULT_NOTIFICATION_PREFS } from "./useAuthStatus";
```

로 교체한다. `NotificationsProvider` 내부:

```tsx
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";
```

바로 다음에 추가한다:

```tsx
  const notificationPrefs = auth.phase === "in" ? auth.notificationPrefs : DEFAULT_NOTIFICATION_PREFS;
```

`chatItems`/`serverItems` useMemo를:

```tsx
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
```

다음으로 교체한다:

```tsx
  const chatItems = useMemo<NotificationItem[]>(
    () =>
      notificationPrefs.chatMessages
        ? rooms
            .filter(isRoomUnread)
            .map((r) => ({
              id: `chat:${r.id}`,
              icon: "💬",
              title: `${r.otherPartyName}님이 메시지를 보냈어요`,
              desc: r.lastMessage ?? "",
              time: formatRelativeTime(r.lastMessageAt),
              unread: true,
              href: `/chat/${r.id}`,
            }))
        : [],
    [rooms, isRoomUnread, notificationPrefs.chatMessages],
  );

  const serverItems = useMemo<NotificationItem[]>(
    () =>
      notificationPrefs.systemAlerts ? notifications.map((n) => ({ ...n, time: formatRelativeTime(n.time) })) : [],
    [notifications, notificationPrefs.systemAlerts],
  );
```

- [ ] **Step 5: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 6: 브라우저에서 확인**

```bash
npm run dev
```

로그인 후 `http://localhost:3000/settings`(아직 이전 로컬 state 기반 토글이지만, 콘솔에서 직접 확인 가능): 개발자도구 Network 탭에서 `/api/auth/me` 응답에 `notificationPrefs: { chatMessages: true, systemAlerts: true }`가 오는지 확인한다. (토글 UI 자체는 Task 7에서 연결한다.)

- [ ] **Step 7: 커밋**

```bash
git add app/hooks/useAuthStatus.tsx app/hooks/useNotifications.tsx
git commit -m "$(cat <<'EOF'
feat: useAuthStatus에 알림 설정 상태 추가, useNotifications가 이를 반영해 필터링

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 설정 화면 — 알림 토글 실연동 + 장식용 개인정보 섹션 제거

**Files:**
- Modify: `app/(shell)/settings/page.tsx`

**Interfaces:**
- Consumes: Task 6의 `useAuthStatus().updateNotificationPrefs`, `AuthState`의 `notificationPrefs`.

- [ ] **Step 1: `ToggleRow`를 controlled 컴포넌트로 변경**

```tsx
function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
```

를 다음으로 교체한다:

```tsx
function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      <button
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 알림/개인정보 섹션 교체**

```tsx
export default function SettingsPage() {
  const { state: auth, setLoggedOut } = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggedOut();
      router.push("/");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <SectionCard title="알림">
        <ToggleRow label="새 메시지 알림" defaultOn />
        <ToggleRow label="알림음" defaultOn />
        <ToggleRow label="채팅 알림" defaultOn />
      </SectionCard>

      <SectionCard title="개인정보">
        <ToggleRow label="닉네임 익명 표시" defaultOn />
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">대화 내용 암호화</span>
          <span className="text-xs font-bold text-success">적용 중</span>
        </div>
      </SectionCard>

      <CrisisNotice />

      <SectionCard title="앱 정보">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">버전</span>
          <span className="text-xs text-text-muted">1.0.0 (Web)</span>
        </div>
      </SectionCard>

      {auth.phase === "in" && (
        <SectionCard title="계정">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
          >
            로그아웃
          </button>
        </SectionCard>
      )}
    </div>
  );
}
```

를 다음으로 교체한다(계정 섹션은 Task 8~9에서 비밀번호 변경/회원 탈퇴가 추가될 자리를 주석으로 표시해둔다):

```tsx
export default function SettingsPage() {
  const { state: auth, setLoggedOut, updateNotificationPrefs } = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggedOut();
      router.push("/");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      {auth.phase === "in" && (
        <SectionCard title="알림">
          <ToggleRow
            label="새 메시지 알림"
            on={auth.notificationPrefs.chatMessages}
            onChange={(v) => updateNotificationPrefs({ chatMessages: v })}
          />
          <ToggleRow
            label="신고 처리 알림"
            on={auth.notificationPrefs.systemAlerts}
            onChange={(v) => updateNotificationPrefs({ systemAlerts: v })}
          />
        </SectionCard>
      )}

      <CrisisNotice />

      <SectionCard title="앱 정보">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">버전</span>
          <span className="text-xs text-text-muted">1.0.0 (Web)</span>
        </div>
      </SectionCard>

      {auth.phase === "in" && (
        <SectionCard title="계정">
          <div className="border-b border-border">
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
            >
              로그아웃
            </button>
          </div>
          {/* Task 8: 비밀번호 변경, Task 9: 회원 탈퇴가 여기 추가됨 */}
        </SectionCard>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/settings/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 4: 브라우저에서 확인**

```bash
npm run dev
```

로그인 후 `http://localhost:3000/settings`에서 "새 메시지 알림"을 끄고 새로고침해도 꺼진 상태가 유지되는지(서버에 저장됐다는 뜻) 확인한다. 다른 탭/시크릿창에서 같은 계정으로 로그인해 채팅 메시지를 하나 보내고, 알림을 끈 쪽 벨에 배지가 안 뜨는지도 확인한다. "닉네임 익명 표시"/"대화 내용 암호화" 행이 더 이상 없는지, 로그아웃 상태에서는 "알림"/"계정" 섹션 자체가 안 보이는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 설정 화면 알림 토글을 실제 서버 저장/알림 필터링에 연결, 장식용 개인정보 섹션 제거

"알림음"은 앱에 소리 재생 기능 자체가 없어 제거. "닉네임 익명 표시"와
"대화 내용 암호화 적용 중"은 실제 로직 없이 표시만 하던 항목이라 제거.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 설정 화면 — 비밀번호 변경 폼

**Files:**
- Modify: `app/(shell)/settings/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `PATCH /api/auth/password`.

- [ ] **Step 1: import에 `FormEvent` 타입 추가**

```tsx
import { useState } from "react";
```

를:

```tsx
import { useState, type FormEvent } from "react";
```

로 교체한다.

- [ ] **Step 2: 상태 + 제출 핸들러 추가**

`SettingsPage` 함수 내부, `const router = useRouter();` 다음에 추가한다:

```tsx
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function submitPasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("새 비밀번호가 일치하지 않아요");
      return;
    }
    const res = await apiFetch("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPasswordError(data.error ?? "비밀번호 변경에 실패했어요");
      return;
    }
    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      setPasswordSuccess(false);
      setShowPasswordForm(false);
    }, 1500);
  }
```

- [ ] **Step 3: 계정 섹션에 비밀번호 변경 행 추가**

Task 7에서 남겨둔 주석:

```tsx
          {/* Task 8: 비밀번호 변경, Task 9: 회원 탈퇴가 여기 추가됨 */}
```

를 다음으로 교체한다:

```tsx
          <div className="border-b border-border">
            <button
              onClick={() => setShowPasswordForm((v) => !v)}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-text"
            >
              비밀번호 변경
            </button>
            {showPasswordForm && (
              <form onSubmit={submitPasswordChange} className="flex flex-col gap-2 px-5 pb-4">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (4자 이상)"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호 확인"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                {passwordError && <p className="text-xs font-semibold text-danger">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs font-semibold text-success">변경됐어요</p>}
                <button type="submit" className="mt-1 w-full rounded-lg bg-primary-dark py-2 text-sm font-bold text-white">
                  변경하기
                </button>
              </form>
            )}
          </div>
          {/* Task 9: 회원 탈퇴가 여기 추가됨 */}
```

- [ ] **Step 4: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/settings/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 5: 브라우저에서 확인**

로그인 후 `/settings`에서 "비밀번호 변경"을 클릭해 폼을 펼친다. 현재 비밀번호를 틀리게 입력하면 에러 메시지가 뜨는지, 새 비밀번호/확인이 다르면 클라이언트에서 즉시 에러가 뜨는지, 올바르게 입력하면 "변경됐어요"가 뜨고 폼이 접히는지 확인한다. 로그아웃 후 새 비밀번호로 다시 로그인되는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/(shell)/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 설정 화면에 비밀번호 변경 폼 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 설정 화면 — 회원 탈퇴 폼

**Files:**
- Modify: `app/(shell)/settings/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `DELETE /api/auth/me`, `useAuthStatus().setLoggedOut`.

- [ ] **Step 1: 상태 + 제출 핸들러 추가**

Task 8에서 추가한 `submitPasswordChange` 함수 다음에 추가한다:

```tsx
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function submitDeleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    const res = await apiFetch("/api/auth/me", {
      method: "DELETE",
      body: JSON.stringify({ password: deletePassword }),
    });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "회원 탈퇴에 실패했어요");
      return;
    }
    setLoggedOut();
    router.push("/");
  }
```

- [ ] **Step 2: 계정 섹션에 회원 탈퇴 행 추가**

Task 8에서 남겨둔 주석:

```tsx
          {/* Task 9: 회원 탈퇴가 여기 추가됨 */}
```

를 다음으로 교체한다:

```tsx
          <div>
            <button
              onClick={() => setShowDeleteForm((v) => !v)}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
            >
              회원 탈퇴
            </button>
            {showDeleteForm && (
              <form onSubmit={submitDeleteAccount} className="flex flex-col gap-2 px-5 pb-4">
                <p className="text-xs text-text-muted">탈퇴하면 되돌릴 수 없어요. 계정 확인을 위해 비밀번호를 입력해주세요.</p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="비밀번호"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-danger"
                />
                {deleteError && <p className="text-xs font-semibold text-danger">{deleteError}</p>}
                <button
                  type="submit"
                  disabled={deleting}
                  className="mt-1 w-full rounded-lg bg-danger py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  탈퇴하기
                </button>
              </form>
            )}
          </div>
```

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 4: 브라우저에서 확인**

테스트용 계정으로 회원가입 후 로그인, `/settings`에서 "회원 탈퇴"를 클릭해 폼을 펼친다. 비밀번호를 틀리게 입력하면 에러가 뜨는지, 올바르게 입력하면 홈으로 리다이렉트되고 로그아웃 상태가 되는지 확인한다. 같은 이메일/비밀번호로 다시 로그인을 시도해 실패하는지 확인한다. 이 계정이 커뮤니티에 남긴 게시글이 있다면, 다른 계정으로 봤을 때 작성자가 "(탈퇴한 회원)"로 정상 표시되는지도 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/settings/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 설정 화면에 회원 탈퇴 폼 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~9가 모두 커밋된 상태의 `main` 브랜치.

- [ ] **Step 1: 백엔드 전체 테스트**

```bash
cd server && node --test
```

Expected: 전부 PASS.

- [ ] **Step 2: 프론트엔드 빌드 재확인**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 3: main 푸시**

```bash
git push origin main
```

- [ ] **Step 4: 배포 상태 확인**

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<위에서 나온 커밋 해시>/status"
```

Expected: Vercel + Railway 모두 `"state": "success"`.

- [ ] **Step 5: 프로덕션에서 수동 확인**

`https://create-club.vercel.app/settings`에서: 알림 토글 저장/알림 실제 반영, 비밀번호 변경, (테스트용 부계정으로) 회원 탈퇴 후 재로그인 불가, 탈퇴 전 그 계정이 커뮤니티에 남긴 글이 "(탈퇴한 회원)"로 정상 표시되는지 확인한다.

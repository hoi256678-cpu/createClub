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
let Post;
let Report;
let ChatRoom;
let Notification;
let TestResult;
let signToken;
let COOKIE_NAME;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Post = require("../models/Post");
  Report = require("../models/Report");
  ChatRoom = require("../models/ChatRoom");
  Notification = require("../models/Notification");
  TestResult = require("../models/TestResult");
  ({ signToken, COOKIE_NAME } = require("../lib/token"));
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function createAdmin(overrides = {}) {
  return User.create({
    name: "관리자",
    email: overrides.email ?? "admin@test.com",
    passwordHash: "x",
    role: "admin",
  });
}

function adminCookie(admin) {
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  return `${COOKIE_NAME}=${token}`;
}

async function signupClient(agent, overrides = {}) {
  const payload = {
    name: "고민청소년",
    email: overrides.email ?? "client@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("비로그인 상태로 사용자 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/users");
  assert.equal(res.status, 401);
});

test("admin이 아닌 로그인 사용자가 사용자 목록을 조회하면 403을 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent.get("/api/admin/users");
  assert.equal(res.status, 403);
});

test("JWT에는 admin 클레임이 있지만 실제 DB role이 client인 사용자는 관리자 라우트에서 403을 반환한다", async () => {
  const client = await User.create({ name: "위조클레임", email: "forged@test.com", passwordHash: "x", role: "client" });
  const forgedToken = signToken({ id: client._id.toString(), role: "admin" });
  const res = await request(app)
    .get("/api/admin/users")
    .set("Cookie", `${COOKIE_NAME}=${forgedToken}`);
  assert.equal(res.status, 403);
});

test("admin은 전체 사용자 목록을 조회할 수 있고 passwordHash는 없다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app).get("/api/admin/users").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.ok(res.body.every((u) => u.passwordHash === undefined));
  const client = res.body.find((u) => u.email === "c1@test.com");
  assert.equal(client.role, "client");
  assert.equal(client.suspended, false);
});

test("role 쿼리로 사용자 목록을 필터링할 수 있다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app)
    .get("/api/admin/users?role=client")
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].email, "c1@test.com");
});

test("admin이 사용자를 정지시키면 suspended가 true가 되고, 다시 누르면 false로 돌아간다", async () => {
  const admin = await createAdmin();
  const client = await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const suspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(suspendRes.status, 200);
  assert.deepEqual(suspendRes.body, { suspended: true });

  const unsuspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.deepEqual(unsuspendRes.body, { suspended: false });
});

test("존재하지 않는 사용자를 정지시키면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/users/${missingId}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("admin 계정을 정지시키려 하면 400을 반환하고 정지되지 않는다", async () => {
  const admin = await createAdmin();
  const targetAdmin = await createAdmin({ email: "target-admin@test.com" });

  const res = await request(app)
    .post(`/api/admin/users/${targetAdmin._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: "관리자 계정은 정지할 수 없어요" });

  const updated = await User.findById(targetAdmin._id);
  assert.equal(updated.suspended, false);
});

test("admin이 client를 정지시키면, 정지된 client는 올바른 비밀번호로도 로그인이 403으로 차단된다", async () => {
  const admin = await createAdmin();
  const agent = request.agent(app);
  const payload = await signupClient(agent, { email: "to-suspend@test.com" });
  await agent.post("/api/auth/logout");

  const client = await User.findOne({ email: payload.email });
  const suspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(suspendRes.status, 200);
  assert.deepEqual(suspendRes.body, { suspended: true });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: payload.email, password: payload.password });
  assert.equal(loginRes.status, 403);
  assert.deepEqual(loginRes.body, { error: "정지된 계정이에요. 관리자에게 문의해주세요." });
});

async function createPost(overrides = {}) {
  const author =
    overrides.authorId ??
    (await User.create({ name: "글쓴이", email: "author@test.com", passwordHash: "x", role: "client" }))._id;
  return Post.create({
    author,
    tag: "고민",
    title: overrides.title ?? "제목",
    body: overrides.body ?? "내용",
    ...overrides.rest,
  });
}

test("비로그인 상태로 관리자 게시글 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/posts");
  assert.equal(res.status, 401);
});

test("admin은 전체 게시글 목록을 댓글과 함께 조회할 수 있다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "댓글입니다" });
  await post.save();

  const res = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "제목");
  assert.equal(res.body[0].comments.length, 1);
  assert.equal(res.body[0].comments[0].text, "댓글입니다");
});

test("admin이 게시글을 삭제하면 목록에서 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(listRes.body.length, 0);
});

test("존재하지 않는 게시글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .delete(`/api/admin/posts/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("admin이 댓글 하나를 삭제하면 게시글에는 남고 그 댓글만 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "지울 댓글" });
  post.comments.push({ author: commenter._id, text: "남길 댓글" });
  await post.save();
  const toDelete = post.comments[0]._id.toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${toDelete}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const updated = await Post.findById(post._id);
  assert.equal(updated.comments.length, 1);
  assert.equal(updated.comments[0].text, "남길 댓글");
});

test("존재하지 않는 댓글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const missingCommentId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${missingCommentId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

async function createReport(overrides = {}) {
  const reporter = await User.create({ name: "신고자", email: overrides.reporterEmail ?? "reporter@test.com", passwordHash: "x", role: "client" });
  const counselor = await User.create({ name: "상담사", email: overrides.counselorEmail ?? "reported@test.com", passwordHash: "x", role: "counselor" });
  const room = await ChatRoom.create({ client: reporter._id, counselor: counselor._id, status: "reported" });
  return Report.create({
    reporter: reporter._id,
    room: room._id,
    counselor: counselor._id,
    reason: overrides.reason ?? "부적절한 발언",
    status: overrides.status ?? "open",
  });
}

test("비로그인 상태로 신고 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/reports");
  assert.equal(res.status, 401);
});

test("admin은 신고 목록을 조회할 수 있다", async () => {
  const admin = await createAdmin();
  await createReport();

  const res = await request(app).get("/api/admin/reports").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].reason, "부적절한 발언");
  assert.equal(res.body[0].status, "open");
  assert.equal(res.body[0].reporterName, "신고자");
  assert.equal(res.body[0].counselorName, "상담사");
});

test("status 쿼리로 신고 목록을 필터링할 수 있다", async () => {
  const admin = await createAdmin();
  await createReport({ reporterEmail: "r1@test.com", counselorEmail: "c1@test.com", status: "open" });
  await createReport({ reporterEmail: "r2@test.com", counselorEmail: "c2@test.com", status: "reviewed" });

  const res = await request(app).get("/api/admin/reports?status=open").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "open");
});

test("admin이 신고를 처리 완료로 표시하면 status가 reviewed로 바뀐다", async () => {
  const admin = await createAdmin();
  const report = await createReport();

  const res = await request(app)
    .post(`/api/admin/reports/${report._id}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "reviewed");

  const updated = await Report.findById(report._id);
  assert.equal(updated.status, "reviewed");
});

test("존재하지 않는 신고를 처리하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/reports/${missingId}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

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

test("이미 처리된 신고를 다시 처리해도 알림이 중복 생성되지 않는다", async () => {
  const admin = await createAdmin();
  const report = await createReport();

  const firstRes = await request(app)
    .post(`/api/admin/reports/${report._id}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(firstRes.status, 200);
  assert.equal(firstRes.body.status, "reviewed");

  const secondRes = await request(app)
    .post(`/api/admin/reports/${report._id}/review`)
    .set("Cookie", adminCookie(admin));
  assert.equal(secondRes.status, 200);
  assert.equal(secondRes.body.status, "reviewed");

  const notifications = await Notification.find({ user: report.reporter });
  assert.equal(notifications.length, 1);
});

async function createPendingCounselor(overrides = {}) {
  return User.create({
    name: overrides.name ?? "대기상담사",
    email: overrides.email ?? "pending@test.com",
    passwordHash: "x",
    role: "counselor",
    counselorProfile: {
      major: "심리학과 2학년",
      bio: "소개글",
      specialties: ["학업"],
      verified: false,
      ...overrides.counselorProfile,
    },
  });
}

test("비로그인 상태로 승인 대기 상담사 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/counselors/pending");
  assert.equal(res.status, 401);
});

test("admin은 등록 폼을 제출한(major가 있는) 미승인 상담사만 조회한다", async () => {
  const admin = await createAdmin();
  await createPendingCounselor();
  // 가입만 하고 등록 폼은 제출하지 않은 상담사 (major 없음) — 대기 목록에 나오면 안 됨
  await User.create({ name: "미등록상담사", email: "unregistered@test.com", passwordHash: "x", role: "counselor" });
  // 이미 승인된 상담사 — 대기 목록에 나오면 안 됨
  await createPendingCounselor({ email: "verified@test.com", counselorProfile: { verified: true } });

  const res = await request(app).get("/api/admin/counselors/pending").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "대기상담사");
  assert.equal(res.body[0].major, "심리학과 2학년");
  assert.deepEqual(res.body[0].specialties, ["학업"]);
});

test("admin이 승인하면 verified가 true가 되고 상담사 목록에 노출된다", async () => {
  const admin = await createAdmin();
  const pending = await createPendingCounselor();

  const res = await request(app)
    .post(`/api/admin/counselors/${pending._id}/approve`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].name, "대기상담사");
});

test("존재하지 않는 상담사를 승인하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/counselors/${missingId}/approve`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("신고자 계정이 삭제돼도 admin 신고 목록 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const admin = await createAdmin();
  await createReport({ reporterEmail: "gone@test.com" });

  await User.findOneAndDelete({ email: "gone@test.com" });

  const res = await request(app).get("/api/admin/reports").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body[0].reporterName, "(탈퇴한 회원)");
});

test("admin이 사용자를 삭제하면 계정/알림/심리검사 결과가 삭제되고 활성 상담방은 종료된다", async () => {
  const admin = await createAdmin();
  const target = await User.create({
    name: "삭제될유저",
    email: "delete-target@test.com",
    passwordHash: "x",
    role: "client",
  });
  const counselor = await createPendingCounselor({ email: "counselor-for-delete@test.com" });
  const room = await ChatRoom.create({ client: target._id, counselor: counselor._id, status: "active" });
  await Notification.create({
    user: target._id,
    type: "report_reviewed",
    icon: "📮",
    title: "제목",
    desc: "설명",
  });
  await TestResult.create({
    user: target._id,
    type: "pss",
    title: "스트레스 검사",
    score: 10,
    label: "보통",
    color: "#000000",
    needsSupport: false,
  });

  const res = await request(app)
    .delete(`/api/admin/users/${target._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  assert.equal(await User.findById(target._id), null);
  assert.equal(await Notification.countDocuments({ user: target._id }), 0);
  assert.equal(await TestResult.countDocuments({ user: target._id }), 0);

  const updatedRoom = await ChatRoom.findById(room._id);
  assert.equal(updatedRoom.status, "ended");
});

test("admin 계정은 이 엔드포인트로 삭제할 수 없다", async () => {
  const admin = await createAdmin();
  const otherAdmin = await createAdmin({ email: "other-admin@test.com" });

  const res = await request(app)
    .delete(`/api/admin/users/${otherAdmin._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 400);

  assert.ok(await User.findById(otherAdmin._id));
});

test("존재하지 않는 사용자를 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/api/admin/users/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("비로그인 상태로 사용자 삭제를 시도하면 401을 반환한다", async () => {
  const target = await User.create({
    name: "타겟",
    email: "target-unauth@test.com",
    passwordHash: "x",
    role: "client",
  });

  const res = await request(app).delete(`/api/admin/users/${target._id}`);
  assert.equal(res.status, 401);

  assert.ok(await User.findById(target._id));
});

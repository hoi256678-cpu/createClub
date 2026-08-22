const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const Report = require("../models/Report");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;
let User;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function createCounselor(overrides = {}) {
  return User.create({
    name: "이지원",
    email: overrides.email ?? "counselor1@test.com",
    passwordHash: "x",
    role: "counselor",
    counselorProfile: {
      major: "상담심리학과 4학년",
      bio: "시험 불안과 진로 고민을 많이 들어왔어요.",
      avatarBg: "#e8eff9",
      avatarColor: "#7a9cc5",
      specialties: ["학업", "진로"],
      rating: 4.9,
      ratingCount: 38,
      sessionCount: 112,
      recentSessions: 9,
      online: true,
      verified: true,
      ...overrides.counselorProfile,
    },
  });
}

test("상담사 목록은 비로그인 상태로도 조회할 수 있다", async () => {
  await createCounselor();
  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "이지원");
  assert.equal(res.body[0].major, "상담심리학과 4학년");
  assert.equal(res.body[0].intro, "시험 불안과 진로 고민을 많이 들어왔어요.");
  assert.deepEqual(res.body[0].tags, ["학업", "진로"]);
  assert.equal(res.body[0].rating, 4.9);
  assert.equal(res.body[0].reviewCount, 38);
  assert.equal(res.body[0].sessionCount, 112);
  assert.equal(res.body[0].recentSessions, 9);
  assert.equal(res.body[0].online, true);
});

test("client 역할 User는 상담사 목록에 나오지 않는다", async () => {
  await createCounselor();
  await User.create({ name: "내담자", email: "client@test.com", passwordHash: "x", role: "client" });

  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
});

test("상담사 상세를 id로 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const res = await request(app).get(`/api/counselors/${counselor._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "이지원");
});

test("존재하지 않는 상담사 id를 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/counselors/${missingId}`);
  assert.equal(res.status, 404);
});

test("형식이 잘못된 상담사 id를 조회하면 404를 반환한다", async () => {
  const res = await request(app).get("/api/counselors/not-an-id");
  assert.equal(res.status, 404);
});

test("client 역할 User의 id로 상담사 상세를 조회하면 404를 반환한다", async () => {
  const client = await User.create({ name: "내담자", email: "client2@test.com", passwordHash: "x", role: "client" });
  const res = await request(app).get(`/api/counselors/${client._id}`);
  assert.equal(res.status, 404);
});

test("검증되지 않은 상담사는 목록/상세에 노출되지 않는다", async () => {
  const unverified = await createCounselor({
    email: "unverified@test.com",
    counselorProfile: { verified: false },
  });

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 0);

  const detailRes = await request(app).get(`/api/counselors/${unverified._id}`);
  assert.equal(detailRes.status, 404);
});

test("정지된 상담사는 검증 여부와 관계없이 목록에 노출되지 않는다", async () => {
  const suspended = await createCounselor({ email: "suspended@test.com" });
  suspended.suspended = true;
  await suspended.save();

  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);
});

async function signupClient(agent, overrides = {}) {
  const payload = {
    name: "내담자",
    email: "client@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

const { signToken, COOKIE_NAME } = require("../lib/token");

function counselorCookie(counselor) {
  const token = signToken({ id: counselor._id.toString(), role: "counselor" });
  return `${COOKIE_NAME}=${token}`;
}

test("로그인한 클라이언트가 상담사에게 신청하면 방이 생성되지만 상담사 통계는 아직 바뀌지 않는다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);

  const res = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(res.status, 201);
  assert.equal(res.body.otherPartyId, counselor._id.toString());
  assert.equal(res.body.otherPartyName, "이지원");
  assert.equal(res.body.viewerSide, "client");
  assert.equal(res.body.status, "active");

  // 통계는 실제 메시지가 오간 뒤 종료할 때 반영된다 (신청 시점에는 반영되지 않음)
  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.sessionCount, 112);
  assert.equal(updated.counselorProfile.recentSessions, 9);
});

test("비로그인 상태로 상담을 신청하면 401을 반환한다", async () => {
  const counselor = await createCounselor();
  const res = await request(app).post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(res.status, 401);
});

test("이미 활성 방이 있는데 다시 신청하면 409를 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 409);
});

test("존재하지 않는 상담사에게 신청하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: missingId });
  assert.equal(res.status, 404);
});

test("정지된 상담사에게 상담을 신청하면 404를 반환한다", async () => {
  const suspended = await createCounselor({ email: "suspended2@test.com" });
  suspended.suspended = true;
  await suspended.save();

  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: suspended._id.toString() });
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "상담사를 찾을 수 없어요" });
});

test("상담사가 자기 자신에게 상담을 신청하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "셀프상담사", email: "self-counselor@test.com", password: "1234", role: "counselor" });
  const meRes = await agent.get("/api/counselors/me");
  const myId = meRes.body.id;

  const res = await agent.post("/api/counseling/rooms").send({ counselorId: myId });
  assert.equal(res.status, 400);
});

test("내 채팅방 목록을 조회할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "active");
});

test("남의 채팅방 상세를 조회하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const otherAgent = request.agent(app);
  await signupClient(otherAgent, { email: "other-client@test.com" });
  const res = await otherAgent.get(`/api/counseling/rooms/${createRes.body.id}`);
  assert.equal(res.status, 403);
});

test("메시지를 보내면 방 상세에서 조회된다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const msgRes = await agent
    .post(`/api/counseling/rooms/${createRes.body.id}/messages`)
    .send({ text: "안녕하세요" });
  assert.equal(msgRes.status, 201);
  assert.equal(msgRes.body.length, 1);
  assert.equal(msgRes.body[0].text, "안녕하세요");
  assert.equal(msgRes.body[0].from, "client");

  const detailRes = await agent.get(`/api/counseling/rooms/${createRes.body.id}`);
  assert.equal(detailRes.body.messages.length, 1);
  assert.equal(detailRes.body.lastMessage, "안녕하세요");
});

test("빈 메시지를 보내면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "  " });
  assert.equal(res.status, 400);
});

test("평점과 함께 종료하면 상담사 평점이 갱신되고 방 상태가 ended가 된다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, 5);

  const updated = await User.findById(counselor._id);
  // (4.0*1 + 5) / 2 = 4.5
  assert.equal(updated.counselorProfile.rating, 4.5);
  assert.equal(updated.counselorProfile.ratingCount, 2);
});

test("평점 없이 종료하면 상담사 평점은 그대로다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, null);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
});

test("메시지를 보낸 뒤 종료하면 (평점 없이도) 상담사 sessionCount/recentSessions가 증가한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});
  assert.equal(res.status, 200);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.sessionCount, 113);
  assert.equal(updated.counselorProfile.recentSessions, 10);
});

test("메시지 없이 평점과 함께 종료해도 상담사 통계와 평점이 바뀌지 않는다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 5 });
  assert.equal(res.status, 200);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.9);
  assert.equal(updated.counselorProfile.ratingCount, 38);
  assert.equal(updated.counselorProfile.sessionCount, 112);
  assert.equal(updated.counselorProfile.recentSessions, 9);
});

test("종료 후 다시 신청할 수 있다 (배정 해제됨)", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 201);
});

test("범위를 벗어난 평점으로 종료하면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 6 });
  assert.equal(res.status, 400);
});

test("신고하면 방이 reported 상태가 되고 다시 신청할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const reportRes = await agent
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(reportRes.status, 200);
  assert.equal(reportRes.body.status, "reported");

  const secondCounselor = await createCounselor({ email: "counselor2@test.com" });
  const res = await agent.post("/api/counseling/rooms").send({ counselorId: secondCounselor._id.toString() });
  assert.equal(res.status, 201);
});

test("사유 없이 신고하면 400을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/report`).send({ reason: "  " });
  assert.equal(res.status, 400);
});

test("종료된 방에는 메시지를 보낼 수 없다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕" });
  assert.equal(res.status, 400);
});

test("신고해도 상담사 평점은 바뀌지 않고, Report 문서가 올바른 필드로 생성된다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const beforeReport = await User.findById(counselor._id);

  const reportRes = await agent
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(reportRes.status, 200);

  const afterReport = await User.findById(counselor._id);
  assert.equal(afterReport.counselorProfile.rating, beforeReport.counselorProfile.rating);
  assert.equal(afterReport.counselorProfile.ratingCount, beforeReport.counselorProfile.ratingCount);

  const report = await Report.findOne({ room: createRes.body.id });
  assert.ok(report, "Report 문서가 생성되어야 한다");
  const clientUser = await User.findOne({ email: "client@test.com" });
  assert.equal(report.reporter.toString(), clientUser._id.toString());
  assert.equal(report.room.toString(), createRes.body.id);
  assert.equal(report.counselor.toString(), counselor._id.toString());
  assert.equal(report.reason, "부적절한 발언을 했어요");
});

test("방 소유자가 아닌 클라이언트가 메시지를 보내면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const otherAgent = request.agent(app);
  await signupClient(otherAgent, { email: "other-client@test.com" });
  const res = await otherAgent
    .post(`/api/counseling/rooms/${createRes.body.id}/messages`)
    .send({ text: "몰래 보내는 메시지" });
  assert.equal(res.status, 403);
});

test("방 소유자가 아닌 클라이언트가 종료를 요청하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const otherAgent = request.agent(app);
  await signupClient(otherAgent, { email: "other-client@test.com" });
  const res = await otherAgent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});
  assert.equal(res.status, 403);
});

test("방 소유자가 아닌 클라이언트가 신고를 요청하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const otherAgent = request.agent(app);
  await signupClient(otherAgent, { email: "other-client@test.com" });
  const res = await otherAgent
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(res.status, 403);
});

test("상담사도 신고할 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .set("Cookie", counselorCookie(counselor))
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "reported");

  const report = await Report.findOne({ room: createRes.body.id });
  assert.ok(report, "Report 문서가 생성되어야 한다");
  assert.equal(report.reporter.toString(), counselor._id.toString());
});

test("당사자가 아닌 상담사가 신고를 요청하면 403을 반환한다", async () => {
  const counselor = await createCounselor();
  const otherCounselor = await createCounselor({ email: "counselor2@test.com" });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/report`)
    .set("Cookie", counselorCookie(otherCounselor))
    .send({ reason: "부적절한 발언을 했어요" });
  assert.equal(res.status, 403);
});

test("클라이언트가 방 목록을 조회하면 otherPartyName이 상담사 이름/전공이다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await agent.get("/api/counseling/rooms");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].otherPartyName, "이지원");
  assert.equal(res.body[0].otherPartyMajor, "상담심리학과 4학년");
  assert.equal(res.body[0].viewerSide, "client");
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
  assert.equal(res.body[0].viewerSide, "counselor");

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
  assert.equal(res.body.viewerSide, "counselor");
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

test("상담사가 잘못된 평점과 함께 종료하면 무시되고 200을 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(counselor))
    .send({ rating: 10 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, null);
});

test("상담사가 메시지 없이 상담을 종료하면 세션 카운트와 평점이 바뀌지 않는다", async () => {
  const counselor = await createCounselor({ counselorProfile: { rating: 4.0, ratingCount: 1 } });
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .post(`/api/counseling/rooms/${createRes.body.id}/end`)
    .set("Cookie", counselorCookie(counselor))
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
  assert.equal(updated.counselorProfile.sessionCount, 112);
  assert.equal(updated.counselorProfile.recentSessions, 9);
});

async function createFreshCounselor(overrides = {}) {
  return User.create({
    name: "새상담사",
    email: overrides.email ?? "fresh-counselor@test.com",
    passwordHash: "x",
    role: "counselor",
  });
}

test("갓 가입한(미등록) 상담사는 상담사 목록에 나오지 않는다", async () => {
  await createFreshCounselor();
  const res = await request(app).get("/api/counselors");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);
});

test("client 계정이 /counselors/me를 조회하면 403을 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent.get("/api/counselors/me");
  assert.equal(res.status, 403);
});

test("상담사가 자신의(비어있는) 프로필을 /counselors/me로 조회할 수 있다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app).get("/api/counselors/me").set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.equal(res.body.major, "");
  assert.deepEqual(res.body.specialties, []);
  assert.equal(res.body.verified, false);
});

test("신규 상담사가 등록하면 verified가 false로 대기 상태가 되고 목록에 노출되지 않는다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({
      name: "새이름상담사",
      major: "심리학과 2학년",
      year: "2학년",
      bio: "천천히 들어드릴게요",
      specialties: ["학업", "관계"],
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, false);
  assert.equal(res.body.id, counselor._id.toString());
  assert.equal(res.body.name, "새이름상담사");

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 0);

  const meRes = await request(app).get("/api/counselors/me").set("Cookie", counselorCookie(counselor));
  assert.equal(meRes.body.name, "새이름상담사");
  assert.equal(meRes.body.major, "심리학과 2학년");
  assert.equal(meRes.body.verified, false);
});

test("이미 승인된 상담사가 프로필을 수정해도 verified가 유지된다", async () => {
  const counselor = await createFreshCounselor({ email: "verified-counselor@test.com" });
  await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "기존상담사", major: "심리학과 3학년", year: "3학년", bio: "소개", specialties: ["학업"] });

  const User = require("../models/User");
  await User.findByIdAndUpdate(counselor._id, { "counselorProfile.verified": true });

  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({
      name: "기존상담사",
      major: "심리학과 3학년",
      year: "3학년",
      bio: "수정된 소개",
      specialties: ["학업", "진로"],
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.verified, true);

  const listRes = await request(app).get("/api/counselors");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].intro, "수정된 소개");
});

test("client 계정이 상담사 등록을 시도하면 403을 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent
    .post("/api/counselors/register")
    .send({ name: "x", major: "x", bio: "y", specialties: ["학업"] });
  assert.equal(res.status, 403);
});

test("이름 없이 등록하면 400을 반환한다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "  ", major: "심리학과", bio: "안녕하세요", specialties: ["학업"] });
  assert.equal(res.status, 400);
});

test("전공 없이 등록하면 400을 반환한다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "새상담사", major: "  ", bio: "안녕하세요", specialties: ["학업"] });
  assert.equal(res.status, 400);
});

test("태그 없이 등록하면 400을 반환한다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "새상담사", major: "심리학과", bio: "안녕하세요", specialties: [] });
  assert.equal(res.status, 400);
});

test("허용되지 않은 태그로 등록하면 400을 반환한다", async () => {
  const counselor = await createFreshCounselor();
  const res = await request(app)
    .post("/api/counselors/register")
    .set("Cookie", counselorCookie(counselor))
    .send({ name: "새상담사", major: "심리학과", bio: "안녕하세요", specialties: ["없는태그"] });
  assert.equal(res.status, 400);
});

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

test("상담사가 탈퇴한 뒤에도 클라이언트가 상담을 종료할 수 있다 (500 대신 200)", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/messages`).send({ text: "안녕하세요" });

  await User.findOneAndDelete({ _id: counselor._id });

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({ rating: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
});

test("serializeRoom은 populate를 빠뜨려 client/counselor가 raw ObjectId인 경우 여전히 throw한다", () => {
  const { serializeRoom } = require("../routes/counseling");

  const viewerId = new mongoose.Types.ObjectId().toString();
  const fakeRoom = {
    _id: new mongoose.Types.ObjectId(),
    // populate를 호출하지 않았을 때 client는 이렇게 이름 없는 raw ObjectId로 남는다 —
    // "탈퇴한 회원"이라 정상적으로 null이 되는 경우와는 달리, 이는 프로그래밍 실수다.
    client: new mongoose.Types.ObjectId(),
    counselor: { _id: new mongoose.Types.ObjectId(), name: "이지원", counselorProfile: {} },
    messages: [],
    status: "active",
    createdAt: new Date(),
  };

  assert.throws(() => serializeRoom(fakeRoom, viewerId), /populate/);
});

const MoodEntry = require("../models/MoodEntry");

test("상담사는 활성 상담방에서 공유 동의한 클라이언트의 최근 기분 기록을 볼 수 있다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  await agent.patch("/api/mood/share").send({ enabled: true });
  const client = await User.findOne({ email: "client@test.com" });
  await MoodEntry.create({ user: client._id, date: "2026-08-20", score: 3, note: "", checks: [] });
  await MoodEntry.create({ user: client._id, date: "2026-08-21", score: 5, note: "좋았다", checks: ["sleep"] });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.entries.map((e) => e.date),
    ["2026-08-20", "2026-08-21"]
  );
  assert.equal(res.body.entries[1].note, "좋았다");
});

test("클라이언트가 공유하지 않았으면 403과 shareDisabled를 반환한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 403);
  assert.equal(res.body.shareDisabled, true);
});

test("종료된 상담방에서는 상담사가 기분 기록을 볼 수 없다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.patch("/api/mood/share").send({ enabled: true });
  await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});

  const res = await request(app)
    .get(`/api/counseling/rooms/${createRes.body.id}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 403);
  assert.notEqual(res.body.shareDisabled, true);
});

test("클라이언트 본인은 이 엔드포인트로 조회할 수 없다(상담사 전용)", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);
  const createRes = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  await agent.patch("/api/mood/share").send({ enabled: true });

  const res = await agent.get(`/api/counseling/rooms/${createRes.body.id}/mood`);
  assert.equal(res.status, 403);
});

test("존재하지 않는 방을 조회하면 404를 반환한다", async () => {
  const counselor = await createCounselor();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .get(`/api/counseling/rooms/${missingId}/mood`)
    .set("Cookie", counselorCookie(counselor));
  assert.equal(res.status, 404);
});

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

test("로그인한 클라이언트가 상담사에게 신청하면 방이 생성되고 상담사 통계가 증가한다", async () => {
  const counselor = await createCounselor();
  const agent = request.agent(app);
  await signupClient(agent);

  const res = await agent.post("/api/counseling/rooms").send({ counselorId: counselor._id.toString() });
  assert.equal(res.status, 201);
  assert.equal(res.body.counselorId, counselor._id.toString());
  assert.equal(res.body.counselorName, "이지원");
  assert.equal(res.body.status, "active");

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.sessionCount, 113);
  assert.equal(updated.counselorProfile.recentSessions, 10);
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

  const res = await agent.post(`/api/counseling/rooms/${createRes.body.id}/end`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ended");
  assert.equal(res.body.rating, null);

  const updated = await User.findById(counselor._id);
  assert.equal(updated.counselorProfile.rating, 4.0);
  assert.equal(updated.counselorProfile.ratingCount, 1);
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

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
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

const sampleResult = {
  type: "stress",
  title: "스트레스 검사 (PSS)",
  score: 30,
  label: "높은 스트레스",
  color: "#E05252",
  needsSupport: true,
};

test("비로그인 상태로 검사 결과를 저장하면 401을 반환한다", async () => {
  const res = await request(app).post("/api/test/results").send(sampleResult);
  assert.equal(res.status, 401);
});

test("로그인 후 검사 결과를 저장하면 목록에 나타난다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const createRes = await agent.post("/api/test/results").send(sampleResult);
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.type, "stress");
  assert.equal(createRes.body.score, 30);

  const listRes = await agent.get("/api/test/results");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].title, "스트레스 검사 (PSS)");
});

test("결과는 최신순으로 정렬되어 반환된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  await agent.post("/api/test/results").send({ ...sampleResult, score: 10 });
  await agent.post("/api/test/results").send({ ...sampleResult, score: 20 });

  const listRes = await agent.get("/api/test/results");
  assert.equal(listRes.body[0].score, 20);
  assert.equal(listRes.body[1].score, 10);
});

test("다른 사용자의 결과는 보이지 않는다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  await agent.post("/api/test/results").send(sampleResult);

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });

  const res = await otherAgent.get("/api/test/results");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("비로그인 상태로 결과 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/test/results");
  assert.equal(res.status, 401);
});

test("필수 필드가 없으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.post("/api/test/results").send({ type: "stress" });
  assert.equal(res.status, 400);
});

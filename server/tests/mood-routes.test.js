const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;
let MoodEntry;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  MoodEntry = require("../models/MoodEntry");
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
    name: "기분테스트",
    email: "mood-user@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("로그인하지 않은 상태로 기분 기록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/mood/entries");
  assert.equal(res.status, 401);
});

test("기록이 없으면 빈 배열과 기본 공유설정(false)을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.get("/api/mood/entries");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { shareEnabled: false, entries: [] });
});

test("PUT으로 오늘 기록을 저장하면 GET에 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const putRes = await agent
    .put("/api/mood/entries/2026-08-22")
    .send({ score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.body, { date: "2026-08-22", score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.status, 200);
  assert.deepEqual(getRes.body.entries, [{ date: "2026-08-22", score: 4, note: "괜찮은 하루", checks: ["sleep", "focus"] }]);
});

test("같은 날짜에 다시 PUT하면 덮어쓴다(하루 1개만 유지)", async () => {
  const agent = request.agent(app);
  await signup(agent);

  await agent.put("/api/mood/entries/2026-08-22").send({ score: 2, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-22").send({ score: 5, note: "수정", checks: ["worth"] });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.body.entries.length, 1);
  assert.deepEqual(getRes.body.entries[0], { date: "2026-08-22", score: 5, note: "수정", checks: ["worth"] });
});

test("기록은 날짜 내림차순(최신 먼저)으로 반환된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  await agent.put("/api/mood/entries/2026-08-01").send({ score: 3, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-15").send({ score: 4, note: "", checks: [] });
  await agent.put("/api/mood/entries/2026-08-10").send({ score: 2, note: "", checks: [] });

  const getRes = await agent.get("/api/mood/entries");
  assert.deepEqual(
    getRes.body.entries.map((e) => e.date),
    ["2026-08-15", "2026-08-10", "2026-08-01"]
  );
});

test("날짜 형식이 잘못되면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.put("/api/mood/entries/2026-8-1").send({ score: 3, note: "", checks: [] });
  assert.equal(res.status, 400);
});

test("score가 1~5 범위를 벗어나면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.put("/api/mood/entries/2026-08-22").send({ score: 7, note: "", checks: [] });
  assert.equal(res.status, 400);
});

test("다른 사용자의 기록은 보이지 않는다", async () => {
  const agentA = request.agent(app);
  await signup(agentA, { email: "a@test.com" });
  await agentA.put("/api/mood/entries/2026-08-22").send({ score: 3, note: "", checks: [] });

  const agentB = request.agent(app);
  await signup(agentB, { email: "b@test.com" });

  const res = await agentB.get("/api/mood/entries");
  assert.deepEqual(res.body.entries, []);
});

test("로그인하지 않은 상태로 PUT하면 401을 반환한다", async () => {
  const res = await request(app).put("/api/mood/entries/2026-08-22").send({ score: 3, note: "", checks: [] });
  assert.equal(res.status, 401);
});

test("공유 설정을 켜면 /entries 응답에도 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const patchRes = await agent.patch("/api/mood/share").send({ enabled: true });
  assert.equal(patchRes.status, 200);
  assert.deepEqual(patchRes.body, { enabled: true });

  const getRes = await agent.get("/api/mood/entries");
  assert.equal(getRes.body.shareEnabled, true);
});

test("enabled가 boolean이 아니면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.patch("/api/mood/share").send({ enabled: "yes" });
  assert.equal(res.status, 400);
});

test("로그인하지 않은 상태로 공유 설정을 변경하면 401을 반환한다", async () => {
  const res = await request(app).patch("/api/mood/share").send({ enabled: true });
  assert.equal(res.status, 401);
});

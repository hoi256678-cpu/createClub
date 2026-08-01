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

test("회원가입 성공 시 201과 쿠키를 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
  assert.ok(res.headers["set-cookie"][0].includes("somit_token="));
});

test("이미 가입된 이메일로 회원가입하면 409를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "다른사람", email: "hong@test.com", password: "5678", role: "client" });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "이미 가입된 이메일입니다");
});

test("비밀번호가 4자 미만이면 400을 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "short@test.com", password: "123", role: "client" });

  assert.equal(res.status, 400);
});

test("로그인 성공 시 200과 쿠키를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "1234" });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
  assert.ok(res.headers["set-cookie"][0].includes("somit_token="));
});

test("잘못된 비밀번호로 로그인하면 401과 통일된 메시지를 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "hong@test.com", password: "wrong" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, "이메일 또는 비밀번호가 올바르지 않습니다");
});

test("존재하지 않는 이메일로 로그인해도 동일한 401 메시지를 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "nobody@test.com", password: "whatever" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, "이메일 또는 비밀번호가 올바르지 않습니다");
});

test("로그인한 상태에서 /me는 사용자 정보를 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.get("/api/auth/me");

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: "홍길동", role: "counselor" });
});

test("로그인하지 않은 상태에서 /me는 401을 반환한다", async () => {
  const res = await request(app).get("/api/auth/me");
  assert.equal(res.status, 401);
});

test("로그아웃 후에는 /me가 다시 401을 반환한다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  await agent.post("/api/auth/logout");
  const res = await agent.get("/api/auth/me");

  assert.equal(res.status, 401);
});

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

test("로그아웃 응답의 Set-Cookie에는 만료 수명(Max-Age)이 남아있지 않다", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "hong@test.com", password: "1234", role: "counselor" });

  const res = await agent.post("/api/auth/logout");
  const cookieHeader = res.headers["set-cookie"].find((c) =>
    c.startsWith("somit_token=")
  );

  assert.ok(cookieHeader, "logout 응답에 somit_token Set-Cookie가 있어야 한다");
  assert.ok(
    !/Max-Age=(?!0\b)\d+/.test(cookieHeader),
    `쿠키가 여전히 긴 수명을 갖고 있음: ${cookieHeader}`
  );
});

test("동시에 같은 이메일로 회원가입하면 한쪽은 201, 다른 한쪽은 409를 반환한다", async () => {
  const payloadA = {
    name: "동시가입A",
    email: "concurrent@test.com",
    password: "1234",
    role: "counselor",
  };
  const payloadB = {
    name: "동시가입B",
    email: "concurrent@test.com",
    password: "5678",
    role: "client",
  };

  const results = await Promise.allSettled([
    request(app).post("/api/auth/signup").send(payloadA),
    request(app).post("/api/auth/signup").send(payloadB),
  ]);

  const statuses = results.map((r) =>
    r.status === "fulfilled" ? r.value.status : null
  );

  assert.ok(
    statuses.includes(201),
    `둘 중 하나는 201이어야 함: ${statuses}`
  );
  assert.ok(
    statuses.every((s) => s === 201 || s === 409),
    `500 없이 201/409만 있어야 함: ${statuses}`
  );
});

test("비밀번호가 문자열이 아니면(JSON number) 400을 반환한다", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name: "홍길동", email: "numberpw@test.com", password: 1234, role: "client" });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "비밀번호는 4자 이상이어야 합니다");
});

test("정지된 계정으로 로그인하면 403을 반환한다", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "정지될사람", email: "suspended@test.com", password: "1234", role: "client" });

  const User = require("../models/User");
  await User.findOneAndUpdate({ email: "suspended@test.com" }, { suspended: true });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "suspended@test.com", password: "1234" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "정지된 계정이에요. 관리자에게 문의해주세요.");
});

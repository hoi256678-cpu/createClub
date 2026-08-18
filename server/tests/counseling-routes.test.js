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

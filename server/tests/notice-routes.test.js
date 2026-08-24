const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

let mongod;
let app;
let Notice;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  Notice = require("../models/Notice");
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test("공지가 없으면 빈 배열을 반환한다", async () => {
  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("공지 목록은 비로그인 상태로도 조회할 수 있고 최신순으로 정렬된다", async () => {
  await Notice.create({ title: "첫 번째", body: "내용1" });
  await new Promise((r) => setTimeout(r, 5));
  await Notice.create({ title: "두 번째", body: "내용2" });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].title, "두 번째");
  assert.equal(res.body[1].title, "첫 번째");
  assert.ok(res.body[0].id);
  assert.ok(res.body[0].createdAt);
});

test("공지 상세는 비로그인 상태로도 조회할 수 있다", async () => {
  const notice = await Notice.create({ title: "제목", body: "본문 내용" });

  const res = await request(app).get(`/api/community/notices/${notice._id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "제목");
  assert.equal(res.body.body, "본문 내용");
});

test("존재하지 않는 공지를 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/community/notices/${missingId}`);
  assert.equal(res.status, 404);
});

test("잘못된 형식의 id로 조회해도 500이 아니라 404를 반환한다", async () => {
  const res = await request(app).get("/api/community/notices/not-a-valid-id");
  assert.equal(res.status, 404);
});

test("고정된 공지는 최신순보다 먼저 온다", async () => {
  await Notice.create({ title: "오래된 일반 공지", body: "내용1", pinned: false });
  await new Promise((r) => setTimeout(r, 5));
  const pinned = await Notice.create({ title: "고정 공지", body: "내용2", pinned: true });
  await new Promise((r) => setTimeout(r, 5));
  await Notice.create({ title: "최신 일반 공지", body: "내용3", pinned: false });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].id, pinned._id.toString());
  assert.equal(res.body[0].pinned, true);
  assert.equal(res.body[1].title, "최신 일반 공지");
  assert.equal(res.body[2].title, "오래된 일반 공지");
});

test("공지 목록/상세 응답에 pinned 필드가 포함된다", async () => {
  await Notice.create({ title: "제목", body: "내용", pinned: true });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.body[0].pinned, true);
});

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
let Notice;
let signToken;
let COOKIE_NAME;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Notice = require("../models/Notice");
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

test("비로그인 상태로 공지를 작성하면 401을 반환한다", async () => {
  const res = await request(app).post("/api/admin/notices").send({ title: "제목", body: "내용" });
  assert.equal(res.status, 401);
});

test("admin이 아닌 로그인 사용자가 공지를 작성하면 403을 반환한다", async () => {
  const client = await User.create({ name: "학생", email: "client@test.com", passwordHash: "x", role: "client" });
  const token = signToken({ id: client._id.toString(), role: "client" });
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", `${COOKIE_NAME}=${token}`)
    .send({ title: "제목", body: "내용" });
  assert.equal(res.status, 403);
});

test("admin이 공지를 작성하면 201과 생성된 공지를 반환하고 목록에 나타난다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "새 공지", body: "공지 내용입니다" });
  assert.equal(res.status, 201);
  assert.equal(res.body.title, "새 공지");
  assert.equal(res.body.body, "공지 내용입니다");
  assert.ok(res.body.id);

  const listRes = await request(app).get("/api/community/notices");
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].title, "새 공지");
});

test("제목이나 내용이 비어있으면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "  ", body: "내용" });
  assert.equal(res.status, 400);
});

test("내용이 12,000,000자를 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: "a".repeat(12_000_001) });
  assert.equal(res.status, 400);
});

test("스크립트 태그는 저장 전 제거된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<p>안전한 내용</p><script>alert(1)</script>' });
  assert.equal(res.status, 201);
  assert.ok(res.body.body.includes("안전한 내용"));
  assert.ok(!res.body.body.includes("script"));
  assert.ok(!res.body.body.includes("alert"));
});

test("javascript: 링크는 저장 전 제거된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<p><a href="javascript:alert(1)">클릭</a></p>' });
  assert.equal(res.status, 201);
  assert.ok(!res.body.body.includes("javascript:"));
});

test("이미지가 5장을 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const img = '<img src="data:image/jpeg;base64,aGVsbG8=">';
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: img.repeat(6) });
  assert.equal(res.status, 400);
});

test("이미지 하나가 2MB를 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const tooLargeImage = `<img src="data:image/jpeg;base64,${"a".repeat(2_000_001)}">`;
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: tooLargeImage });
  assert.equal(res.status, 400);
});

test("이미지 mime 타입이 올바르지 않으면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<img src="data:text/html;base64,PHNjcmlwdD4=">' });
  assert.equal(res.status, 400);
});

test("pinned: true로 작성하면 고정된 공지로 저장된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "고정 공지", body: "내용", pinned: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.pinned, true);
});

test("작성 시 pinned를 생략하면 기본값 false다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: "내용" });
  assert.equal(res.status, 201);
  assert.equal(res.body.pinned, false);
});

test("admin이 pinned를 수정하면 반영된다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "원본", body: "원본 내용", pinned: false });

  const res = await request(app)
    .patch(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin))
    .send({ pinned: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.pinned, true);
});

test("admin이 공지를 수정하면 반영된다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "원본", body: "원본 내용" });

  const res = await request(app)
    .patch(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin))
    .send({ title: "수정됨" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "수정됨");
  assert.equal(res.body.body, "원본 내용");
});

test("존재하지 않는 공지를 수정하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .patch(`/api/admin/notices/${missingId}`)
    .set("Cookie", adminCookie(admin))
    .send({ title: "수정됨" });
  assert.equal(res.status, 404);
});

test("admin이 공지를 삭제하면 목록에서 사라진다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "지울 공지", body: "내용" });

  const res = await request(app)
    .delete(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/notices");
  assert.equal(listRes.body.length, 0);
});

test("존재하지 않는 공지를 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .delete(`/api/admin/notices/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("잘못된 형식의 ID로 공지를 수정하면 404를 반환한다 (CastError)", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .patch("/api/admin/notices/not-a-valid-id")
    .set("Cookie", adminCookie(admin))
    .send({ title: "수정" });
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
  assert.equal(res.body.error, "공지를 찾을 수 없어요");
});

test("잘못된 형식의 ID로 공지를 삭제하면 404를 반환한다 (CastError)", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .delete("/api/admin/notices/not-a-valid-id")
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
  assert.equal(res.body.error, "공지를 찾을 수 없어요");
});

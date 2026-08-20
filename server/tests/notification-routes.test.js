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
let Notification;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Notification = require("../models/Notification");
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

async function signedUpUserId(payload) {
  const user = await User.findOne({ email: payload.email });
  return user._id;
}

async function createNotification(userId, overrides = {}) {
  return Notification.create({
    user: userId,
    type: "report_reviewed",
    icon: "📮",
    title: overrides.title ?? "신고가 처리됐어요",
    desc: overrides.desc ?? "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
    read: overrides.read ?? false,
  });
}

test("비로그인 상태로 알림 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/notifications");
  assert.equal(res.status, 401);
});

test("비로그인 상태로 알림을 읽음 처리하면 401을 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).post(`/api/notifications/${missingId}/read`);
  assert.equal(res.status, 401);
});

test("비로그인 상태로 알림을 삭제하면 401을 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).delete(`/api/notifications/${missingId}`);
  assert.equal(res.status, 401);
});

test("로그인한 사용자는 본인의 알림만 조회한다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });

  await createNotification(myId, { title: "내 알림" });
  await createNotification(other._id, { title: "남의 알림" });

  const res = await agent.get("/api/notifications");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "내 알림");
  assert.equal(res.body[0].unread, true);
});

test("알림을 읽음 처리하면 unread가 false가 된다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const notification = await createNotification(myId);

  const res = await agent.post(`/api/notifications/${notification._id}/read`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { read: true });

  const listRes = await agent.get("/api/notifications");
  assert.equal(listRes.body[0].unread, false);
});

test("전체 읽음 처리하면 안읽은 알림이 모두 읽음으로 바뀐다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  await createNotification(myId, { title: "알림1" });
  await createNotification(myId, { title: "알림2" });

  const res = await agent.post("/api/notifications/read-all");
  assert.equal(res.status, 200);

  const listRes = await agent.get("/api/notifications");
  assert.ok(listRes.body.every((n) => n.unread === false));
});

test("알림을 삭제하면 목록에서 사라진다", async () => {
  const agent = request.agent(app);
  const payload = await signup(agent);
  const myId = await signedUpUserId(payload);
  const notification = await createNotification(myId);

  const res = await agent.delete(`/api/notifications/${notification._id}`);
  assert.equal(res.status, 200);

  const listRes = await agent.get("/api/notifications");
  assert.equal(listRes.body.length, 0);
});

test("다른 사용자의 알림을 읽음 처리하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });
  const othersNotification = await createNotification(other._id);

  const res = await agent.post(`/api/notifications/${othersNotification._id}/read`);
  assert.equal(res.status, 404);
});

test("다른 사용자의 알림을 삭제하려 하면 404를 반환하고 삭제되지 않는다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const other = await User.create({ name: "다른유저", email: "other@test.com", passwordHash: "x", role: "client" });
  const othersNotification = await createNotification(other._id);

  const res = await agent.delete(`/api/notifications/${othersNotification._id}`);
  assert.equal(res.status, 404);

  const stillThere = await Notification.findById(othersNotification._id);
  assert.ok(stillThere);
});

test("존재하지 않는 알림을 읽음 처리하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();

  const res = await agent.post(`/api/notifications/${missingId}/read`);
  assert.equal(res.status, 404);
});

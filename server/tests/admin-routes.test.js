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
let Post;
let signToken;
let COOKIE_NAME;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  app = require("../index");
  User = require("../models/User");
  Post = require("../models/Post");
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

async function signupClient(agent, overrides = {}) {
  const payload = {
    name: "고민청소년",
    email: overrides.email ?? "client@test.com",
    password: "1234",
    role: "client",
    ...overrides,
  };
  await agent.post("/api/auth/signup").send(payload);
  return payload;
}

test("비로그인 상태로 사용자 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/users");
  assert.equal(res.status, 401);
});

test("admin이 아닌 로그인 사용자가 사용자 목록을 조회하면 403을 반환한다", async () => {
  const agent = request.agent(app);
  await signupClient(agent);
  const res = await agent.get("/api/admin/users");
  assert.equal(res.status, 403);
});

test("admin은 전체 사용자 목록을 조회할 수 있고 passwordHash는 없다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app).get("/api/admin/users").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.ok(res.body.every((u) => u.passwordHash === undefined));
  const client = res.body.find((u) => u.email === "c1@test.com");
  assert.equal(client.role, "client");
  assert.equal(client.suspended, false);
});

test("role 쿼리로 사용자 목록을 필터링할 수 있다", async () => {
  const admin = await createAdmin();
  await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const res = await request(app)
    .get("/api/admin/users?role=client")
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].email, "c1@test.com");
});

test("admin이 사용자를 정지시키면 suspended가 true가 되고, 다시 누르면 false로 돌아간다", async () => {
  const admin = await createAdmin();
  const client = await User.create({ name: "내담자", email: "c1@test.com", passwordHash: "x", role: "client" });

  const suspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(suspendRes.status, 200);
  assert.deepEqual(suspendRes.body, { suspended: true });

  const unsuspendRes = await request(app)
    .post(`/api/admin/users/${client._id}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.deepEqual(unsuspendRes.body, { suspended: false });
});

test("존재하지 않는 사용자를 정지시키면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .post(`/api/admin/users/${missingId}/suspend`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

async function createPost(overrides = {}) {
  const author =
    overrides.authorId ??
    (await User.create({ name: "글쓴이", email: "author@test.com", passwordHash: "x", role: "client" }))._id;
  return Post.create({
    author,
    tag: "고민",
    title: overrides.title ?? "제목",
    body: overrides.body ?? "내용",
    ...overrides.rest,
  });
}

test("비로그인 상태로 관리자 게시글 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/admin/posts");
  assert.equal(res.status, 401);
});

test("admin은 전체 게시글 목록을 댓글과 함께 조회할 수 있다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "댓글입니다" });
  await post.save();

  const res = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, "제목");
  assert.equal(res.body[0].comments.length, 1);
  assert.equal(res.body[0].comments[0].text, "댓글입니다");
});

test("admin이 게시글을 삭제하면 목록에서 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/admin/posts").set("Cookie", adminCookie(admin));
  assert.equal(listRes.body.length, 0);
});

test("존재하지 않는 게시글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app)
    .delete(`/api/admin/posts/${missingId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

test("admin이 댓글 하나를 삭제하면 게시글에는 남고 그 댓글만 사라진다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const commenter = await User.create({ name: "댓글러", email: "cmt@test.com", passwordHash: "x", role: "client" });
  post.comments.push({ author: commenter._id, text: "지울 댓글" });
  post.comments.push({ author: commenter._id, text: "남길 댓글" });
  await post.save();
  const toDelete = post.comments[0]._id.toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${toDelete}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 200);

  const updated = await Post.findById(post._id);
  assert.equal(updated.comments.length, 1);
  assert.equal(updated.comments[0].text, "남길 댓글");
});

test("존재하지 않는 댓글을 삭제하면 404를 반환한다", async () => {
  const admin = await createAdmin();
  const post = await createPost();
  const missingCommentId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/api/admin/posts/${post._id}/comments/${missingCommentId}`)
    .set("Cookie", adminCookie(admin));
  assert.equal(res.status, 404);
});

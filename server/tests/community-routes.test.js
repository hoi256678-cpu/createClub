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

test("비로그인 상태에서 게시글 목록은 빈 배열을 반환한다", async () => {
  const res = await request(app).get("/api/community/posts");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("비로그인 상태로 게시글을 작성하면 401을 반환한다", async () => {
  const res = await request(app)
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(res.status, 401);
});

test("로그인 후 게시글을 작성하면 목록과 상세에 나타난다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const createRes = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목입니다", body: "내용입니다" });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.title, "제목입니다");
  assert.equal(createRes.body.authorName, "테스트유저");
  assert.equal(createRes.body.authorRole, "고민 청소년");

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 1);
  assert.equal(listRes.body[0].title, "제목입니다");

  const detailRes = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.title, "제목입니다");
  assert.deepEqual(detailRes.body.comments, []);
});

test("제목이나 내용이 비어있으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "  ", body: "내용" });
  assert.equal(res.status, 400);
});

test("게시글 상세를 조회할 때마다 조회수가 1씩 증가한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const first = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  const second = await request(app).get(`/api/community/posts/${createRes.body.id}`);

  assert.equal(first.body.views, 1);
  assert.equal(second.body.views, 2);
});

test("존재하지 않는 게시글을 조회하면 404를 반환한다", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await request(app).get(`/api/community/posts/${missingId}`);
  assert.equal(res.status, 404);
});

test("상담사가 댓글을 작성하면 상세 조회 시 댓글 목록과 cmtCount에 반영된다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const counselorAgent = request.agent(app);
  await signup(counselorAgent, { email: "counselor@test.com", role: "counselor", name: "상담사쌤" });
  const commentRes = await counselorAgent
    .post(`/api/community/posts/${createRes.body.id}/comments`)
    .send({ text: "힘내세요" });

  assert.equal(commentRes.status, 201);
  assert.equal(commentRes.body.length, 1);
  assert.equal(commentRes.body[0].authorName, "상담사쌤");
  assert.equal(commentRes.body[0].authorRole, "상담사");

  const detailRes = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.body.comments.length, 1);
  assert.equal(detailRes.body.cmtCount, 1);
});

test("비로그인 상태로 댓글을 작성하면 401을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const res = await request(app)
    .post(`/api/community/posts/${createRes.body.id}/comments`)
    .send({ text: "댓글" });

  assert.equal(res.status, 401);
});

test("좋아요를 누르면 likeCount가 1이 되고, 다시 누르면 0으로 돌아간다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const likerAgent = request.agent(app);
  await signup(likerAgent, { email: "liker@test.com" });

  const likeRes = await likerAgent.post(`/api/community/posts/${createRes.body.id}/like`);
  assert.equal(likeRes.status, 200);
  assert.deepEqual(likeRes.body, { liked: true, likeCount: 1 });

  const unlikeRes = await likerAgent.post(`/api/community/posts/${createRes.body.id}/like`);
  assert.deepEqual(unlikeRes.body, { liked: false, likeCount: 0 });
});

test("좋아요를 누른 사용자가 조회하면 likedByMe가 true로 나온다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  await authorAgent.post(`/api/community/posts/${createRes.body.id}/like`);

  const detailRes = await authorAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.body.likedByMe, true);

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  const otherDetailRes = await otherAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(otherDetailRes.body.likedByMe, false);
});

test("비로그인 상태로 좋아요를 누르면 401을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const res = await request(app).post(`/api/community/posts/${createRes.body.id}/like`);
  assert.equal(res.status, 401);
});

test("내가 쓴 글 개수만 정확히 센다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글1", body: "내용1" });
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글2", body: "내용2" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  await otherAgent.post("/api/community/posts").send({ tag: "고민", title: "다른사람글", body: "내용" });

  const res = await agent.get("/api/community/my-posts/count");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { count: 2 });
});

test("비로그인 상태로 작성한 글 개수를 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/community/my-posts/count");
  assert.equal(res.status, 401);
});

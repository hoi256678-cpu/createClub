const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const User = require("../models/User");
const { signToken, COOKIE_NAME } = require("../lib/token");

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

test("제목이 100자를 넘으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const longTitle = "가".repeat(101);
  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: longTitle, body: "내용" });
  assert.equal(res.status, 400);
});

test("내용이 5000자를 넘으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const longBody = "가".repeat(5001);
  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: longBody });
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

test("댓글이 1000자를 넘으면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const longText = "가".repeat(1001);
  const res = await agent.post(`/api/community/posts/${createRes.body.id}/comments`).send({ text: longText });
  assert.equal(res.status, 400);
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

test("내가 쓴 글 목록만 최신순으로 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글1", body: "내용1" });
  await agent.post("/api/community/posts").send({ tag: "고민", title: "글2", body: "내용2" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  await otherAgent.post("/api/community/posts").send({ tag: "고민", title: "다른사람글", body: "내용" });

  const res = await agent.get("/api/community/my-posts");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].title, "글2");
  assert.equal(res.body[1].title, "글1");
});

test("비로그인 상태로 작성한 글 목록을 조회하면 401을 반환한다", async () => {
  const res = await request(app).get("/api/community/my-posts");
  assert.equal(res.status, 401);
});

test("저장하면 savedByMe가 true가 되고, 다시 누르면 false로 돌아간다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const saverAgent = request.agent(app);
  await signup(saverAgent, { email: "saver@test.com" });

  const saveRes = await saverAgent.post(`/api/community/posts/${createRes.body.id}/save`);
  assert.equal(saveRes.status, 200);
  assert.deepEqual(saveRes.body, { saved: true });

  const detailRes = await saverAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes.body.savedByMe, true);

  const unsaveRes = await saverAgent.post(`/api/community/posts/${createRes.body.id}/save`);
  assert.deepEqual(unsaveRes.body, { saved: false });

  const detailRes2 = await saverAgent.get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(detailRes2.body.savedByMe, false);
});

test("비로그인 상태로 저장을 누르면 401을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const res = await request(app).post(`/api/community/posts/${createRes.body.id}/save`);
  assert.equal(res.status, 401);
});

test("내가 저장한 글 목록과 개수를 정확히 반환한다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent);
  const post1 = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글1", body: "내용1" });
  const post2 = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글2", body: "내용2" });
  await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글3", body: "내용3" });

  const saverAgent = request.agent(app);
  await signup(saverAgent, { email: "saver@test.com" });
  await saverAgent.post(`/api/community/posts/${post1.body.id}/save`);
  await saverAgent.post(`/api/community/posts/${post2.body.id}/save`);

  const listRes = await saverAgent.get("/api/community/my-saved-posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, 2);
  assert.deepEqual(
    listRes.body.map((p) => p.title).sort(),
    ["글1", "글2"],
  );

  const countRes = await saverAgent.get("/api/community/my-saved-posts/count");
  assert.deepEqual(countRes.body, { count: 2 });
});

test("비로그인 상태로 저장한 글 목록/개수를 조회하면 401을 반환한다", async () => {
  const listRes = await request(app).get("/api/community/my-saved-posts");
  assert.equal(listRes.status, 401);

  const countRes = await request(app).get("/api/community/my-saved-posts/count");
  assert.equal(countRes.status, 401);
});

test("게시글 작성자 계정이 삭제돼도 목록 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const agent = request.agent(app);
  const author = await signup(agent, { email: "author@test.com" });
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(createRes.status, 201);

  const User = require("../models/User");
  await User.findOneAndDelete({ email: author.email });

  const res = await request(app).get("/api/community/posts");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].authorName, "(탈퇴한 회원)");
  assert.equal(res.body[0].authorRole, "회원");
});

test("댓글 작성자 계정이 삭제돼도 게시글 상세 조회는 500 대신 폴백 이름으로 성공한다", async () => {
  const postAgent = request.agent(app);
  await signup(postAgent, { email: "poster@test.com" });
  const createRes = await postAgent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });

  const commentAgent = request.agent(app);
  const commenter = await signup(commentAgent, { email: "commenter@test.com" });
  await commentAgent.post(`/api/community/posts/${createRes.body.id}/comments`).send({ text: "댓글입니다" });

  const User = require("../models/User");
  await User.findOneAndDelete({ email: commenter.email });

  const res = await request(app).get(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.comments[0].authorName, "(탈퇴한 회원)");
});

test("이미지와 함께 게시글을 작성하면 응답과 목록에 이미지가 포함된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const validImage = "data:image/jpeg;base64," + "a".repeat(100);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: validImage });
  assert.equal(res.status, 201);
  assert.equal(res.body.image, validImage);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body[0].image, validImage);
});

test("이미지 없이 게시글을 작성하면 image가 null이다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  assert.equal(res.status, 201);
  assert.equal(res.body.image, null);
});

test("잘못된 형식의 이미지 값이면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: "not-a-data-uri" });
  assert.equal(res.status, 400);
});

test("이미지 용량이 너무 크면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const tooLargeImage = "data:image/jpeg;base64," + "a".repeat(2_000_001);

  const res = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: tooLargeImage });
  assert.equal(res.status, 400);
});

test("내가 쓴 글/저장한 글 목록은 이미지를 제외해 대역폭을 아끼지만, 전체 목록에는 이미지가 그대로 나온다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const validImage = "data:image/jpeg;base64," + "a".repeat(100);

  const createRes = await agent
    .post("/api/community/posts")
    .send({ tag: "고민", title: "제목", body: "내용", image: validImage });
  assert.equal(createRes.status, 201);
  await agent.post(`/api/community/posts/${createRes.body.id}/save`);

  const myPostsRes = await agent.get("/api/community/my-posts");
  assert.equal(myPostsRes.status, 200);
  assert.equal(myPostsRes.body[0].image, null);

  const mySavedPostsRes = await agent.get("/api/community/my-saved-posts");
  assert.equal(mySavedPostsRes.status, 200);
  assert.equal(mySavedPostsRes.body[0].image, null);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body[0].image, validImage);
});

async function createAdminCookie() {
  const admin = await User.create({ name: "관리자", email: "admin@test.com", passwordHash: "x", role: "admin" });
  const token = signToken({ id: admin._id.toString(), role: "admin" });
  return `${COOKIE_NAME}=${token}`;
}

test("본인 게시글을 수정하면 반영된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "원본 내용" });

  const res = await agent
    .patch(`/api/community/posts/${createRes.body.id}`)
    .send({ title: "수정됨", body: "수정된 내용" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "수정됨");
  assert.equal(res.body.body, "수정된 내용");
  assert.equal(res.body.tag, "고민");
  assert.equal(res.body.isMine, true);
});

test("게시글을 수정하면 editedAt이 설정된다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "원본 내용" });
  assert.equal(createRes.body.editedAt, null);

  const res = await agent
    .patch(`/api/community/posts/${createRes.body.id}`)
    .send({ title: "수정됨", body: "수정된 내용" });
  assert.equal(res.status, 200);
  assert.ok(res.body.editedAt);
  assert.ok(!Number.isNaN(new Date(res.body.editedAt).getTime()));
});

test("좋아요/댓글/저장으로는 editedAt이 설정되지 않는다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "제목", body: "내용" });
  const postId = createRes.body.id;

  await agent.post(`/api/community/posts/${postId}/like`);
  await agent.post(`/api/community/posts/${postId}/save`);
  await agent.post(`/api/community/posts/${postId}/comments`).send({ text: "댓글" });
  await request(app).get(`/api/community/posts/${postId}`); // 조회수 증가

  const res = await request(app).get(`/api/community/posts/${postId}`);
  assert.equal(res.body.editedAt, null);
});

test("다른 사람의 게시글을 수정하려 하면 403을 반환한다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other@test.com" });
  const res = await otherAgent.patch(`/api/community/posts/${createRes.body.id}`).send({ title: "수정 시도" });
  assert.equal(res.status, 403);
});

test("관리자는 다른 사람의 게시글도 수정할 수 있다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author2@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const adminCookie = await createAdminCookie();
  const res = await request(app)
    .patch(`/api/community/posts/${createRes.body.id}`)
    .set("Cookie", adminCookie)
    .send({ title: "관리자가 수정함" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "관리자가 수정함");
  assert.equal(res.body.isMine, false);
});

test("비로그인 상태로 게시글을 수정하려 하면 401을 반환한다", async () => {
  const res = await request(app).patch("/api/community/posts/000000000000000000000000").send({ title: "x" });
  assert.equal(res.status, 401);
});

test("존재하지 않는 게시글을 수정하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.patch(`/api/community/posts/${missingId}`).send({ title: "x" });
  assert.equal(res.status, 404);
});

test("빈 제목으로 수정하려 하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const res = await agent.patch(`/api/community/posts/${createRes.body.id}`).send({ title: "   " });
  assert.equal(res.status, 400);
});

test("100자를 넘는 제목으로 수정하려 하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const res = await agent.patch(`/api/community/posts/${createRes.body.id}`).send({ title: "a".repeat(101) });
  assert.equal(res.status, 400);
});

test("5000자를 넘는 내용으로 수정하려 하면 400을 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "원본", body: "내용" });

  const res = await agent.patch(`/api/community/posts/${createRes.body.id}`).send({ body: "a".repeat(5001) });
  assert.equal(res.status, 400);
});

test("본인 게시글을 삭제하면 목록에서 사라진다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const createRes = await agent.post("/api/community/posts").send({ tag: "고민", title: "지울 글", body: "내용" });

  const res = await agent.delete(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 0);
});

test("다른 사람의 게시글을 삭제하려 하면 403을 반환한다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author3@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글", body: "내용" });

  const otherAgent = request.agent(app);
  await signup(otherAgent, { email: "other2@test.com" });
  const res = await otherAgent.delete(`/api/community/posts/${createRes.body.id}`);
  assert.equal(res.status, 403);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 1);
});

test("관리자는 다른 사람의 게시글도 삭제할 수 있다", async () => {
  const authorAgent = request.agent(app);
  await signup(authorAgent, { email: "author4@test.com" });
  const createRes = await authorAgent.post("/api/community/posts").send({ tag: "고민", title: "글", body: "내용" });

  const adminCookie = await createAdminCookie();
  const res = await request(app).delete(`/api/community/posts/${createRes.body.id}`).set("Cookie", adminCookie);
  assert.equal(res.status, 200);

  const listRes = await request(app).get("/api/community/posts");
  assert.equal(listRes.body.length, 0);
});

test("비로그인 상태로 게시글을 삭제하려 하면 401을 반환한다", async () => {
  const res = await request(app).delete("/api/community/posts/000000000000000000000000");
  assert.equal(res.status, 401);
});

test("존재하지 않는 게시글을 삭제하려 하면 404를 반환한다", async () => {
  const agent = request.agent(app);
  await signup(agent);
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await agent.delete(`/api/community/posts/${missingId}`);
  assert.equal(res.status, 404);
});

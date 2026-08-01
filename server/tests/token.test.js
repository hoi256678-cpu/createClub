const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
const { signToken, verifyToken } = require("../lib/token");

test("signToken/verifyToken은 페이로드를 왕복시킨다", () => {
  const token = signToken({ id: "abc123", role: "counselor" });
  const decoded = verifyToken(token);

  assert.equal(decoded.id, "abc123");
  assert.equal(decoded.role, "counselor");
});

test("잘못된 토큰을 verifyToken에 넘기면 에러를 던진다", () => {
  assert.throws(() => verifyToken("not-a-real-token"));
});

test("JWT_SECRET이 없으면 signToken이 에러를 던진다", () => {
  const original = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => signToken({ id: "x" }));
  } finally {
    process.env.JWT_SECRET = original;
  }
});

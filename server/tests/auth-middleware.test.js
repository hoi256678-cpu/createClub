const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
const { requireAuth } = require("../middleware/auth");
const { signToken, COOKIE_NAME } = require("../lib/token");

test("유효한 쿠키가 있으면 req.user를 설정하고 next를 호출한다", () => {
  const token = signToken({ id: "abc123", role: "counselor" });
  const req = { cookies: { [COOKIE_NAME]: token } };
  let nextCalled = false;
  const res = {};

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.id, "abc123");
  assert.equal(req.user.role, "counselor");
});

test("쿠키가 없으면 401을 반환하고 next를 호출하지 않는다", () => {
  const req = { cookies: {} };
  let statusCode;
  let body;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { error: "로그인이 필요합니다" });
});

test("잘못된 토큰이면 401을 반환한다", () => {
  const req = { cookies: { [COOKIE_NAME]: "invalid-token" } };
  let statusCode;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  requireAuth(req, res, () => {});

  assert.equal(statusCode, 401);
});

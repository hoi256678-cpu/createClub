const { verifyToken, COOKIE_NAME } = require("../lib/token");

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (err) {
      // 유효하지 않은 토큰은 비로그인 상태로 취급한다
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };

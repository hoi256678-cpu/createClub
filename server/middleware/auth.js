const { verifyToken, COOKIE_NAME } = require("../lib/token");
const User = require("../models/User");

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

async function requireAdmin(req, res, next) {
  try {
    const user = req.user?.id ? await User.findById(req.user.id) : null;
    if (user?.role !== "admin") {
      return res.status(403).json({ error: "관리자만 접근할 수 있어요" });
    }
    next();
  } catch (err) {
    console.error("관리자 권한 확인 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
}

module.exports = { requireAuth, optionalAuth, requireAdmin };

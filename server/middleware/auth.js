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

module.exports = { requireAuth };

const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken, COOKIE_NAME, COOKIE_OPTIONS } = require("../lib/token");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ error: "이름, 이메일, 비밀번호, 역할을 모두 입력해주세요" });
  }
  if (!["counselor", "client"].includes(role)) {
    return res
      .status(400)
      .json({ error: "역할은 counselor 또는 client여야 합니다" });
  }
  if (password.length < 4) {
    return res
      .status(400)
      .json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: "이미 가입된 이메일입니다" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role });

  const token = signToken({ id: user._id.toString(), role: user.role });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.status(201).json({ name: user.name, role: user.role });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "이메일과 비밀번호를 입력해주세요" });
  }

  const genericError = { error: "이메일 또는 비밀번호가 올바르지 않습니다" };
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json(genericError);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json(genericError);
  }

  const token = signToken({ id: user._id.toString(), role: user.role });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ name: user.name, role: user.role });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.json({});
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  res.json({ name: user.name, role: user.role });
});

module.exports = router;

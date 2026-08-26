const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ChatRoom = require("../models/ChatRoom");
const TestResult = require("../models/TestResult");
const MoodEntry = require("../models/MoodEntry");
const { signToken, COOKIE_NAME, COOKIE_OPTIONS } = require("../lib/token");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
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
    if (typeof password !== "string" || password.length < 4) {
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
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "이미 가입된 이메일입니다" });
    }
    console.error("회원가입 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/login", async (req, res) => {
  try {
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

    if (user.suspended) {
      return res.status(403).json({ error: "정지된 계정이에요. 관리자에게 문의해주세요." });
    }

    const token = signToken({ id: user._id.toString(), role: user.role });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ name: user.name, role: user.role, notificationPrefs: user.notificationPrefs });
  } catch (err) {
    console.error("로그인 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/logout", (req, res) => {
  const { maxAge, ...clearCookieOptions } = COOKIE_OPTIONS;
  res.clearCookie(COOKIE_NAME, clearCookieOptions);
  res.json({});
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    res.json({ name: user.name, role: user.role, notificationPrefs: user.notificationPrefs });
  } catch (err) {
    console.error("/me 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.patch("/notification-prefs", requireAuth, async (req, res) => {
  try {
    const { chatMessages, systemAlerts, communityActivity } = req.body || {};
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    if (typeof chatMessages === "boolean") user.notificationPrefs.chatMessages = chatMessages;
    if (typeof systemAlerts === "boolean") user.notificationPrefs.systemAlerts = systemAlerts;
    if (typeof communityActivity === "boolean") user.notificationPrefs.communityActivity = communityActivity;
    await user.save();
    res.json(user.notificationPrefs);
  } catch (err) {
    console.error("알림 설정 변경 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.patch("/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return res.status(400).json({ error: "새 비밀번호는 4자 이상이어야 합니다" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "현재 비밀번호가 올바르지 않습니다" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({});
  } catch (err) {
    console.error("비밀번호 변경 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/me", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: "비밀번호를 입력해주세요" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다" });
    }

    await ChatRoom.updateMany(
      { $or: [{ client: user._id }, { counselor: user._id }], status: "active" },
      { status: "ended", endedAt: new Date() },
    );
    await Notification.deleteMany({ user: user._id });
    await TestResult.deleteMany({ user: user._id });
    await MoodEntry.deleteMany({ user: user._id });
    await user.deleteOne();

    const { maxAge, ...clearCookieOptions } = COOKIE_OPTIONS;
    res.clearCookie(COOKIE_NAME, clearCookieOptions);
    res.json({});
  } catch (err) {
    console.error("회원 탈퇴 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

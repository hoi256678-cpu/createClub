const express = require("express");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    suspended: !!user.suspended,
    createdAt: user.createdAt,
  };
}

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json(users.map(serializeUser));
  } catch (err) {
    console.error("사용자 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/users/:id/suspend", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없어요" });
    }
    user.suspended = !user.suspended;
    await user.save();
    res.json({ suspended: user.suspended });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "사용자를 찾을 수 없어요" });
    }
    console.error("사용자 정지 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

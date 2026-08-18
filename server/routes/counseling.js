const express = require("express");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function serializeCounselor(user) {
  const p = user.counselorProfile || {};
  return {
    id: user._id.toString(),
    name: user.name,
    major: p.major || "",
    intro: p.bio || "",
    avatarBg: p.avatarBg || "#e8eff9",
    avatarColor: p.avatarColor || "#7a9cc5",
    tags: p.specialties || [],
    rating: p.rating || 0,
    reviewCount: p.ratingCount || 0,
    sessionCount: p.sessionCount || 0,
    recentSessions: p.recentSessions || 0,
    online: !!p.online,
  };
}

router.get("/counselors", optionalAuth, async (req, res) => {
  try {
    const counselors = await User.find({ role: "counselor" });
    res.json(counselors.map(serializeCounselor));
  } catch (err) {
    console.error("상담사 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counselors/:id", optionalAuth, async (req, res) => {
  try {
    const counselor = await User.findOne({ _id: req.params.id, role: "counselor" });
    if (!counselor) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    res.json(serializeCounselor(counselor));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담사 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = { router, serializeCounselor };

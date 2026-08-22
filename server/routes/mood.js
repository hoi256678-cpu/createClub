const express = require("express");
const MoodEntry = require("../models/MoodEntry");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serializeEntry(entry) {
  return { date: entry.date, score: entry.score, note: entry.note, checks: entry.checks };
}

router.get("/entries", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "로그인이 필요합니다" });
    }
    const entries = await MoodEntry.find({ user: req.user.id }).sort({ date: -1 });
    res.json({ shareEnabled: !!user.moodShareEnabled, entries: entries.map(serializeEntry) });
  } catch (err) {
    console.error("기분 기록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.put("/entries/:date", requireAuth, async (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: "날짜 형식이 올바르지 않습니다" });
    }
    const { score, note, checks } = req.body || {};
    if (typeof score !== "number" || score < 1 || score > 5) {
      return res.status(400).json({ error: "점수는 1~5 사이여야 합니다" });
    }

    const entry = await MoodEntry.findOneAndUpdate(
      { user: req.user.id, date },
      { score, note: typeof note === "string" ? note : "", checks: Array.isArray(checks) ? checks : [] },
      { new: true, upsert: true }
    );

    res.json(serializeEntry(entry));
  } catch (err) {
    console.error("기분 기록 저장 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

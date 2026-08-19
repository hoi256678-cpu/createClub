const express = require("express");
const TestResult = require("../models/TestResult");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function serializeResult(result) {
  return {
    id: result._id.toString(),
    type: result.type,
    title: result.title,
    score: result.score,
    label: result.label,
    color: result.color,
    needsSupport: result.needsSupport,
    takenAt: result.createdAt,
  };
}

router.get("/results", requireAuth, async (req, res) => {
  try {
    const results = await TestResult.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(results.map(serializeResult));
  } catch (err) {
    console.error("검사 결과 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/results", requireAuth, async (req, res) => {
  try {
    const { type, title, score, label, color, needsSupport } = req.body || {};
    if (!type || !title || score === undefined || !label || !color || needsSupport === undefined) {
      return res.status(400).json({ error: "검사 결과 정보가 올바르지 않아요" });
    }

    const result = await TestResult.create({
      user: req.user.id,
      type,
      title,
      score,
      label,
      color,
      needsSupport,
    });

    res.status(201).json(serializeResult(result));
  } catch (err) {
    console.error("검사 결과 저장 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

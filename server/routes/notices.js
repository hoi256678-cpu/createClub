const express = require("express");
const Notice = require("../models/Notice");
const { sanitizeBody } = require("../lib/sanitizeNotice");

const router = express.Router();

function serializeNotice(notice) {
  return {
    id: notice._id.toString(),
    title: notice.title,
    body: sanitizeBody(notice.body),
    pinned: notice.pinned,
    createdAt: notice.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ pinned: -1, createdAt: -1 });
    res.json(notices.map(serializeNotice));
  } catch (err) {
    console.error("공지사항 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    res.json(serializeNotice(notice));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

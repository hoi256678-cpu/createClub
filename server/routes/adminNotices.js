const express = require("express");
const Notice = require("../models/Notice");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serializeNotice(notice) {
  return { id: notice._id.toString(), title: notice.title, body: notice.body, createdAt: notice.createdAt };
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "제목과 내용을 모두 입력해주세요" });
    }
    const notice = await Notice.create({ title: title.trim(), body: body.trim() });
    res.status(201).json(serializeNotice(notice));
  } catch (err) {
    console.error("공지사항 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    const { title, body } = req.body || {};
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      notice.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      notice.body = body.trim();
    }
    await notice.save();
    res.json(serializeNotice(notice));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 수정 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    res.json({});
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "공지를 찾을 수 없어요" });
    }
    console.error("공지사항 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

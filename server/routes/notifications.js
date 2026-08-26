const express = require("express");
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function serializeNotification(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    icon: n.icon,
    title: n.title,
    desc: n.desc,
    href: n.href,
    unread: !n.read,
    time: n.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications.map(serializeNotification));
  } catch (err) {
    console.error("알림 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });
    if (!notification) {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    notification.read = true;
    await notification.save();
    res.json({ read: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    console.error("알림 읽음 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("알림 전체 읽음 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!notification) {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "알림을 찾을 수 없어요" });
    }
    console.error("알림 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

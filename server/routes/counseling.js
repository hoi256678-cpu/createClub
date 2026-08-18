const express = require("express");
const User = require("../models/User");
const ChatRoom = require("../models/ChatRoom");
const Report = require("../models/Report");
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

function serializeRoom(room) {
  const counselor = room.counselor;
  const p = counselor.counselorProfile || {};
  const last = room.messages.length ? room.messages[room.messages.length - 1] : null;
  return {
    id: room._id.toString(),
    counselorId: counselor._id.toString(),
    counselorName: counselor.name,
    counselorMajor: p.major || "",
    avatarBg: p.avatarBg || "#e8eff9",
    avatarColor: p.avatarColor || "#7a9cc5",
    status: room.status,
    lastMessage: last ? last.text : null,
    createdAt: room.createdAt,
  };
}

function serializeMessage(m) {
  return { id: m._id.toString(), from: m.from, text: m.text, createdAt: m.createdAt };
}

router.post("/counseling/rooms", requireAuth, async (req, res) => {
  try {
    const { counselorId } = req.body || {};
    if (!counselorId) {
      return res.status(400).json({ error: "상담사를 선택해주세요" });
    }

    const counselor = await User.findOne({ _id: counselorId, role: "counselor" });
    if (!counselor) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }

    const existing = await ChatRoom.findOne({ client: req.user.id, status: "active" });
    if (existing) {
      return res.status(409).json({ error: "이미 진행 중인 상담이 있어요" });
    }

    const room = await ChatRoom.create({ client: req.user.id, counselor: counselorId });

    counselor.counselorProfile.sessionCount = (counselor.counselorProfile.sessionCount || 0) + 1;
    counselor.counselorProfile.recentSessions = (counselor.counselorProfile.recentSessions || 0) + 1;
    await counselor.save();

    await room.populate("counselor", "name counselorProfile");
    res.status(201).json(serializeRoom(room));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담 신청 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counseling/rooms", requireAuth, async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ client: req.user.id })
      .sort({ createdAt: -1 })
      .populate("counselor", "name counselorProfile");
    res.json(rooms.map(serializeRoom));
  } catch (err) {
    console.error("채팅방 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counseling/rooms/:id", requireAuth, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id).populate("counselor", "name counselorProfile");
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    res.json({ ...serializeRoom(room), messages: room.messages.map(serializeMessage) });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("채팅방 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/messages", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ error: "메시지를 입력해주세요" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ error: "메시지는 1000자를 넘을 수 없어요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "종료된 상담이에요" });
    }

    room.messages.push({ from: "client", text: text.trim() });
    await room.save();

    res.status(201).json(room.messages.map(serializeMessage));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("메시지 전송 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/end", requireAuth, async (req, res) => {
  try {
    const { rating } = req.body || {};
    if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "평점은 1~5 사이여야 해요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    room.status = "ended";
    room.endedAt = new Date();
    if (rating) room.rating = rating;
    await room.save();

    if (rating) {
      const counselor = await User.findById(room.counselor);
      const p = counselor.counselorProfile;
      const prevCount = p.ratingCount || 0;
      const prevAvg = p.rating || 0;
      p.ratingCount = prevCount + 1;
      p.rating = (prevAvg * prevCount + rating) / p.ratingCount;
      await counselor.save();
    }

    res.json({ id: room._id.toString(), status: room.status, rating: room.rating });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("상담 종료 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counseling/rooms/:id/report", requireAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason?.trim()) {
      return res.status(400).json({ error: "신고 사유를 입력해주세요" });
    }
    if (reason.trim().length > 500) {
      return res.status(400).json({ error: "신고 사유는 500자를 넘을 수 없어요" });
    }

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    if (room.client.toString() !== req.user.id) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    await Report.create({ reporter: req.user.id, room: room._id, counselor: room.counselor, reason: reason.trim() });
    room.status = "reported";
    room.endedAt = new Date();
    await room.save();

    res.json({ id: room._id.toString(), status: room.status });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    console.error("신고 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = { router, serializeCounselor };

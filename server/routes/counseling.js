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
    const counselors = await User.find({ role: "counselor", "counselorProfile.verified": true });
    res.json(counselors.map(serializeCounselor));
  } catch (err) {
    console.error("상담사 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

const SPECIALTY_OPTIONS = ["진로", "학업", "관계", "가족", "감정", "자존감"];

// "/counselors/me"·"/counselors/register"는 "/counselors/:id"보다 먼저 등록해야
// Express가 "me"/"register"를 :id로 잘못 매칭하지 않는다.
router.get("/counselors/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "counselor") {
      return res.status(403).json({ error: "상담사 계정만 이용할 수 있어요" });
    }
    const p = user.counselorProfile || {};
    res.json({
      id: user._id.toString(),
      name: user.name,
      major: p.major || "",
      year: p.year || "",
      bio: p.bio || "",
      specialties: p.specialties || [],
      verified: !!p.verified,
    });
  } catch (err) {
    console.error("내 상담사 프로필 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counselors/register", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "counselor") {
      return res.status(403).json({ error: "상담사 계정만 등록할 수 있어요" });
    }

    const { name, major, year, bio, specialties } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: "이름을 입력해주세요" });
    }
    if (name.trim().length > 30) {
      return res.status(400).json({ error: "이름은 30자를 넘을 수 없어요" });
    }
    if (!major?.trim()) {
      return res.status(400).json({ error: "전공을 입력해주세요" });
    }
    if (major.trim().length > 60) {
      return res.status(400).json({ error: "전공은 60자를 넘을 수 없어요" });
    }
    if (year !== undefined && year !== null && String(year).length > 20) {
      return res.status(400).json({ error: "학년은 20자를 넘을 수 없어요" });
    }
    if (!bio?.trim()) {
      return res.status(400).json({ error: "소개글을 입력해주세요" });
    }
    if (bio.trim().length > 300) {
      return res.status(400).json({ error: "소개글은 300자를 넘을 수 없어요" });
    }
    if (!Array.isArray(specialties) || specialties.length === 0) {
      return res.status(400).json({ error: "태그를 1개 이상 선택해주세요" });
    }
    if (specialties.some((t) => !SPECIALTY_OPTIONS.includes(t))) {
      return res.status(400).json({ error: "선택할 수 없는 태그가 있어요" });
    }

    user.name = name.trim();
    user.counselorProfile.major = major.trim();
    user.counselorProfile.year = year ? String(year).trim() : "";
    user.counselorProfile.bio = bio.trim();
    user.counselorProfile.specialties = specialties;
    user.counselorProfile.verified = true;
    await user.save();

    res.json({ id: user._id.toString(), name: user.name, verified: true });
  } catch (err) {
    console.error("상담사 등록 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counselors/:id", optionalAuth, async (req, res) => {
  try {
    const counselor = await User.findOne({
      _id: req.params.id,
      role: "counselor",
      "counselorProfile.verified": true,
    });
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

const DEFAULT_AVATAR_BG = "#e8eff9";
const DEFAULT_AVATAR_COLOR = "#7a9cc5";

function serializeRoom(room, viewerId) {
  const client = room.client;
  const counselor = room.counselor;
  if (!client || typeof client.name !== "string" || !counselor || typeof counselor.name !== "string") {
    throw new Error("serializeRoom: client/counselor가 populate되지 않았습니다");
  }
  const isViewerClient = client._id.toString() === viewerId;
  const other = isViewerClient ? counselor : client;
  const otherProfile = other.counselorProfile || {};
  const last = room.messages.length ? room.messages[room.messages.length - 1] : null;

  return {
    id: room._id.toString(),
    otherPartyId: other._id.toString(),
    otherPartyName: other.name,
    otherPartyMajor: otherProfile.major || "",
    otherPartyAvatarBg: otherProfile.avatarBg || DEFAULT_AVATAR_BG,
    otherPartyAvatarColor: otherProfile.avatarColor || DEFAULT_AVATAR_COLOR,
    status: room.status,
    lastMessage: last ? last.text : null,
    lastMessageAt: last ? last.createdAt : room.createdAt,
    lastMessageFrom: last ? last.from : null,
    viewerSide: isViewerClient ? "client" : "counselor",
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
    if (counselorId === req.user.id) {
      return res.status(400).json({ error: "자기 자신에게는 상담을 신청할 수 없어요" });
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

    await room.populate([
      { path: "client", select: "name counselorProfile" },
      { path: "counselor", select: "name counselorProfile" },
    ]);
    res.status(201).json(serializeRoom(room, req.user.id));
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
    const rooms = await ChatRoom.find({ $or: [{ client: req.user.id }, { counselor: req.user.id }] })
      .sort({ createdAt: -1 })
      .populate("client", "name counselorProfile")
      .populate("counselor", "name counselorProfile");
    res.json(rooms.map((r) => serializeRoom(r, req.user.id)));
  } catch (err) {
    console.error("채팅방 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/counseling/rooms/:id", requireAuth, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.id)
      .populate("client", "name counselorProfile")
      .populate("counselor", "name counselorProfile");
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    const isParticipant =
      room.client._id.toString() === req.user.id || room.counselor._id.toString() === req.user.id;
    if (!isParticipant) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    res.json({ ...serializeRoom(room, req.user.id), messages: room.messages.map(serializeMessage) });
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
    const isClient = room.client.toString() === req.user.id;
    const isCounselor = room.counselor.toString() === req.user.id;
    if (!isClient && !isCounselor) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "종료된 상담이에요" });
    }

    // read-modify-write(push 후 save) 대신 $push 단일 원자적 연산으로 메시지를 추가한다.
    // status: "active" 조건을 쿼리 필터에 걸어서, 위에서 읽은 뒤 update 사이에 방이 종료된 경우
    // (TOCTOU) 조용히 종료된 방에 메시지가 붙는 것을 막는다.
    const updated = await ChatRoom.findOneAndUpdate(
      { _id: req.params.id, status: "active" },
      { $push: { messages: { from: isClient ? "client" : "counselor", text: text.trim() } } },
      { new: true },
    );
    if (!updated) {
      // 위에서 방의 존재는 이미 확인했으므로, 여기서 null이면 그 사이 상태가 바뀐 것이다.
      return res.status(400).json({ error: "종료된 상담이에요" });
    }

    res.status(201).json(updated.messages.map(serializeMessage));
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

    const room = await ChatRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "채팅방을 찾을 수 없어요" });
    }
    const isClient = room.client.toString() === req.user.id;
    const isCounselor = room.counselor.toString() === req.user.id;
    if (!isClient && !isCounselor) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (isClient && rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "평점은 1~5 사이여야 해요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    room.status = "ended";
    room.endedAt = new Date();
    // rating은 client가 종료할 때만 반영한다 — 상담사가 자기 평점을 남기는 건 의미가 없다.
    const effectiveRating = isClient ? rating : undefined;
    if (effectiveRating) room.rating = effectiveRating;
    await room.save();

    const hadMessages = room.messages.length > 0;

    if (hadMessages || effectiveRating) {
      const counselor = await User.findById(room.counselor);
      const p = counselor.counselorProfile;

      // 실제 대화(메시지 교환)가 있었던 방만 상담사 통계에 반영한다.
      // 신청 직후 바로 종료하는 것을 반복해 통계를 조작하는 것을 막기 위함이다.
      if (hadMessages) {
        p.sessionCount = (p.sessionCount || 0) + 1;
        p.recentSessions = (p.recentSessions || 0) + 1;
      }

      if (effectiveRating && hadMessages) {
        const prevCount = p.ratingCount || 0;
        const prevAvg = p.rating || 0;
        p.ratingCount = prevCount + 1;
        p.rating = (prevAvg * prevCount + effectiveRating) / p.ratingCount;
      }

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
    const isClient = room.client.toString() === req.user.id;
    const isCounselor = room.counselor.toString() === req.user.id;
    if (!isClient && !isCounselor) {
      return res.status(403).json({ error: "접근 권한이 없어요" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "이미 종료된 상담이에요" });
    }

    // Report.counselor는 "이 방의 상담사가 누구였는지" 메타데이터다 — 상담사가 신고한 경우
    // reporter와 counselor가 같아지는데, 이는 "상담사 본인이 신고를 접수했다"는 의미로 읽으면 된다.
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

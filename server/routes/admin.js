const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
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
    if (user.role === "admin") {
      return res.status(400).json({ error: "관리자 계정은 정지할 수 없어요" });
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

function serializeAdminComment(comment) {
  return { id: comment._id.toString(), authorId: comment.author.toString(), text: comment.text, createdAt: comment.createdAt };
}

function serializeAdminPost(post) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorId: post.author.toString(),
    createdAt: post.createdAt,
    comments: post.comments.map(serializeAdminComment),
  };
}

router.get("/posts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts.map(serializeAdminPost));
  } catch (err) {
    console.error("관리자 게시글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/posts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.delete("/posts/:id/comments/:commentId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: "댓글을 찾을 수 없어요" });
    }
    comment.deleteOne();
    await post.save();
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("댓글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

function serializeReport(report) {
  return {
    id: report._id.toString(),
    reporterName: report.reporter.name,
    counselorName: report.counselor.name,
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt,
  };
}

router.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate("reporter", "name")
      .populate("counselor", "name");
    res.json(reports.map(serializeReport));
  } catch (err) {
    console.error("신고 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/reports/:id/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    const wasOpen = report.status === "open";
    report.status = "reviewed";
    await report.save();

    if (wasOpen) {
      try {
        await Notification.create({
          user: report.reporter,
          type: "report_reviewed",
          icon: "📮",
          title: "신고가 처리됐어요",
          desc: "신고해주신 내용을 확인했어요. 이용해주셔서 감사합니다.",
        });
      } catch (notifyErr) {
        console.error("신고 처리 알림 생성 중 오류:", notifyErr);
      }
    }

    res.json({ status: report.status });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "신고를 찾을 수 없어요" });
    }
    console.error("신고 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

function serializePendingCounselor(user) {
  const p = user.counselorProfile || {};
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    major: p.major || "",
    year: p.year || "",
    bio: p.bio || "",
    specialties: p.specialties || [],
  };
}

router.get("/counselors/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pending = await User.find({
      role: "counselor",
      "counselorProfile.verified": false,
      "counselorProfile.major": { $exists: true, $ne: "" },
    }).sort({ createdAt: -1 });
    res.json(pending.map(serializePendingCounselor));
  } catch (err) {
    console.error("승인 대기 상담사 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/counselors/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: "counselor" });
    if (!user) {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    user.counselorProfile.verified = true;
    await user.save();
    res.json({ verified: true });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "상담사를 찾을 수 없어요" });
    }
    console.error("상담사 승인 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

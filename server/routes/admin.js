const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
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

module.exports = router;

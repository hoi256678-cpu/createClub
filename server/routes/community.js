const express = require("express");
const Post = require("../models/Post");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

function authorLabel(user) {
  if (!user) return "회원";
  return user.role === "counselor" ? "상담사" : "고민 청소년";
}

function serializePost(post, userId) {
  return {
    id: post._id.toString(),
    tag: post.tag,
    title: post.title,
    body: post.body,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}

function serializeComment(comment) {
  return {
    id: comment._id.toString(),
    authorName: comment.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(comment.author),
    text: comment.text,
    createdAt: comment.createdAt,
  };
}

router.get("/posts", optionalAuth, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).populate("author", "name role");
    res.json(posts.map((p) => serializePost(p, req.user?.id)));
  } catch (err) {
    console.error("게시글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/posts/:id", optionalAuth, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate("author", "name role")
      .populate("comments.author", "name role");

    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    res.json({
      ...serializePost(post, req.user?.id),
      comments: post.comments.map(serializeComment),
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 상세 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { tag, title, body } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }
    if (title.trim().length > 100 || body.trim().length > 5000) {
      return res.status(400).json({ error: "제목은 100자, 내용은 5000자를 넘을 수 없어요" });
    }

    const post = await Post.create({ author: req.user.id, tag, title: title.trim(), body: body.trim() });
    await post.populate("author", "name role");

    res.status(201).json(serializePost(post, req.user.id));
  } catch (err) {
    console.error("게시글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ error: "댓글 내용을 입력해주세요" });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ error: "댓글은 1000자를 넘을 수 없어요" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    post.comments.push({ author: req.user.id, text: text.trim() });
    await post.save();
    await post.populate("comments.author", "name role");

    res.status(201).json(post.comments.map(serializeComment));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("댓글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts/:id/like", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    const idx = post.likedBy.findIndex((id) => id.toString() === req.user.id);
    let liked;
    if (idx === -1) {
      post.likedBy.push(req.user.id);
      liked = true;
    } else {
      post.likedBy.splice(idx, 1);
      liked = false;
    }
    await post.save();

    res.json({ liked, likeCount: post.likedBy.length });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("좋아요 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.post("/posts/:id/save", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }

    const idx = post.savedBy.findIndex((id) => id.toString() === req.user.id);
    let saved;
    if (idx === -1) {
      post.savedBy.push(req.user.id);
      saved = true;
    } else {
      post.savedBy.splice(idx, 1);
      saved = false;
    }
    await post.save();

    res.json({ saved });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("저장 처리 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-posts", requireAuth, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.user.id }).sort({ createdAt: -1 }).populate("author", "name role");
    res.json(posts.map((p) => serializePost(p, req.user.id)));
  } catch (err) {
    console.error("내가 쓴 글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-saved-posts", requireAuth, async (req, res) => {
  try {
    const posts = await Post.find({ savedBy: req.user.id }).sort({ createdAt: -1 }).populate("author", "name role");
    res.json(posts.map((p) => serializePost(p, req.user.id)));
  } catch (err) {
    console.error("저장한 글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-saved-posts/count", requireAuth, async (req, res) => {
  try {
    const count = await Post.countDocuments({ savedBy: req.user.id });
    res.json({ count });
  } catch (err) {
    console.error("저장한 글 개수 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-posts/count", requireAuth, async (req, res) => {
  try {
    const count = await Post.countDocuments({ author: req.user.id });
    res.json({ count });
  } catch (err) {
    console.error("작성한 글 개수 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

module.exports = router;

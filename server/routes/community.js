const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { sanitizeBody } = require("../lib/sanitizeNotice");

const router = express.Router();

const IMG_TAG_RE = /<img\s+src="([^"]*)"/g;
const VALID_IMAGE_SRC_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000;
const MAX_BODY_LEN = 12_000_000;

class ValidationError extends Error {}

function sanitizeAndValidateBody(rawBody) {
  const clean = sanitizeBody(rawBody);
  if (clean.length > MAX_BODY_LEN) {
    throw new ValidationError("내용이 너무 커요");
  }
  const images = [...clean.matchAll(IMG_TAG_RE)];
  if (images.length > MAX_IMAGES) {
    throw new ValidationError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`);
  }
  for (const [, src] of images) {
    if (!VALID_IMAGE_SRC_RE.test(src)) {
      throw new ValidationError("이미지 형식이 올바르지 않아요");
    }
    if (src.length > MAX_IMAGE_LEN) {
      throw new ValidationError("이미지 용량이 너무 커요");
    }
  }
  return clean;
}

function isBodyEmpty(clean) {
  const hasText = clean.replace(/<[^>]*>/g, "").trim().length > 0;
  const hasImage = /<img\s/.test(clean);
  return !hasText && !hasImage;
}

async function resolveNoticeFields(req, payload) {
  const { isNotice, pinned } = payload; // payload = req.body(요청 바디) — Post.body(게시글 본문)와 이름이 겹치지 않도록 구분
  if (typeof isNotice !== "boolean" && typeof pinned !== "boolean") {
    return {};
  }
  const requester = await User.findById(req.user.id);
  if (requester?.role !== "admin") {
    return {};
  }
  const result = {};
  if (typeof isNotice === "boolean") result.isNotice = isNotice;
  if (typeof pinned === "boolean") result.pinned = pinned;
  return result;
}

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
    image: post.image ?? null,
    isMine: userId ? post.author?._id?.toString() === userId : false,
    isNotice: !!post.isNotice,
    pinned: !!post.pinned,
    authorName: post.author?.name ?? "(탈퇴한 회원)",
    authorRole: authorLabel(post.author),
    createdAt: post.createdAt,
    editedAt: post.editedAt ?? null,
    views: post.views,
    likeCount: post.likedBy.length,
    cmtCount: post.comments.length,
    likedByMe: userId ? post.likedBy.some((id) => id.toString() === userId) : false,
    savedByMe: userId ? post.savedBy.some((id) => id.toString() === userId) : false,
  };
}

async function canModifyPost(req, post) {
  const authorId = (post.author?._id ?? post.author)?.toString();
  if (authorId === req.user.id) {
    return true;
  }
  const requester = await User.findById(req.user.id);
  return requester?.role === "admin";
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
    const { tag, title, body, isNotice, pinned } = req.body || {};
    if (!tag || !title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }
    if (title.trim().length > 100) {
      return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
    }

    let cleanBody;
    try {
      cleanBody = sanitizeAndValidateBody(body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    if (isBodyEmpty(cleanBody)) {
      return res.status(400).json({ error: "태그, 제목, 내용을 모두 입력해주세요" });
    }

    const noticeFields = await resolveNoticeFields(req, { isNotice, pinned });
    const finalIsNotice = noticeFields.isNotice === true;
    const finalPinned = finalIsNotice && noticeFields.pinned === true;

    const post = await Post.create({
      author: req.user.id,
      tag: finalIsNotice ? "공지" : tag,
      title: title.trim(),
      body: cleanBody,
      isNotice: finalIsNotice,
      pinned: finalPinned,
    });
    await post.populate("author", "name role");

    res.status(201).json(serializePost(post, req.user.id));
  } catch (err) {
    console.error("게시글 작성 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.patch("/posts/:id", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    if (!(await canModifyPost(req, post))) {
      return res.status(403).json({ error: "수정 권한이 없어요" });
    }

    const { tag, title, body, isNotice, pinned } = req.body || {};
    const editingContent = typeof tag === "string" || typeof title === "string" || typeof body === "string";
    if (typeof tag === "string") {
      if (!tag.trim()) {
        return res.status(400).json({ error: "태그를 선택해주세요" });
      }
      post.tag = tag;
    }
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      if (title.trim().length > 100) {
        return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
      }
      post.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      let cleanBody;
      try {
        cleanBody = sanitizeAndValidateBody(body);
      } catch (err) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
      if (isBodyEmpty(cleanBody)) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      post.body = cleanBody;
    }
    if (editingContent) {
      post.editedAt = new Date();
    }

    const noticeFields = await resolveNoticeFields(req, { isNotice, pinned });
    if (typeof noticeFields.isNotice === "boolean") {
      post.isNotice = noticeFields.isNotice;
      if (post.isNotice) {
        post.tag = "공지";
      }
    }
    if (typeof noticeFields.pinned === "boolean") {
      post.pinned = noticeFields.pinned;
    }
    if (!post.isNotice) {
      post.pinned = false;
    }

    await post.save();
    await post.populate("author", "name role");
    res.json(serializePost(post, req.user.id));
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 수정 중 오류:", err);
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

router.delete("/posts/:id", requireAuth, async (req, res) => {
  try {
    // 권한 확인 전에는 절대 삭제하지 않는다: findById로 먼저 조회해 canModifyPost를
    // 통과한 뒤에만 findByIdAndDelete를 호출해야, 권한 없는 요청이 삭제를 실행한 뒤
    // 뒤늦게 403을 받는 상황(=이미 데이터가 지워진 뒤의 거부)을 막을 수 있다.
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    if (!(await canModifyPost(req, post))) {
      return res.status(403).json({ error: "삭제 권한이 없어요" });
    }
    await Post.findByIdAndDelete(req.params.id);
    res.json({});
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "게시글을 찾을 수 없어요" });
    }
    console.error("게시글 삭제 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-posts", requireAuth, async (req, res) => {
  try {
    // 마이페이지 목록은 이미지를 표시하지 않으므로 대역폭 절약을 위해 이미지 필드를 제외한다
    const posts = await Post.find({ author: req.user.id })
      .select("-image")
      .sort({ createdAt: -1 })
      .populate("author", "name role");
    res.json(posts.map((p) => serializePost(p, req.user.id)));
  } catch (err) {
    console.error("내가 쓴 글 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});

router.get("/my-saved-posts", requireAuth, async (req, res) => {
  try {
    // 마이페이지 목록은 이미지를 표시하지 않으므로 대역폭 절약을 위해 이미지 필드를 제외한다
    const posts = await Post.find({ savedBy: req.user.id })
      .select("-image")
      .sort({ createdAt: -1 })
      .populate("author", "name role");
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

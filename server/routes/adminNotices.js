const express = require("express");
const Notice = require("../models/Notice");
const { requireAuth, requireAdmin } = require("../middleware/auth");
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

function serializeNotice(notice) {
  return {
    id: notice._id.toString(),
    title: notice.title,
    body: notice.body,
    pinned: notice.pinned,
    createdAt: notice.createdAt,
  };
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, body, pinned } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "제목과 내용을 모두 입력해주세요" });
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
      return res.status(400).json({ error: "제목과 내용을 모두 입력해주세요" });
    }

    const notice = await Notice.create({
      title: title.trim(),
      body: cleanBody,
      pinned: typeof pinned === "boolean" ? pinned : false,
    });
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
    const { title, body, pinned } = req.body || {};
    if (typeof title === "string") {
      if (!title.trim()) {
        return res.status(400).json({ error: "제목을 입력해주세요" });
      }
      if (title.trim().length > 100) {
        return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
      }
      notice.title = title.trim();
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
      notice.body = cleanBody;
    }
    if (typeof pinned === "boolean") {
      notice.pinned = pinned;
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

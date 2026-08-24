# 공지사항 카페형 개편 (리치 텍스트 + 이미지 + 고정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공지사항 본문에 리치 텍스트(굵게/이탤릭/링크)와 이미지 여러 장을 넣을 수 있게 하고, 특정 공지를 상단에 고정하며, 목록 UI를 카페스럽게 개선한다.

**Architecture:** 백엔드는 `Notice.body`를 평문에서 sanitize된 HTML 문자열로, `Notice.pinned: Boolean`을 추가해 정렬 기준으로 쓴다. 서버는 `sanitize-html`로 저장 직전 HTML을 화이트리스트 필터링한다(관리자 계정 탈취 시 전체 방문자 대상 XSS 방지). 프론트는 TipTap 기반 리치 텍스트 에디터를 새로 만들고, 이미지는 게시글 첨부와 동일하게 브라우저에서 리사이즈/압축 후 base64로 에디터 본문에 인라인 삽입한다.

**Tech Stack:** Express, Mongoose, `node --test`+`supertest`+`mongodb-memory-server`(백엔드), `sanitize-html`(백엔드 신규) / Next.js App Router, React 19, TypeScript, Tailwind v4, `@tiptap/react`+`@tiptap/starter-kit`+`@tiptap/extension-link`+`@tiptap/extension-image`(프론트 신규).

**Spec:** `docs/superpowers/specs/2026-08-24-notice-cafe-overhaul-design.md`

## Global Constraints

- 백엔드는 `server/` 디렉토리에서 `node --test`로 테스트한다(TDD: 실패하는 테스트 먼저 작성).
- 프론트엔드에는 테스트 러너가 없다 — 프론트 태스크는 "테스트 작성" 대신 tsc/eslint/브라우저 확인으로 대체한다.
- 모든 태스크 완료 후 반드시 통과해야 함: 백엔드는 `cd server && node --test`, 프론트는 `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- 커밋은 브랜치 없이 `main`에 직접 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 포함.
- 공지 본문 이미지는 공지 1개당 최대 5장, 리사이즈 후 장당 2MB(2,000,000자) 이하, 전체 본문(HTML+이미지) 12MB(12,000,000자) 이하(5장×2MB=10MB보다 여유 있게 잡은 값 — 8MB로는 이미지만으로 한도를 넘을 수 있어 12MB로 조정).
- 이미지는 `data:image/(jpeg|png|webp);base64,` 형식만 허용, 링크(`a[href]`)는 `http`/`https`만 허용.
- 고정(`pinned`) 공지 개수 제한 없음. 정렬은 항상 `pinned desc, createdAt desc`.

---

## Task 1: 백엔드 — Notice 모델 + 공지 작성/수정 API sanitize·검증

**Files:**
- Modify: `server/models/Notice.js`
- Modify: `server/routes/adminNotices.js`
- Modify: `server/tests/admin-notices-routes.test.js`
- Modify: `server/package.json`
- Modify: `server/index.js`

**Interfaces:**
- Produces: `Notice.pinned: boolean`(기본 `false`), `Notice.body`는 sanitize된 HTML 문자열(최대 12,000,000자). `POST /api/admin/notices`, `PATCH /api/admin/notices/:id`가 선택적 `pinned: boolean`을 받고, `body`를 저장 전 sanitize·검증하며, 최대 15MB 요청 바디를 받을 수 있다(`index.js`에 이 경로 전용 바디 크기 제한을 이 태스크에서 함께 추가한다 — Task 1 자신의 12MB 바디 테스트가 통과하려면 필요). 응답(`serializeNotice`)에 `pinned` 필드 포함.
- Task 2(공개 GET 라우트)가 이 `pinned` 필드를 정렬 기준으로 사용한다.

- [ ] **Step 1: `sanitize-html` 설치**

```bash
cd server && npm install sanitize-html
```

- [ ] **Step 2: `Notice` 모델에 `pinned` 필드 추가 + `body` 길이 상향**

`server/models/Notice.js` 전체를:

```js
const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);
```

를:

```js
const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 12_000_000 },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);
```

로 교체한다.

- [ ] **Step 3: `index.js`에 `/api/admin/notices` 전용 바디 크기 제한 추가**

`server/index.js`의:

```js
app.use("/api/community/posts", express.json({ limit: "3mb" }));
app.use(express.json());
```

를:

```js
app.use("/api/community/posts", express.json({ limit: "3mb" }));
app.use("/api/admin/notices", express.json({ limit: "15mb" }));
app.use(express.json());
```

로 교체한다. (공지 본문은 이미지를 최대 5장까지 담을 수 있어, 다음 단계에서 만들 12MB `body` 한도 테스트가 실제로 라우트 핸들러까지 도달하려면 이 시점에 미리 필요하다 — 기본 `express.json()`의 100KB 제한으로는 큰 본문이 라우트에 닿기 전에 body-parser에서 막힌다.)

- [ ] **Step 4: 실패하는 테스트 작성**

`server/tests/admin-notices-routes.test.js`에서 기존 테스트:

```js
test("내용이 2000자를 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: "a".repeat(2001) });
  assert.equal(res.status, 400);
});
```

를:

```js
test("내용이 12,000,000자를 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: "a".repeat(12_000_001) });
  assert.equal(res.status, 400);
});

test("스크립트 태그는 저장 전 제거된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<p>안전한 내용</p><script>alert(1)</script>' });
  assert.equal(res.status, 201);
  assert.ok(res.body.body.includes("안전한 내용"));
  assert.ok(!res.body.body.includes("script"));
  assert.ok(!res.body.body.includes("alert"));
});

test("javascript: 링크는 저장 전 제거된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<p><a href="javascript:alert(1)">클릭</a></p>' });
  assert.equal(res.status, 201);
  assert.ok(!res.body.body.includes("javascript:"));
});

test("이미지가 5장을 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const img = '<img src="data:image/jpeg;base64,aGVsbG8=">';
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: img.repeat(6) });
  assert.equal(res.status, 400);
});

test("이미지 하나가 2MB를 초과하면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const tooLargeImage = `<img src="data:image/jpeg;base64,${"a".repeat(2_000_001)}">`;
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: tooLargeImage });
  assert.equal(res.status, 400);
});

test("이미지 mime 타입이 올바르지 않으면 400을 반환한다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: '<img src="data:text/html;base64,PHNjcmlwdD4=">' });
  assert.equal(res.status, 400);
});

test("pinned: true로 작성하면 고정된 공지로 저장된다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "고정 공지", body: "내용", pinned: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.pinned, true);
});

test("작성 시 pinned를 생략하면 기본값 false다", async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post("/api/admin/notices")
    .set("Cookie", adminCookie(admin))
    .send({ title: "제목", body: "내용" });
  assert.equal(res.status, 201);
  assert.equal(res.body.pinned, false);
});

test("admin이 pinned를 수정하면 반영된다", async () => {
  const admin = await createAdmin();
  const notice = await Notice.create({ title: "원본", body: "원본 내용", pinned: false });

  const res = await request(app)
    .patch(`/api/admin/notices/${notice._id}`)
    .set("Cookie", adminCookie(admin))
    .send({ pinned: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.pinned, true);
});
```

로 교체한다.

- [ ] **Step 5: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/admin-notices-routes.test.js
```

Expected: FAIL (`sanitize-html`을 아직 안 쓰고, `pinned` 필드도 없고, 검증 로직도 없어서 여러 케이스가 400 대신 201이 나오거나 `pinned`가 `undefined`).

- [ ] **Step 6: `adminNotices.js`에 sanitize + 검증 + pinned 처리 추가**

`server/routes/adminNotices.js` 전체를:

```js
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
    if (title.trim().length > 100 || body.trim().length > 2000) {
      return res.status(400).json({ error: "제목은 100자, 내용은 2000자를 넘을 수 없어요" });
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
      if (title.trim().length > 100) {
        return res.status(400).json({ error: "제목은 100자를 넘을 수 없어요" });
      }
      notice.title = title.trim();
    }
    if (typeof body === "string") {
      if (!body.trim()) {
        return res.status(400).json({ error: "내용을 입력해주세요" });
      }
      if (body.trim().length > 2000) {
        return res.status(400).json({ error: "내용은 2000자를 넘을 수 없어요" });
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
```

를:

```js
const express = require("express");
const sanitizeHtml = require("sanitize-html");
const Notice = require("../models/Notice");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const SANITIZE_OPTIONS = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "a", "img", "ul", "ol", "li"],
  allowedAttributes: { a: ["href"], img: ["src"] },
  allowedSchemesByTag: { img: ["data"] },
  allowedSchemes: ["http", "https"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

const IMG_TAG_RE = /<img\s+src="([^"]*)"/g;
const VALID_IMAGE_SRC_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000;
const MAX_BODY_LEN = 12_000_000;

class ValidationError extends Error {}

function sanitizeAndValidateBody(rawBody) {
  const clean = sanitizeHtml(rawBody, SANITIZE_OPTIONS);
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
    if (!cleanBody.trim()) {
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
      if (!cleanBody.trim()) {
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
```

로 교체한다.

- [ ] **Step 7: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/admin-notices-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 8: 커밋**

```bash
git add server/models/Notice.js server/routes/adminNotices.js server/tests/admin-notices-routes.test.js server/package.json server/package-lock.json server/index.js
git commit -m "$(cat <<'EOF'
feat: 공지사항 본문 HTML sanitize + 이미지 검증 + 고정(pinned) 필드 추가

관리자 계정 탈취나 요청 조작 시 저장형 XSS가 전체 방문자에게 노출되는 걸
막기 위해 sanitize-html로 저장 직전 화이트리스트 필터링을 추가한다.
이미지는 공지당 최대 5장, 장당 2MB, 본문 전체 12MB로 제한하고
/api/admin/notices 요청 바디 제한을 15mb로 늘린다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 백엔드 — 공지 목록 정렬(고정 우선)

**Files:**
- Modify: `server/routes/notices.js`
- Modify: `server/tests/notice-routes.test.js`

**Interfaces:**
- Consumes: Task 1의 `Notice.pinned` 필드.
- Produces: `GET /api/community/notices`가 `pinned desc, createdAt desc`로 정렬된 목록을 반환하고, 각 항목에 `pinned` 필드를 포함한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`server/tests/notice-routes.test.js`의 끝에 추가한다:

```js
test("고정된 공지는 최신순보다 먼저 온다", async () => {
  await Notice.create({ title: "오래된 일반 공지", body: "내용1", pinned: false });
  await new Promise((r) => setTimeout(r, 5));
  const pinned = await Notice.create({ title: "고정 공지", body: "내용2", pinned: true });
  await new Promise((r) => setTimeout(r, 5));
  await Notice.create({ title: "최신 일반 공지", body: "내용3", pinned: false });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.status, 200);
  assert.equal(res.body[0].id, pinned._id.toString());
  assert.equal(res.body[0].pinned, true);
  assert.equal(res.body[1].title, "최신 일반 공지");
  assert.equal(res.body[2].title, "오래된 일반 공지");
});

test("공지 목록/상세 응답에 pinned 필드가 포함된다", async () => {
  await Notice.create({ title: "제목", body: "내용", pinned: true });

  const res = await request(app).get("/api/community/notices");
  assert.equal(res.body[0].pinned, true);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
cd server && node --test tests/notice-routes.test.js
```

Expected: FAIL (정렬이 `createdAt`만 기준이라 고정 공지가 맨 앞에 오지 않고, 응답에 `pinned` 필드도 없음).

- [ ] **Step 3: `notices.js`에 정렬 + `pinned` 직렬화 추가**

`server/routes/notices.js`의:

```js
function serializeNotice(notice) {
  return { id: notice._id.toString(), title: notice.title, body: notice.body, createdAt: notice.createdAt };
}

router.get("/", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices.map(serializeNotice));
  } catch (err) {
    console.error("공지사항 목록 조회 중 오류:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다" });
  }
});
```

를:

```js
function serializeNotice(notice) {
  return {
    id: notice._id.toString(),
    title: notice.title,
    body: notice.body,
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
```

로 교체한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

```bash
cd server && node --test tests/notice-routes.test.js
```

Expected: 전부 PASS.

- [ ] **Step 5: 전체 백엔드 테스트 재확인 + 커밋**

```bash
cd server && node --test
```

Expected: 전부 PASS.

```bash
git add server/routes/notices.js server/tests/notice-routes.test.js
git commit -m "$(cat <<'EOF'
feat: 공지 목록을 고정 우선으로 정렬

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 프론트엔드 — 이미지 리사이즈 유틸 공유 추출

**Files:**
- Create: `app/(shell)/community/imageUtils.ts`
- Modify: `app/(shell)/community/write/page.tsx`

**Interfaces:**
- Produces: `resizeImageFile(file: File, maxDim?: number, quality?: number): Promise<string>`, `MAX_SOURCE_FILE_BYTES: number`(둘 다 `imageUtils.ts`에서 export). Task 4(`NoticeEditor.tsx`)가 이 함수를 그대로 import해서 쓴다.
- 이 태스크는 게시글 작성 폼(`write/page.tsx`)의 동작을 바꾸지 않는다 — 로직을 옮기기만 한다.

- [ ] **Step 1: `imageUtils.ts` 생성**

`app/(shell)/community/imageUtils.ts`:

```ts
export const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

export function resizeImageFile(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이미지를 처리할 수 없어요"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러올 수 없어요"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: `write/page.tsx`에서 중복 정의 제거 후 import로 교체**

`app/(shell)/community/write/page.tsx`의:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "../mock";

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

function resizeImageFile(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이미지를 처리할 수 없어요"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러올 수 없어요"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
    reader.readAsDataURL(file);
  });
}
```

를:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "../mock";
import { resizeImageFile, MAX_SOURCE_FILE_BYTES } from "../imageUtils";
```

로 교체한다(함수 본문은 그대로 옮겨졌으므로 나머지 코드는 손대지 않는다).

- [ ] **Step 3: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/imageUtils.ts" "app/(shell)/community/write/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 4: 브라우저에서 게시글 작성 폼이 그대로 동작하는지 확인**

```bash
npm run dev
```

`/community/write`에서 이미지 첨부 → 미리보기 → 제거가 이전과 동일하게 동작하는지 확인한다(동작이 바뀌면 안 된다 — 순수 리팩터).

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/community/imageUtils.ts" "app/(shell)/community/write/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: 이미지 리사이즈 유틸을 imageUtils.ts로 공유 추출

다음 태스크의 공지사항 에디터가 게시글 작성 폼과 같은 리사이즈 로직을
재사용할 수 있도록 분리한다. 동작 변화 없음.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — TipTap 기반 `NoticeEditor` 컴포넌트

**Files:**
- Create: `app/(shell)/community/NoticeEditor.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 3의 `resizeImageFile`, `MAX_SOURCE_FILE_BYTES`(`../imageUtils`에서 import).
- Produces: `<NoticeEditor value={string} onChange={(html: string) => void} />` — Task 5가 공지 작성/수정 폼에서 이 컴포넌트를 `<textarea>` 대신 사용한다.

- [ ] **Step 1: TipTap 의존성 설치**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image
```

- [ ] **Step 2: `NoticeEditor.tsx` 작성**

`app/(shell)/community/NoticeEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { resizeImageFile, MAX_SOURCE_FILE_BYTES } from "../imageUtils";

const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000;

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export default function NoticeEditor({ value, onChange }: Props) {
  const [imageError, setImageError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  function countImages() {
    return (editor!.getHTML().match(/<img /g) || []).length;
  }

  function toggleLink() {
    const prevUrl = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL을 입력하세요", prevUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    if (countImages() >= MAX_IMAGES) {
      setImageError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`);
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setImageError("이미지 용량이 너무 커요 (10MB 이하로 선택해주세요)");
      return;
    }
    try {
      const resized = await resizeImageFile(file);
      if (resized.length > MAX_IMAGE_LEN) {
        setImageError("이미지 용량이 너무 커요");
        return;
      }
      editor!.chain().focus().setImage({ src: resized }).run();
    } catch {
      setImageError("이미지를 처리하지 못했어요");
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex gap-1 border-b border-border p-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-xs font-bold ${
            editor.isActive("bold") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded px-2 py-1 text-xs font-bold italic ${
            editor.isActive("italic") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={toggleLink}
          className={`rounded px-2 py-1 text-xs font-bold ${
            editor.isActive("link") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          🔗
        </button>
        <label className="cursor-pointer rounded px-2 py-1 text-xs font-bold text-text-muted hover:bg-primary-light">
          📷
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </label>
      </div>
      <EditorContent
        editor={editor}
        className="notice-body min-h-[120px] px-3 py-2 text-sm text-text-2 [&_.ProseMirror]:outline-none"
      />
      {imageError && <p className="px-3 pb-2 text-xs font-semibold text-danger">{imageError}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/NoticeEditor.tsx"
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add "app/(shell)/community/NoticeEditor.tsx" package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: TipTap 기반 공지사항 리치 텍스트 에디터(NoticeEditor) 추가

굵게/이탤릭/링크 툴바와 이미지 삽입(리사이즈+압축 후 본문에 인라인)을
지원한다. 아직 어디서도 사용되지 않는 독립 컴포넌트 — 다음 태스크에서
공지 작성/수정 폼에 연결한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 프론트엔드 — 공지 작성/수정 폼에 에디터·고정 체크박스 연결 + 목록 UI 개선

**Files:**
- Modify: `app/(shell)/community/types.ts`
- Modify: `app/(shell)/community/page.tsx`

**Interfaces:**
- Consumes: Task 1~2의 `pinned` 필드(API), Task 4의 `<NoticeEditor>`.
- Produces: `NoticeItem.pinned: boolean`(타입) — Task 6(상세 페이지)이 이 타입을 그대로 쓴다.

- [ ] **Step 1: `types.ts`에 `pinned` 필드 추가**

`app/(shell)/community/types.ts`의:

```ts
export type NoticeItem = { id: string; title: string; body: string; createdAt: string };
```

를:

```ts
export type NoticeItem = { id: string; title: string; body: string; pinned: boolean; createdAt: string };
```

로 교체한다.

- [ ] **Step 2: `page.tsx` — state와 제출 핸들러에 `pinned` 반영 + `NoticeEditor`/헬퍼 import**

`app/(shell)/community/page.tsx`의:

```tsx
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost, NoticeItem } from "./types";
```

를:

```tsx
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import NoticeEditor from "./NoticeEditor";
import type { CommunityPost, NoticeItem } from "./types";

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstImageSrc(html: string) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
}
```

로 교체한다.

`app/(shell)/community/page.tsx`의:

```tsx
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeBody, setEditNoticeBody] = useState("");
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);
```

를:

```tsx
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [newNoticePinned, setNewNoticePinned] = useState(false);
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeBody, setEditNoticeBody] = useState("");
  const [editNoticePinned, setEditNoticePinned] = useState(false);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);
```

로 교체한다.

`app/(shell)/community/page.tsx`의:

```tsx
  async function submitCreateNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newNoticeTitle, body: newNoticeBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewNoticeTitle("");
    setNewNoticeBody("");
    setCreatingNotice(false);
    loadNotices();
  }

  function startEditNotice(n: NoticeItem) {
    setEditingNoticeId(n.id);
    setEditNoticeTitle(n.title);
    setEditNoticeBody(n.body);
    setNoticeFormError(null);
  }

  async function submitEditNotice(e: FormEvent, id: string) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editNoticeTitle, body: editNoticeBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingNoticeId(null);
    loadNotices();
  }
```

를:

```tsx
  async function submitCreateNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newNoticeTitle, body: newNoticeBody, pinned: newNoticePinned }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewNoticeTitle("");
    setNewNoticeBody("");
    setNewNoticePinned(false);
    setCreatingNotice(false);
    loadNotices();
  }

  function startEditNotice(n: NoticeItem) {
    setEditingNoticeId(n.id);
    setEditNoticeTitle(n.title);
    setEditNoticeBody(n.body);
    setEditNoticePinned(n.pinned);
    setNoticeFormError(null);
  }

  async function submitEditNotice(e: FormEvent, id: string) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editNoticeTitle, body: editNoticeBody, pinned: editNoticePinned }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingNoticeId(null);
    loadNotices();
  }
```

로 교체한다.

- [ ] **Step 3: 작성/수정 폼 JSX 교체 — `<textarea>` → `<NoticeEditor>` + 고정 체크박스**

`app/(shell)/community/page.tsx`의:

```tsx
                  <form
                    onSubmit={submitCreateNotice}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={newNoticeTitle}
                      onChange={(e) => setNewNoticeTitle(e.target.value)}
                      placeholder="제목"
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <textarea
                      value={newNoticeBody}
                      onChange={(e) => setNewNoticeBody(e.target.value)}
                      placeholder="내용"
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreatingNotice(false)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        작성하기
                      </button>
                    </div>
                  </form>
```

를:

```tsx
                  <form
                    onSubmit={submitCreateNotice}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={newNoticeTitle}
                      onChange={(e) => setNewNoticeTitle(e.target.value)}
                      placeholder="제목"
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <NoticeEditor value={newNoticeBody} onChange={setNewNoticeBody} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                      <input
                        type="checkbox"
                        checked={newNoticePinned}
                        onChange={(e) => setNewNoticePinned(e.target.checked)}
                      />
                      📌 상단 고정
                    </label>
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreatingNotice(false)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        작성하기
                      </button>
                    </div>
                  </form>
```

로 교체한다.

`app/(shell)/community/page.tsx`의:

```tsx
                  <form
                    key={n.id}
                    onSubmit={(e) => submitEditNotice(e, n.id)}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={editNoticeTitle}
                      onChange={(e) => setEditNoticeTitle(e.target.value)}
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <textarea
                      value={editNoticeBody}
                      onChange={(e) => setEditNoticeBody(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoticeId(null)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        저장
                      </button>
                    </div>
                  </form>
```

를:

```tsx
                  <form
                    key={n.id}
                    onSubmit={(e) => submitEditNotice(e, n.id)}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={editNoticeTitle}
                      onChange={(e) => setEditNoticeTitle(e.target.value)}
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <NoticeEditor value={editNoticeBody} onChange={setEditNoticeBody} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                      <input
                        type="checkbox"
                        checked={editNoticePinned}
                        onChange={(e) => setEditNoticePinned(e.target.checked)}
                      />
                      📌 상단 고정
                    </label>
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoticeId(null)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        저장
                      </button>
                    </div>
                  </form>
```

로 교체한다.

- [ ] **Step 4: 목록 카드에 미리보기/썸네일/고정 배지 추가**

`app/(shell)/community/page.tsx`의:

```tsx
                  <Card key={n.id} className="transition-shadow hover:shadow-card">
                    <Link href={`/community/notice/${n.id}`} className="block cursor-pointer">
                      <div className="text-sm font-bold text-primary-dark">공지</div>
                      <div className="mt-1 font-bold text-text">{n.title}</div>
                      <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(n.createdAt)}</div>
                    </Link>
```

를:

```tsx
                  <Card
                    key={n.id}
                    className={`transition-shadow hover:shadow-card ${n.pinned ? "bg-primary-xlight" : ""}`}
                  >
                    <Link href={`/community/notice/${n.id}`} className="block cursor-pointer">
                      <div className="text-sm font-bold text-primary-dark">{n.pinned ? "📌 고정 공지" : "공지"}</div>
                      <div className="mt-1 font-bold text-text">{n.title}</div>
                      <div className="mt-2 flex gap-3">
                        <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{stripHtml(n.body)}</p>
                        {firstImageSrc(n.body) && (
                          // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                          <img
                            src={firstImageSrc(n.body)!}
                            alt=""
                            className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                          />
                        )}
                      </div>
                      <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(n.createdAt)}</div>
                    </Link>
```

로 교체한다.

- [ ] **Step 5: 사이드바 공지 목록에 고정 표시 추가**

`app/(shell)/community/page.tsx`의:

```tsx
              {notices.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/notice/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
                  {n.title}
                </Link>
              ))}
```

를:

```tsx
              {notices.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/notice/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </Link>
              ))}
```

로 교체한다.

- [ ] **Step 6: 타입체크 + 린트**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/types.ts" "app/(shell)/community/page.tsx"
```

Expected: 에러 없음.

- [ ] **Step 7: 브라우저에서 확인**

```bash
npm run dev
```

관리자 계정으로 `/community` 공지 탭에서: 새 공지 작성 시 굵게/이탤릭/링크/이미지가 실제로 적용되는지, "📌 상단 고정" 체크 후 저장하면 목록/사이드바 맨 위로 오는지, 이미지를 6장 넣으려 하면 에디터가 막는지, 목록 카드에 요약 텍스트(HTML 태그 없이)와 썸네일이 보이는지 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add "app/(shell)/community/types.ts" "app/(shell)/community/page.tsx"
git commit -m "$(cat <<'EOF'
feat: 공지 작성/수정 폼에 리치 텍스트 에디터·고정 체크박스 연결

목록 카드에 태그 없는 텍스트 요약 + 썸네일 + 고정 배지를 추가하고,
사이드바 공지 목록에도 고정 표시를 더한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 프론트엔드 — 공지 상세 페이지 HTML 렌더링 + 스타일

**Files:**
- Modify: `app/(shell)/community/notice/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 1~2가 저장/직렬화하는 sanitize된 `notice.body`(HTML), Task 5의 `NoticeItem.pinned` 타입.

- [ ] **Step 1: 상세 페이지에 HTML 렌더링 + 고정 배지 추가**

`app/(shell)/community/notice/[id]/page.tsx`의:

```tsx
      <Card>
        <div className="text-sm font-bold text-primary-dark">공지</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(notice.createdAt)}</div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-2">{notice.body}</p>
      </Card>
```

를:

```tsx
      <Card>
        <div className="text-sm font-bold text-primary-dark">{notice.pinned ? "📌 고정 공지" : "공지"}</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(notice.createdAt)}</div>
        <div
          className="notice-body mt-4 text-sm leading-relaxed text-text-2"
          dangerouslySetInnerHTML={{ __html: notice.body }}
        />
      </Card>
```

로 교체한다.

- [ ] **Step 2: `notice-body` 스타일 추가**

`app/globals.css`의:

```css
@media (max-width: 899px) {
  input,
  textarea,
  select {
    font-size: 16px;
  }
}
```

를:

```css
@media (max-width: 899px) {
  input,
  textarea,
  select {
    font-size: 16px;
  }
}

/*
 * 공지사항 본문(NoticeEditor가 만든 HTML, 서버 sanitize-html 통과)을 렌더링하는 컨테이너.
 * white-space: pre-line은 마이그레이션 전 평문(\n 줄바꿈만 있던) 공지도 그대로 보이게 해준다 —
 * 새 HTML의 p/br 같은 블록 요소는 pre-line이 있어도 정상 렌더링된다.
 */
.notice-body {
  white-space: pre-line;
}
.notice-body p {
  margin-bottom: 0.75em;
}
.notice-body p:last-child {
  margin-bottom: 0;
}
.notice-body img {
  max-width: 100%;
  border-radius: 0.75rem;
  margin: 0.5em 0;
}
.notice-body a {
  color: var(--color-primary-dark);
  text-decoration: underline;
}
.notice-body ul,
.notice-body ol {
  margin: 0.5em 0 0.5em 1.25em;
}
```

로 교체한다.

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

```bash
npx tsc --noEmit
npx eslint "app/(shell)/community/notice/[id]/page.tsx"
npm run build
```

Expected: 전부 에러 없음. `npm run build`는 이 플랜의 마지막 파일 변경 태스크이므로 전체 프로젝트를 한 번 더 확인하는 의미로 포함한다.

- [ ] **Step 4: 브라우저에서 확인**

`http://localhost:3000/community`에서 Task 5에서 만든 서식/이미지 있는 공지의 상세 페이지를 열어, 굵게/이탤릭/링크/이미지가 올바르게 렌더링되는지, 고정 공지면 "📌 고정 공지"로 보이는지 확인한다. 기존(마이그레이션 전) 평문 공지 3개도 열어서 줄바꿈이 유지된 채 깨지지 않는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(shell)/community/notice/[id]/page.tsx" app/globals.css
git commit -m "$(cat <<'EOF'
feat: 공지 상세 페이지에 리치 텍스트/이미지 렌더링 + 고정 배지 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 전체 통합 확인 및 배포

**Files:** 없음 (검증 및 배포 확인만)

**Interfaces:**
- Consumes: Task 1~6이 모두 커밋된 상태의 `main` 브랜치.

- [ ] **Step 1: 백엔드 전체 테스트**

```bash
cd server && node --test
```

Expected: 전부 PASS.

- [ ] **Step 2: 프론트엔드 빌드 재확인**

```bash
npx tsc --noEmit
npx eslint .
npm run build
```

Expected: 전부 에러 없음.

- [ ] **Step 3: main 푸시**

```bash
git push origin main
```

- [ ] **Step 4: 배포 상태 확인**

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/hoi256678-cpu/createClub/commits/<위에서 나온 커밋 해시>/status"
```

Expected: Vercel + Railway 모두 `"state": "success"`.

- [ ] **Step 5: 프로덕션에서 수동 확인**

`https://create-club.vercel.app/community`에서 관리자 계정으로:
- 굵게/이탤릭/링크/이미지 여러 장을 넣어 새 공지를 작성하고 상세/목록/사이드바에 정상 반영되는지.
- "📌 상단 고정"을 체크한 공지가 목록·사이드바 맨 위로 오는지, 고정 해제하면 다시 최신순으로 섞이는지.
- 이미지 6장을 넣으려 하면 에디터가 막는지.
- 브라우저 개발자도구로 `<script>`를 본문에 강제로 넣어 저장 요청을 보내도(예: fetch로 직접 호출) 응답/렌더링에 스크립트가 살아남지 않는지.
- 기존(마이그레이션 전) 평문 공지 3개가 여전히 정상적으로 보이는지.
- 비로그인/비관리자 계정에는 여전히 읽기 전용으로 보이는지.

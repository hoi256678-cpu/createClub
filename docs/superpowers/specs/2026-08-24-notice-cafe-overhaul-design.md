# 공지사항 카페형 개편 (리치 텍스트 + 이미지 + 고정) 설계

> 배경: 지금 공지사항은 제목 + 평문(`\n` 줄바꿈만 지원, 최대 2000자)만 지원한다. 네이버카페처럼 (1) 본문에 이미지를 여러 장 삽입하고, (2) 굵게/링크 등 서식을 쓰고, (3) 특정 공지를 상단에 고정하고, (4) 목록 UI를 더 눈에 띄게 바꾸는 4가지를 함께 다룬다.

## 현재 상태

- `server/models/Notice.js`: `{ title: String(max 100), body: String(max 2000) }`. HTML/서식 없음.
- `server/routes/notices.js`(공개), `server/routes/adminNotices.js`(관리자 CRUD): `body`를 그대로 문자열로 주고받는다. `GET /`은 `createdAt` 내림차순 정렬만 한다.
- 프론트: `app/(shell)/community/page.tsx`(공지 탭 안 작성/수정 폼 — `<textarea>`), `app/(shell)/community/notice/[id]/page.tsx`(상세 — `<p className="whitespace-pre-wrap">{notice.body}</p>`), 커뮤니티 페이지 우측 사이드바 "📋 공지사항" 카드(`notices.slice(0, 5)`, 이미 정렬된 배열을 그대로 씀).
- 참고용 패턴: 게시글 이미지 첨부(`docs/superpowers/specs/2026-08-23-community-notice-relocation-and-images-design.md`)에서 브라우저 `<canvas>` 리사이즈(최대 1200px, JPEG 품질 0.8) → base64 data URI로 MongoDB에 직접 저장하는 방식을 이미 구현해뒀다. 이번에도 별도 이미지 호스팅 서비스 없이 같은 방식을 재사용한다.

## 목표 / 비목표

- 목표: 공지 본문에 이미지 여러 장 삽입, 굵게/이탤릭/링크 서식, 공지 고정, 카페스러운 목록 UI.
- 비목표: 댓글/게시글에도 서식·다중이미지 확대 적용(이번엔 공지사항 한정), 이미지 CDN/외부 호스팅 도입, 표/코드블록/헤딩 등 고급 서식.

## A. 데이터 모델

**`server/models/Notice.js`**

```js
{
  title: { type: String, required: true, trim: true, maxlength: 100 },
  body: { type: String, required: true, maxlength: 12_000_000 }, // HTML 문자열(이미지 data URI 포함 가능)
  pinned: { type: Boolean, default: false },
}
```

`body`는 지금처럼 평문이 아니라 **에디터가 만든 HTML 문자열**로 의미가 바뀐다. `maxlength`를 2000 → 12,000,000(약 12MB)로 올린다 — 이미지 최대 5장 × 장당 ≤2MB(base64 기준 최대 10,000,000자) + 태그/텍스트 오버헤드를 감안한 여유치다(5장 × 2MB를 8MB로 잡으면 이미지만으로 한도를 넘을 수 있어, 이미지 최대치의 합보다 넉넉하게 잡았다). MongoDB 문서 자체 한도는 16MB라 여유가 있다.

**기존 데이터 호환**: 지금 프로덕션에 있는 3개 공지(`개인정보처리방침 업데이트 안내` 등)는 HTML 태그 없는 평문이다. 이걸 그대로 `dangerouslySetInnerHTML`로 렌더링해도 태그가 없으니 깨지진 않지만, 지금까지는 CSS `white-space: pre-wrap`로 `\n` 줄바꿈을 살렸는데 HTML 렌더링에서는 이 스타일이 없으면 줄바꿈이 사라진다. 렌더링 컨테이너에 `white-space: pre-line`을 계속 적용해서 해결한다(새 HTML의 `<p>`/`<br>` 같은 블록 요소는 `pre-line`이 있어도 정상 렌더링되고, 옛 평문의 `\n`도 그대로 줄바꿈으로 보인다) — 별도 데이터 마이그레이션 스크립트 불필요.

## B. 백엔드 — sanitize, 검증, 정렬

**왜 서버 사이드 sanitize가 필요한가**: 에디터가 만든 HTML을 검증 없이 그대로 저장하면, 관리자 계정 탈취나 요청 조작(devtools로 body를 직접 편집해 보내는 등) 시 그 HTML이 **모든 방문자**에게 그대로 실행되는 저장형 XSS가 된다. 공지는 로그인 여부와 무관하게 전체 공개이므로 피해 범위가 크다. 클라이언트 에디터를 신뢰하지 않고 저장 직전 서버에서 한 번 더 걸러낸다.

**새 의존성**: `server/package.json`에 `sanitize-html` 추가(MIT, Node용 HTML 화이트리스트 sanitizer, 별도 브라우저 DOM 필요 없음).

**`server/routes/adminNotices.js`**에 sanitize + 검증 로직 추가:

```js
const sanitizeHtml = require("sanitize-html");

const SANITIZE_OPTIONS = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "a", "img", "ul", "ol", "li"],
  allowedAttributes: { a: ["href"], img: ["src"] },
  allowedSchemesByTag: { img: ["data"] }, // img는 data: URI만 허용(외부 URL/스크립트 스킴 차단)
  allowedSchemes: ["http", "https"], // a href는 http/https만
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

const IMAGE_SRC_RE = /<img[^>]+src="(data:image\/(?:jpeg|png|webp);base64,[^"]*)"/g;
const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000; // 이미지 1장당(게시글 이미지와 동일 기준)
const MAX_BODY_LEN = 12_000_000; // sanitize 후 전체 body

function sanitizeAndValidateBody(rawBody) {
  const clean = sanitizeHtml(rawBody, SANITIZE_OPTIONS);
  if (clean.length > MAX_BODY_LEN) {
    throw new ValidationError("내용이 너무 커요");
  }
  const images = [...clean.matchAll(IMAGE_SRC_RE)];
  if (images.length > MAX_IMAGES) {
    throw new ValidationError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`);
  }
  for (const [, src] of images) {
    if (src.length > MAX_IMAGE_LEN) {
      throw new ValidationError("이미지 용량이 너무 커요");
    }
  }
  return clean;
}
```

(`ValidationError`는 이 라우트 파일 안에서만 쓰는 간단한 에러 클래스로, catch에서 400으로 변환한다. 기존 코드 컨벤션에 맞춰 실제 구현 시 조정 가능.)

`POST /` , `PATCH /:id`에서 `body`를 저장하기 전에 `sanitizeAndValidateBody(body)`를 거친다. `pinned`는 `boolean`이면 그대로 반영(둘 다 optional — 안 보내면 `pinned`는 기본 `false`/기존 값 유지).

**`server/routes/notices.js`의 `GET /`**: 정렬을 `.sort({ pinned: -1, createdAt: -1 })`로 변경 — 고정 공지가 먼저, 그 안에서는 최신순, 그다음 일반 공지 최신순. `serializeNotice`에 `pinned` 필드 추가(양쪽 라우트 파일이 각자 `serializeNotice`를 갖고 있으므로 둘 다 수정).

**`server/index.js`**: `/api/admin/notices` 경로 전용으로 `express.json({ limit: "15mb" })`를 추가한다(공지 본문에 이미지 여러 장이 들어갈 수 있어, `body`의 12MB 한도보다 여유 있게 잡는다).

## C. 프론트엔드 — 리치 텍스트 에디터

**새 의존성**(루트 `package.json`): `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`. TipTap은 ProseMirror 기반 React 에디터로, 필요한 확장만 골라 붙일 수 있어 결과 HTML을 백엔드 화이트리스트(B 섹션)와 1:1로 맞추기 쉽다.

**`app/(shell)/community/NoticeEditor.tsx`**(새 파일, client component): TipTap 에디터 + 미니 툴바를 감싼 컴포넌트.

- `StarterKit`은 heading/blockquote/codeBlock/horizontalRule/strike를 비활성화하고 paragraph, bold, italic, bulletList/orderedList/listItem, hardBreak만 남긴다 — 결과 HTML 태그를 서버 화이트리스트와 정확히 맞추기 위함. (사용자가 요청한 "굵게/링크/줄바꿈"에 리스트는 없었지만 StarterKit 기본 리스트는 서버 화이트리스트에 이미 포함해뒀으니 같이 둔다. 더 줄이고 싶으면 `bulletList`/`orderedList`도 끄고 서버 `allowedTags`에서 `ul/ol/li`를 뺄 수 있다.)
- 툴바 버튼: **B**(굵게), *I*(이탤릭), 🔗(링크 — 선택 영역 있으면 `window.prompt`로 URL 입력 후 적용, 없으면 비활성), 📷(이미지 — 파일 선택 → 리사이즈/압축 → 커서 위치에 삽입).
- 이미지 삽입 로직은 `app/(shell)/community/write/page.tsx`에 있는 `resizeImageFile`을 `app/(shell)/community/imageUtils.ts`로 옮겨 공유한다(게시글 작성 폼도 이 파일을 import하도록 바꾼다 — 로직 중복 제거).
- 클라이언트 측 제약(서버 검증과 동일한 값을 미리 걸어 UX 개선): 에디터 안 이미지 개수 5장 초과 시 삽입 차단 + 안내, 개별 이미지는 리사이즈 후에도 2MB 넘으면 그 이미지만 거부.
- Props: `value: string`(HTML), `onChange: (html: string) => void`. 내부적으로 `useEditor({ content: value, onUpdate: ({editor}) => onChange(editor.getHTML()) })`.

**`app/(shell)/community/page.tsx`**: 공지 작성/수정 인라인 폼의 `<textarea>`(본문)를 `<NoticeEditor>`로 교체. 작성 폼에 관리자 전용 "📌 상단 고정" 체크박스 추가(`pinned` state, `submitCreateNotice`/`submitEditNotice`에서 `POST`/`PATCH` body에 포함).

**`app/(shell)/community/types.ts`**: `NoticeItem`에 `pinned: boolean` 추가.

## D. 프론트엔드 — 목록/사이드바/상세 UI

**공지 상세**(`app/(shell)/community/notice/[id]/page.tsx`): `<p className="whitespace-pre-wrap">{notice.body}</p>` 를 `<div className="notice-body" dangerouslySetInnerHTML={{ __html: notice.body }} />`로 교체(서버가 이미 sanitize했으므로 안전). 고정 공지면 제목 위에 "📌 고정" 배지.

**`notice-body`용 CSS**(이 프로젝트엔 `@tailwindcss/typography`가 없으므로 최소 스타일을 직접 정의 — `app/globals.css`에 추가):

```css
.notice-body {
  white-space: pre-line; /* 옛 평문 공지의 \n 줄바꿈 호환 */
}
.notice-body p { margin-bottom: 0.75em; }
.notice-body img { max-width: 100%; border-radius: 0.75rem; margin: 0.5em 0; }
.notice-body a { color: var(--color-primary-dark); text-decoration: underline; }
.notice-body ul, .notice-body ol { margin: 0.5em 0 0.5em 1.25em; }
```

**공지 목록 카드**(`community/page.tsx`, 공지 탭): 관리자 CRUD 카드에도 순수 텍스트 미리보기가 필요하므로, `body`(HTML)에서 태그를 걷어낸 2줄 요약 + 본문 속 첫 이미지가 있으면 작은 정사각 썸네일을 오른쪽에 표시(게시글 목록 카드와 톤 통일). 고정 공지는 카드에 📌 배지 + 옅은 강조 배경(`bg-primary/5` 등 기존 팔레트 톤 재사용).

```ts
function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function firstImageSrc(html: string) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
}
```

목록 정렬은 서버가 이미 `pinned desc, createdAt desc`로 내려주므로 프론트는 받은 순서 그대로 렌더링.

**사이드바 "📋 공지사항" 카드**: 로직 변경 없음 — 서버가 이미 고정 공지를 앞쪽에 정렬해서 주므로 `notices.slice(0, 5)`가 자동으로 고정 공지 우선이 된다. 고정 공지에만 작은 📌 표시만 추가.

## 영향 범위 및 테스트

- 새 npm 의존성: 프론트 `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image` / 백엔드 `sanitize-html`.
- 변경 파일: `server/models/Notice.js`, `server/routes/notices.js`, `server/routes/adminNotices.js`, `server/index.js`, `server/package.json`, `server/tests/notice-routes.test.js`, `server/tests/admin-notices-routes.test.js`, `package.json`, `app/(shell)/community/types.ts`, `app/(shell)/community/page.tsx`, `app/(shell)/community/notice/[id]/page.tsx`, `app/(shell)/community/write/page.tsx`(공유 유틸 추출), `app/globals.css`. 새 파일: `app/(shell)/community/NoticeEditor.tsx`, `app/(shell)/community/imageUtils.ts`.
- 백엔드는 TDD(`node --test`) — 특히 sanitize 검증(스크립트 태그 제거, `javascript:` 링크 제거, 이미지 5장 초과/과대 이미지 400, 정렬이 pinned 우선인지)에 대한 테스트를 먼저 작성한다.
- 프론트는 tsc/eslint/build + 수동 확인: 관리자 계정으로 굵게/링크/이미지 여러 장 넣어 공지 작성 → 상세/목록/사이드바에서 정상 렌더링되는지, 고정 체크 시 목록 최상단으로 오는지, 비관리자/비로그인 눈에는 여전히 읽기 전용으로 보이는지, 기존(마이그레이션 전) 평문 공지 3개가 여전히 줄바꿈 유지한 채 깨지지 않고 보이는지, `<script>` 등을 브라우저 개발자도구로 강제로 body에 넣어 보내도 서버 응답에서 제거되는지(sanitize 확인).
- 참고(코드 변경 아님): TipTap 번들이 추가되면서 공지 작성 폼이 열리는 첫 화면의 JS 번들 크기가 늘어난다 — 지금 트래픽 규모에서 체감될 정도는 아니지만, 나중에 `next/dynamic`으로 에디터 컴포넌트만 지연 로드하는 최적화 여지가 있다.

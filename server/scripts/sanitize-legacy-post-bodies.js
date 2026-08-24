// 1회성 스크립트: 리치 텍스트 에디터 도입 전에 평문(\n 줄바꿈만 있던)으로 저장된
// 기존 게시글 본문을 안전한 HTML로 변환한다. 이미 HTML 태그가 있는 본문은 건너뛴다
// (멱등적 — 여러 번 실행해도 안전).
//
// 실행: MONGODB_URI=<...> node scripts/sanitize-legacy-post-bodies.js

const mongoose = require("mongoose");
const Post = require("../models/Post");
const { sanitizeBody } = require("../lib/sanitizeHtml");

function isLegacyPlainText(body) {
  return !/<[a-z][^>]*>/i.test(body);
}

function legacyPlainTextToHtml(text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수가 필요합니다.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("DB 연결 성공");

  const posts = await Post.find({});
  let converted = 0;
  for (const post of posts) {
    if (!isLegacyPlainText(post.body)) continue;
    const html = sanitizeBody(legacyPlainTextToHtml(post.body));
    await Post.updateOne({ _id: post._id }, { $set: { body: html } }, { timestamps: false });
    converted++;
  }
  console.log(`평문 → HTML 변환 완료: ${converted}건 (전체 ${posts.length}건 중)`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("변환 중 오류:", err);
  process.exit(1);
});

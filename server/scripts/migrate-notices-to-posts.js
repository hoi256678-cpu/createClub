// 1회성 스크립트: 기존 Notice 컬렉션의 문서를 Post 컬렉션으로 옮기고 Notice
// 컬렉션을 지운다. Notice에는 작성자 개념이 없었으므로, role이 "admin"인
// 첫 User를 author로 지정한다.
//
// 실행: MONGODB_URI=<...> node scripts/migrate-notices-to-posts.js

const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 환경변수가 필요합니다.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("DB 연결 성공");

  const admin = await User.findOne({ role: "admin" });
  if (!admin) {
    console.error("admin 역할을 가진 사용자가 없습니다 — 마이그레이션을 진행할 수 없습니다.");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`이관 대상 공지의 author로 사용할 관리자: ${admin.name} (${admin.email})`);

  const db = mongoose.connection.db;
  const noticesCollection = db.collection("notices");
  const notices = await noticesCollection.find({}).toArray();
  console.log(`이관할 공지 ${notices.length}건 발견`);

  if (notices.length === 0) {
    console.log("이관할 공지가 없습니다. 종료합니다.");
    await mongoose.disconnect();
    return;
  }

  const docs = notices.map((n) => ({
    author: admin._id,
    tag: "공지",
    title: n.title,
    body: n.body,
    isNotice: true,
    pinned: n.pinned ?? false,
    createdAt: n.createdAt,
    editedAt: null,
  }));

  const created = await Post.create(docs, { timestamps: false });
  console.log(`Post로 이관 완료: ${created.length}건`);

  await noticesCollection.drop();
  console.log("notices 컬렉션 삭제 완료");

  await mongoose.disconnect();
  console.log("마이그레이션 완료");
}

main().catch((err) => {
  console.error("마이그레이션 중 오류:", err);
  process.exit(1);
});

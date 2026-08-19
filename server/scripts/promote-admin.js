require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function promote() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("사용법: node scripts/promote-admin.js <email>");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI가 설정되지 않았습니다. server/.env를 확인하거나 환경변수로 넘겨주세요.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { role: "admin" },
    { new: true },
  );

  if (!user) {
    throw new Error(`해당 이메일의 계정을 찾을 수 없습니다: ${email}`);
  }

  console.log(`관리자로 승격 완료: ${user.name} (${user.email})`);
  await mongoose.disconnect();
}

promote()
  .then(() => console.log("완료"))
  .catch((err) => {
    console.error("관리자 승격 중 오류:", err.message);
    process.exit(1);
  });

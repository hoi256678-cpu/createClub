require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const COUNSELORS = [
  {
    name: "이지원", email: "counselor1@example.com", major: "상담심리학과 4학년",
    bio: "시험 불안과 진로 고민을 많이 들어왔어요. 답을 주기보다 함께 정리해볼게요.",
    avatarBg: "#e8eff9", avatarColor: "#7a9cc5", specialties: ["학업", "진로", "감정"],
    rating: 4.9, ratingCount: 38, sessionCount: 112, recentSessions: 9, online: true,
  },
  {
    name: "박재현", email: "counselor2@example.com", major: "청소년상담 전공 3학년",
    bio: "친구 관계, 가족과의 갈등을 주로 다뤄요. 편하게 말 걸어주세요.",
    avatarBg: "#e1f5ee", avatarColor: "#0F6E56", specialties: ["관계", "가족"],
    rating: 4.7, ratingCount: 21, sessionCount: 64, recentSessions: 3, online: false,
  },
  {
    name: "정하늘", email: "counselor3@example.com", major: "심리학과 4학년",
    bio: "자존감과 감정 조절에 관심이 많아요. 천천히 가도 괜찮아요.",
    avatarBg: "#fdf0e8", avatarColor: "#c47a4a", specialties: ["자존감", "감정"],
    rating: 4.8, ratingCount: 15, sessionCount: 41, recentSessions: 6, online: true,
  },
  {
    name: "윤서아", email: "counselor4@example.com", major: "상담심리학과 3학년",
    bio: "이제 막 시작했어요. 답을 주기보다 끝까지 듣는 것부터 잘하고 싶어요.",
    avatarBg: "#eee8f7", avatarColor: "#7c6aa8", specialties: ["학업", "관계"],
    rating: 0, ratingCount: 0, sessionCount: 1, recentSessions: 1, online: true,
  },
  {
    name: "임도윤", email: "counselor5@example.com", major: "심리학과 4학년",
    bio: "진로 때문에 오래 헤맸던 경험이 있어요. 천천히 같이 정리해봐요.",
    avatarBg: "#e6f0e8", avatarColor: "#5a8a63", specialties: ["진로", "자존감"],
    rating: 5.0, ratingCount: 2, sessionCount: 3, recentSessions: 0, online: false,
  },
];

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI가 설정되지 않았습니다. server/.env를 확인하거나 환경변수로 넘겨주세요.");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  for (const c of COUNSELORS) {
    // seed된 상담사 계정은 무작위 비밀번호를 쓴다 — 실제 로그인 테스트용이 아니라
    // /api/counselors 목록에 노출할 "표시용" 데이터를 만드는 스크립트다.
    // 상담사로 로그인해서 테스트하려면 /signup에서 역할을 "상담사"로 선택해 새 계정을 만들 것.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    await User.findOneAndUpdate(
      { email: c.email },
      {
        name: c.name,
        email: c.email,
        passwordHash,
        role: "counselor",
        counselorProfile: {
          major: c.major,
          bio: c.bio,
          avatarBg: c.avatarBg,
          avatarColor: c.avatarColor,
          specialties: c.specialties,
          rating: c.rating,
          ratingCount: c.ratingCount,
          sessionCount: c.sessionCount,
          recentSessions: c.recentSessions,
          online: c.online,
          verified: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`시드 완료: ${c.name} (${c.email})`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => console.log("전체 상담사 시드 완료"))
  .catch((err) => {
    console.error("시드 중 오류:", err);
    process.exit(1);
  });

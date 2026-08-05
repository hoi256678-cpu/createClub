export const TOPICS = ["MBTI", "스트레스", "마음", "관계", "진로", "감정", "학교", "고민"] as const;

export const TOPIC_EMOJI: Record<string, string> = {
  MBTI: "🧠",
  스트레스: "😤",
  마음: "💙",
  관계: "🤝",
  진로: "💼",
  감정: "😔",
  학교: "📚",
  고민: "🤔",
};

export const NOTICE_POSTS = [
  { id: "n1", title: "솜잇 서비스 이용 안내", time: "2024.03.01" },
  { id: "n2", title: "2024년 상담사 모집 안내", time: "2024.02.15" },
  { id: "n3", title: "개인정보처리방침 업데이트 안내", time: "2024.01.20" },
];

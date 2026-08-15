export type CounselorTag = "진로" | "학업" | "관계" | "가족" | "감정" | "자존감";

export type Review = {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt: string;
};

export type Counselor = {
  id: string;
  name: string;
  major: string;
  intro: string;
  avatarBg: string;
  avatarColor: string;
  tags: CounselorTag[];
  rating: number;
  reviewCount: number;
  sessionCount: number;
  /** 최근 7일 상담 횟수. 배정에서 기회를 고르게 나누는 데 쓴다. */
  recentSessions: number;
  /** 지금 바로 상담 가능한지 (타로봄의 'Live', 마인드카페의 '바로가능'에 해당) */
  online: boolean;
  reviews: Review[];
};

export const COUNSELORS: Counselor[] = [
  {
    id: "c1", name: "이지원", major: "상담심리학과 4학년",
    intro: "시험 불안과 진로 고민을 많이 들어왔어요. 답을 주기보다 함께 정리해볼게요.",
    avatarBg: "#e8eff9", avatarColor: "#7a9cc5",
    tags: ["학업", "진로", "감정"], rating: 4.9, reviewCount: 38, sessionCount: 112, recentSessions: 9, online: true,
    reviews: [
      { id: "r1", authorName: "익명", rating: 5, text: "제 말을 끊지 않고 끝까지 들어주셔서 좋았어요.", createdAt: "2026-08-10T10:00:00Z" },
      { id: "r2", authorName: "익명", rating: 5, text: "시험 불안이 저만 그런 게 아니라는 걸 알게 됐어요.", createdAt: "2026-08-08T10:00:00Z" },
    ],
  },
  {
    id: "c2", name: "박재현", major: "청소년상담 전공 3학년",
    intro: "친구 관계, 가족과의 갈등을 주로 다뤄요. 편하게 말 걸어주세요.",
    avatarBg: "#e1f5ee", avatarColor: "#0F6E56",
    tags: ["관계", "가족"], rating: 4.7, reviewCount: 21, sessionCount: 64, recentSessions: 3, online: false,
    reviews: [
      { id: "r3", authorName: "익명", rating: 5, text: "가족 얘기를 처음으로 편하게 했어요.", createdAt: "2026-08-05T10:00:00Z" },
    ],
  },
  {
    id: "c3", name: "정하늘", major: "심리학과 4학년",
    intro: "자존감과 감정 조절에 관심이 많아요. 천천히 가도 괜찮아요.",
    avatarBg: "#fdf0e8", avatarColor: "#c47a4a",
    tags: ["자존감", "감정"], rating: 4.8, reviewCount: 15, sessionCount: 41, recentSessions: 6, online: true,
    reviews: [
      { id: "r4", authorName: "익명", rating: 5, text: "저를 다그치지 않아서 좋았습니다.", createdAt: "2026-08-11T10:00:00Z" },
    ],
  },
  {
    id: "c4", name: "윤서아", major: "상담심리학과 3학년",
    intro: "이제 막 시작했어요. 답을 주기보다 끝까지 듣는 것부터 잘하고 싶어요.",
    avatarBg: "#eee8f7", avatarColor: "#7c6aa8",
    tags: ["학업", "관계"], rating: 0, reviewCount: 0, sessionCount: 1, recentSessions: 1, online: true,
    reviews: [],
  },
  {
    id: "c5", name: "임도윤", major: "심리학과 4학년",
    intro: "진로 때문에 오래 헤맸던 경험이 있어요. 천천히 같이 정리해봐요.",
    avatarBg: "#e6f0e8", avatarColor: "#5a8a63",
    tags: ["진로", "자존감"], rating: 5.0, reviewCount: 2, sessionCount: 3, recentSessions: 0, online: false,
    reviews: [
      { id: "r5", authorName: "익명", rating: 5, text: "조급해하지 않게 해주셔서 좋았어요.", createdAt: "2026-08-12T10:00:00Z" },
    ],
  },
];

export const ALL_TAGS: CounselorTag[] = ["진로", "학업", "관계", "가족", "감정", "자존감"];

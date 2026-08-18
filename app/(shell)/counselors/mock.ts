export type CounselorTag = "진로" | "학업" | "관계" | "가족" | "감정" | "자존감";

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
  /** 지금 바로 상담 가능한지 */
  online: boolean;
};

export const ALL_TAGS: CounselorTag[] = ["진로", "학업", "관계", "가족", "감정", "자존감"];

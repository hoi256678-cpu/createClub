export type CommunityComment = {
  av: string;
  name: string;
  role: string;
  text: string;
  date: string;
};

export type CommunityPost = {
  id: number;
  tag: string;
  title: string;
  author: string;
  gender: "남" | "여";
  age: number;
  time: string;
  views: number;
  likes: number;
  cmtCount: number;
  body: string;
  comments: CommunityComment[];
};

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

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 0,
    tag: "마음",
    title: "시험 기간마다 극심한 불안이 와요",
    author: "익명",
    gender: "여",
    age: 21,
    time: "30분 전",
    views: 52,
    likes: 6,
    cmtCount: 9,
    body: "중간고사 기간만 되면 아무것도 못 하겠어요.\n공부를 해야 한다는 걸 아는데, 책상 앞에 앉으면 가슴이 답답하고 손이 떨려요.\n이게 불안 장애인지, 그냥 긴장인지 구분이 안 돼서 더 무서워요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "시험 불안은 정말 많은 대학생이 겪어요. 시험 전날 밤에 복식 호흡을 10분만 해보세요.", date: "20분 전" },
    ],
  },
  {
    id: 1,
    tag: "MBTI",
    title: "INFP인데 팀플에서 너무 힘들어요",
    author: "달빛콩",
    gender: "여",
    age: 20,
    time: "1시간 전",
    views: 130,
    likes: 21,
    cmtCount: 14,
    body: "팀플을 하면 항상 제가 제일 많이 하는 것 같은데, 말을 못 해서 그냥 참게 돼요.\n인프피 특성상 갈등을 너무 싫어하다 보니까 불만도 표현을 못 하고...",
    comments: [
      { av: "🧠", name: "INFP4년차", role: "", text: "저도 같은 유형이에요. 카톡으로 의견 내면 말보다 훨씬 편하더라고요.", date: "40분 전" },
    ],
  },
  {
    id: 2,
    tag: "진로",
    title: "복수전공 할까요 말까요 진짜 모르겠어요",
    author: "갈팡질팡",
    gender: "남",
    age: 22,
    time: "2시간 전",
    views: 88,
    likes: 12,
    cmtCount: 11,
    body: "컴공 다니고 있는데 경영 복수전공을 생각 중이에요.\n취업에 도움이 될 것 같긴 한데, 이미 학점 관리도 빠듯한데 부전공까지 하면 너무 힘들 것 같고...",
    comments: [
      { av: "🎓", name: "졸업생", role: "", text: "저는 했는데 솔직히 힘들었어요. 그래도 취업할 때 메리트는 있었어요.", date: "1시간 전" },
    ],
  },
  {
    id: 3,
    tag: "감정",
    title: "자취 시작하고 갑자기 외로움이 밀려와요",
    author: "혼자사는중",
    gender: "남",
    age: 20,
    time: "3시간 전",
    views: 175,
    likes: 34,
    cmtCount: 19,
    body: "처음 자취를 시작했어요. 자유롭고 좋을 줄 알았는데...\n저녁에 밥 먹을 때랑 주말에 혼자 있을 때 외로움이 너무 커요.",
    comments: [
      { av: "🏠", name: "자취3년차", role: "", text: "처음엔 다 그래요! 저도 한 달은 진짜 힘들었어요.", date: "2시간 전" },
    ],
  },
  {
    id: 4,
    tag: "관계",
    title: "친구인데 자꾸 비교해서 상처받아요",
    author: "익명",
    gender: "여",
    age: 21,
    time: "4시간 전",
    views: 94,
    likes: 18,
    cmtCount: 13,
    body: "친한 친구인데, 만날 때마다 저랑 비교하는 말을 해요.\n악의는 없는 것 같은데 들을 때마다 기분이 나빠지고 자존감이 떨어져요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "의도가 없어도 상처는 상처예요. 한번 솔직하게 이야기해보는 게 좋을 것 같아요.", date: "2시간 전" },
    ],
  },
  {
    id: 5,
    tag: "스트레스",
    title: "과제 마감이 다 겹쳐서 멘탈이 터지기 직전이에요",
    author: "마감지옥",
    gender: "남",
    age: 23,
    time: "6시간 전",
    views: 203,
    likes: 41,
    cmtCount: 28,
    body: "이번 주에 레포트 3개, 발표 1개, 퀴즈 2개가 다 겹쳤어요.\n어디서부터 시작해야 할지 모르겠어서 오히려 아무것도 못 하고 있어요.",
    comments: [
      { av: "⏰", name: "시간관리꾼", role: "", text: "마감 순서대로 할 일 목록 쓰고 딱 한 가지만 시작하는 거예요.", date: "5시간 전" },
    ],
  },
  {
    id: 6,
    tag: "학교",
    title: "수업 중에 발표할 때 목소리가 떨려요",
    author: "소심한대학생",
    gender: "여",
    age: 19,
    time: "5시간 전",
    views: 112,
    likes: 22,
    cmtCount: 17,
    body: "신입생인데 수업 시간에 발표나 질문 받을 때마다 목소리가 떨리고 얼굴이 빨개져요.",
    comments: [
      { av: "🎤", name: "발표왕", role: "", text: "저도 1학년 때 엄청 심했어요. 소모임 스터디에서 작은 발표부터 연습하다 보니 많이 좋아졌어요.", date: "4시간 전" },
    ],
  },
  {
    id: 7,
    tag: "고민",
    title: "부모님이 원하는 진로랑 제가 하고 싶은 게 달라요",
    author: "방황중인",
    gender: "남",
    age: 22,
    time: "1일 전",
    views: 221,
    likes: 44,
    cmtCount: 31,
    body: "부모님은 공무원이나 대기업을 원하시는데, 저는 콘텐츠 창작 쪽으로 가고 싶어요.",
    comments: [
      { av: "🌿", name: "mindmap", role: "청소년상담사", text: "부모님의 걱정은 사랑에서 나오는 거예요. 구체적인 계획을 가지고 대화해보면 좀 더 열린 대화가 될 수 있어요.", date: "15시간 전" },
    ],
  },
];

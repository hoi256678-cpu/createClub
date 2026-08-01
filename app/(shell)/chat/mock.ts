export type ChatMessage = {
  id: number;
  from: "me" | "counselor";
  text: string;
  time: string;
};

export type ChatRoom = {
  id: string;
  counselorName: string;
  counselorRole: string;
  avatarBg: string;
  avatarColor: string;
  avatarLabel: string;
  lastMessage: string;
  unread: number;
  messages: ChatMessage[];
};

export const CHAT_ROOMS: ChatRoom[] = [
  {
    id: "room-1",
    counselorName: "이지원",
    counselorRole: "상담심리학과 4학년",
    avatarBg: "#e8eff9",
    avatarColor: "#7a9cc5",
    avatarLabel: "지",
    lastMessage: "네, 편하게 이야기해주세요 :)",
    unread: 1,
    messages: [
      { id: 1, from: "counselor", text: "안녕하세요! 솜잇에서 매칭된 이지원이에요 😊", time: "오후 2:01" },
      { id: 2, from: "counselor", text: "어떤 이야기든 편하게 나눠주시면 돼요.", time: "오후 2:01" },
      { id: 3, from: "me", text: "안녕하세요, 요즘 시험 때문에 너무 불안해서요...", time: "오후 2:03" },
      { id: 4, from: "counselor", text: "네, 편하게 이야기해주세요 :)", time: "오후 2:04" },
    ],
  },
  {
    id: "room-2",
    counselorName: "박재현",
    counselorRole: "청소년상담 전공 3학년",
    avatarBg: "#e1f5ee",
    avatarColor: "#0F6E56",
    avatarLabel: "박",
    lastMessage: "상담이 완료됐어요",
    unread: 0,
    messages: [
      { id: 1, from: "counselor", text: "오늘 상담은 여기까지 할게요. 고생하셨어요!", time: "어제" },
      { id: 2, from: "me", text: "감사합니다 덕분에 마음이 편해졌어요", time: "어제" },
    ],
  },
];

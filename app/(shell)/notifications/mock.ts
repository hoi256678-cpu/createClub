export type NotificationItem = {
  id: number;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  href?: string;
};

export const NOTIFICATIONS: NotificationItem[] = [
  { id: 1, icon: "🌿", title: "솜잇 상담 매칭 완료", desc: "이지원 상담사와 매칭됐어요. 채팅을 시작해보세요!", time: "방금 전", unread: true, href: "/chat/room-1" },
  { id: 2, icon: "📋", title: "심리검사 결과 안내", desc: "스트레스 검사를 완료하셨어요. 결과를 확인해보세요.", time: "10분 전", unread: true, href: "/test" },
  { id: 3, icon: "🌊", title: "솜잇에 오신 걸 환영해요!", desc: "오늘 하루도 솜잇이 함께할게요 💙", time: "30분 전", unread: false },
];

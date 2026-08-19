function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function MypageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2l8 3.5v5.5c0 4.8-3.2 8.9-8 10.5-4.8-1.6-8-5.7-8-10.5V5.5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export type NavItem = {
  href: string;
  label: string;
  requiresAuth: boolean;
  hideForRole?: "counselor" | "client";
  /** 이 역할일 때만 노출한다 (hideForRole과 반대 방향의 필터). */
  onlyForRole?: "admin";
  Icon: (props: { className?: string }) => React.JSX.Element;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "홈", requiresAuth: false, Icon: HomeIcon },
  { href: "/community", label: "커뮤니티", requiresAuth: false, Icon: CommunityIcon },
  { href: "/chat", label: "채팅 상담", requiresAuth: true, Icon: ChatIcon },
  { href: "/test", label: "심리검사", requiresAuth: false, hideForRole: "counselor", Icon: TestIcon },
  { href: "/mypage", label: "마이페이지", requiresAuth: true, Icon: MypageIcon },
  { href: "/admin", label: "관리자", requiresAuth: true, onlyForRole: "admin", Icon: AdminIcon },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function pageTitle(pathname: string): string {
  if (pathname === "/") return "홈";
  if (pathname.startsWith("/community/write")) return "글쓰기";
  if (pathname.startsWith("/community/")) return "게시글";
  if (pathname.startsWith("/community")) return "커뮤니티";
  if (pathname.startsWith("/chat/")) return "채팅방";
  if (pathname.startsWith("/chat")) return "채팅 상담";
  if (pathname.startsWith("/test")) return "심리검사";
  if (pathname.startsWith("/mypage")) return "마이페이지";
  if (pathname.startsWith("/counselors/")) return "상담사 프로필";
  if (pathname.startsWith("/counselors")) return "상담사 찾기";
  if (pathname.startsWith("/counselor-register")) return "상담사 등록";
  if (pathname.startsWith("/mood")) return "오늘의 기분";
  if (pathname.startsWith("/notifications")) return "알림";
  if (pathname.startsWith("/settings")) return "설정";
  return "솜잇";
}

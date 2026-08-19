"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/reports", label: "상담 신고" },
  { href: "/admin/counselors", label: "상담사 인증" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { setLoggedOut } = useAuthStatus();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggedOut();
      router.push("/");
    }
  }

  return (
    <div className="flex h-full w-[220px] flex-shrink-0 flex-col border-r border-border bg-surface p-4">
      <div className="mb-6 px-2 text-lg font-extrabold text-text">솜잇 관리자</div>
      <nav className="flex flex-1 flex-col gap-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                active ? "bg-primary-light text-primary-dark" : "text-text-muted hover:bg-bg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <Link href="/" className="rounded-xl px-3 py-2.5 text-sm font-bold text-text-muted hover:bg-bg">
          메인 사이트로
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger hover:bg-bg"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

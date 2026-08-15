"use client";

import Link from "next/link";
import AuthLink from "@/app/components/AuthLink";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function Sidebar({ pathname }: { pathname: string }) {
  const { state: auth } = useAuthStatus();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-border bg-surface shell:flex">
      <Link href="/" className="flex items-center gap-2.5 border-b border-border px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-dark to-primary-darker text-lg">
          🩵
        </div>
        <div>
          <div className="text-xl font-black tracking-tight text-text">솜잇</div>
          <div className="text-[11px] text-text-muted">또래 상담 플랫폼</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="mb-1 px-2 text-[10px] font-bold tracking-wider text-text-faint">메인</div>
        {NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <AuthLink
              key={href}
              href={href}
              requiresAuth={requiresAuth}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary-light text-primary-dark"
                  : "text-text-muted hover:bg-primary-light hover:text-primary-dark"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </AuthLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href={auth.phase === "in" ? "/mypage" : "/login?next=%2Fmypage"}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary-light"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-dark to-primary-darker text-sm font-extrabold text-white">
            {auth.phase === "in" ? auth.name.slice(0, 1) : "나"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-text">
              {auth.phase === "in" ? auth.name : "로그인 해주세요"}
            </div>
            <div className="text-[11px] text-text-muted">
              {auth.phase === "in"
                ? auth.role === "counselor"
                  ? "🌿 상담사"
                  : "🌱 고민 청소년"
                : "👆 클릭해서 로그인"}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}

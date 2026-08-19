"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthStatus from "@/app/components/AuthStatus";
import NotificationPanel from "@/app/components/shell/NotificationPanel";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useNotifications } from "@/app/hooks/useNotifications";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function TopBar({ title }: { title: string }) {
  const { state: auth } = useAuthStatus();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const badge = unreadCount > 0 && (
    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
  );

  return (
    <header className="sticky top-0 z-10 flex h-[60px] items-center gap-4 border-b border-border bg-surface px-4 shell:px-8">
      <div className="flex-1 text-[18px] font-extrabold text-text">{title}</div>
      <div className="flex items-center gap-3">
        {auth.phase !== "out" && (
          <>
            {/* 모바일: 알림 페이지로 바로 이동 */}
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-primary-light hover:text-primary-dark shell:hidden"
              title="알림"
            >
              <BellIcon />
              {badge}
            </Link>

            {/* 데스크톱: 눌러서 작은 드롭다운으로 열고 닫기 */}
            <div className="relative hidden shell:block" ref={panelRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-primary-light hover:text-primary-dark"
                title="알림"
              >
                <BellIcon />
                {badge}
              </button>
              {open && (
                <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-surface shadow-card-md">
                  <NotificationPanel scrollable onNavigate={() => setOpen(false)} />
                </div>
              )}
            </div>
          </>
        )}
        <AuthStatus />
      </div>
    </header>
  );
}

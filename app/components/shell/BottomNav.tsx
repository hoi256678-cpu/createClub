"use client";

import AuthLink from "@/app/components/AuthLink";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function BottomNav({ pathname }: { pathname: string }) {
  const { state: auth } = useAuthStatus();
  const { unreadCount } = useChatRooms();
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !(auth.phase === "in" && item.hideForRole === auth.role),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shell:hidden">
      {visibleNavItems.map(({ href, label, requiresAuth, Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <AuthLink
            key={href}
            href={href}
            requiresAuth={requiresAuth}
            className={`flex flex-col items-center gap-1 px-2 text-[10px] font-bold ${
              active ? "text-primary-dark" : "text-text-faint"
            }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {href === "/chat" && unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
              )}
            </span>
            {label}
          </AuthLink>
        );
      })}
    </nav>
  );
}

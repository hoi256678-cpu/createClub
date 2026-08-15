"use client";

import AuthLink from "@/app/components/AuthLink";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function BottomNav({ pathname }: { pathname: string }) {

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shell:hidden">
      {NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {
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
            <Icon className="h-5 w-5" />
            {label}
          </AuthLink>
        );
      })}
    </nav>
  );
}

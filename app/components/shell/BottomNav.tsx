"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function BottomNav({ pathname }: { pathname: string }) {
  const [auth] = useAuthStatus();
  const router = useRouter();

  function handleNavClick(e: React.MouseEvent, href: string, requiresAuth: boolean) {
    if (requiresAuth && auth.phase !== "in") {
      e.preventDefault();
      router.push("/login");
    }
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-around border-t border-border bg-surface shell:hidden">
      {NAV_ITEMS.map(({ href, label, requiresAuth, Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={(e) => handleNavClick(e, href, requiresAuth)}
            className={`flex flex-col items-center gap-1 px-2 text-[10px] font-bold ${
              active ? "text-primary-dark" : "text-text-faint"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

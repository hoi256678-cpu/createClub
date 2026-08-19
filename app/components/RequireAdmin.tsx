"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStatus, type AuthState } from "@/app/hooks/useAuthStatus";
import { loginHref } from "@/app/components/RequireAuth";

type LoggedInAdminState = Extract<AuthState, { phase: "in" }>;

export default function RequireAdmin({
  children,
}: {
  children: React.ReactNode | ((auth: LoggedInAdminState) => React.ReactNode);
}) {
  const { state } = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.phase === "loading") return;
    if (state.phase === "out") {
      const search = typeof window === "undefined" ? "" : window.location.search;
      router.replace(loginHref(`${pathname}${search}`));
      return;
    }
    if (state.role !== "admin") {
      router.replace("/");
    }
  }, [state, router, pathname]);

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-text-muted">
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary-dark"
        />
        로그인 상태를 확인하고 있어요...
      </div>
    );
  }

  if (state.phase === "out" || state.role !== "admin") {
    return (
      <div className="px-6 py-24 text-center text-sm leading-relaxed text-text-muted">
        관리자만 접근할 수 있는 페이지예요.
        <span className="mt-1 block text-text-faint">이동 중이에요...</span>
      </div>
    );
  }

  return <>{typeof children === "function" ? children(state) : children}</>;
}

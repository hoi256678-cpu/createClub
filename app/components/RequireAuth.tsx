"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStatus, type AuthState } from "@/app/hooks/useAuthStatus";

type LoggedInState = Extract<AuthState, { phase: "in" }>;

export function loginHref(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export default function RequireAuth({
  children,
  reason,
}: {
  children: React.ReactNode | ((auth: LoggedInState) => React.ReactNode);
  /** 계정이 필요한 이유. 비워두면 기본 문구를 쓴다. */
  reason?: string;
}) {
  const { state } = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.phase !== "out") return;
    // 쿼리스트링까지 포함해 원래 가려던 곳을 기억한다. (effect 안이므로 window 접근이 안전)
    const search = typeof window === "undefined" ? "" : window.location.search;
    // replace를 써야 로그인 후 뒤로가기가 이 페이지로 되돌아오는 루프에 빠지지 않는다.
    router.replace(loginHref(`${pathname}${search}`));
  }, [state, router, pathname]);

  // 세션 확인이 끝나기 전에 null을 반환하면 백엔드가 느릴 때 흰 화면만 보인다.
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

  if (state.phase === "out") {
    return (
      <div className="px-6 py-24 text-center text-sm leading-relaxed text-text-muted">
        {reason ?? "로그인이 필요한 페이지예요."}
        <span className="mt-1 block text-text-faint">로그인 화면으로 이동할게요...</span>
      </div>
    );
  }

  return <>{typeof children === "function" ? children(state) : children}</>;
}

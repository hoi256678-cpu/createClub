"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";

export default function AuthStatus() {
  const { state, setLoggedOut } = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      // 네트워크가 실패해도 클라이언트 상태는 반드시 로그아웃으로 내린다.
      setLoggedOut();
      router.push("/");
    }
  }

  if (state.phase === "loading") return null;

  if (state.phase === "in") {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs font-semibold text-text-muted shell:inline">
          {state.name}님
        </span>
        <button
          onClick={handleLogout}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary-dark hover:text-primary-dark"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs font-bold">
      <Link href="/login" className="text-text-muted hover:text-primary-dark">
        로그인
      </Link>
      <span className="text-text-faint">·</span>
      <Link href="/signup" className="text-text-muted hover:text-primary-dark">
        회원가입
      </Link>
    </div>
  );
}

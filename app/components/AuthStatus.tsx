"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | { phase: "in"; name: string; role: "counselor" | "client" };

export default function AuthStatus() {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setState({ phase: "out" });
          return;
        }
        const data = (await res.json()) as {
          name: string;
          role: "counselor" | "client";
        };
        if (!cancelled) {
          setState({ phase: "in", name: data.name, role: data.role });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "out" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setState({ phase: "out" });
  }

  if (state.phase === "loading") {
    return null;
  }

  if (state.phase === "in") {
    return (
      <div className="mt-6 flex items-center gap-3 font-mono text-xs text-muted">
        <span>{state.name}님 환영합니다</span>
        <button
          onClick={handleLogout}
          className="rounded-full border border-line px-3 py-1 text-muted transition-colors hover:border-accent hover:text-paper"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-3 font-mono text-xs text-muted">
      <Link href="/login" className="hover:text-paper">
        로그인
      </Link>
      <span>·</span>
      <Link href="/signup" className="hover:text-paper">
        회원가입
      </Link>
    </div>
  );
}

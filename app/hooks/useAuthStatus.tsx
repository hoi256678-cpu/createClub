"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

export type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | { phase: "in"; name: string; role: "counselor" | "client" };

type AuthContextValue = readonly [AuthState, Dispatch<SetStateAction<AuthState>>];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    function fetchMe() {
      apiFetch("/api/auth/me")
        .then(async (res) => {
          if (!res.ok) {
            if (!cancelled) setState({ phase: "out" });
            return;
          }
          const data = (await res.json()) as { name: string; role: "counselor" | "client" };
          if (!cancelled) setState({ phase: "in", name: data.name, role: data.role });
        })
        .catch(() => {
          if (!cancelled) setState({ phase: "out" });
        });
    }

    fetchMe();

    // 뒤로/앞으로가기로 bfcache에서 페이지가 복원되면 로그인 상태를 다시 확인한다.
    // (그렇지 않으면 로그아웃 이후에도 캐시된 이전 로그인 상태가 그대로 보임)
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) fetchMe();
    }
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <AuthContext.Provider value={[state, setState] as const}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthStatus(): readonly [AuthState, Dispatch<SetStateAction<AuthState>>] {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthStatus must be used within an AuthProvider");
  }
  return ctx;
}

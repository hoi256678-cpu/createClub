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

    return () => {
      cancelled = true;
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

"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "@/lib/api";

export type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | { phase: "in"; name: string; role: "counselor" | "client" };

export function useAuthStatus(): readonly [AuthState, Dispatch<SetStateAction<AuthState>>] {
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

  return [state, setState] as const;
}

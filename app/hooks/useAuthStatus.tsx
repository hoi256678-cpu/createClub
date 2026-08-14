"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

export type LoggedInUser = { name: string; role: "counselor" | "client" };

export type AuthState =
  | { phase: "loading" }
  | { phase: "out" }
  | ({ phase: "in" } & LoggedInUser);

type AuthContextValue = {
  state: AuthState;
  /** 로그인/회원가입 성공 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedIn: (user: LoggedInUser) => void;
  /** 로그아웃 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedOut: () => void;
  /** 서버에 현재 세션을 다시 물어본다. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: "loading" });

  // 요청 세대(generation) 번호.
  // 로그인/로그아웃처럼 "확실한" 상태 변경이 일어나면 번호를 올려서,
  // 그보다 먼저 출발한 /me 응답이 뒤늦게 도착해도 무시되도록 한다.
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commit = useCallback((next: AuthState) => {
    generationRef.current += 1;
    if (mountedRef.current) setState(next);
  }, []);

  const refresh = useCallback(async () => {
    const myGeneration = generationRef.current;
    try {
      const res = await apiFetch("/api/auth/me");
      // 내가 출발한 뒤에 로그인/로그아웃이 일어났다면 이 응답은 이미 낡은 정보다.
      if (myGeneration !== generationRef.current || !mountedRef.current) return;

      if (!res.ok) {
        setState({ phase: "out" });
        return;
      }
      const data = (await res.json()) as LoggedInUser;
      if (myGeneration !== generationRef.current || !mountedRef.current) return;
      setState({ phase: "in", name: data.name, role: data.role });
    } catch {
      if (myGeneration !== generationRef.current || !mountedRef.current) return;
      setState({ phase: "out" });
    }
  }, []);

  const setLoggedIn = useCallback(
    (user: LoggedInUser) => commit({ phase: "in", name: user.name, role: user.role }),
    [commit],
  );

  const setLoggedOut = useCallback(() => commit({ phase: "out" }), [commit]);

  useEffect(() => {
    refresh();

    // 뒤로/앞으로가기로 bfcache에서 복원되거나, 다른 탭에서 로그아웃한 뒤
    // 이 탭으로 돌아왔을 때 세션을 다시 확인한다.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) refresh();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ state, setLoggedIn, setLoggedOut, refresh }),
    [state, setLoggedIn, setLoggedOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthStatus(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthStatus must be used within an AuthProvider");
  }
  return ctx;
}

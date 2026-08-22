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

export type NotificationPrefs = { chatMessages: boolean; systemAlerts: boolean };

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { chatMessages: true, systemAlerts: true };

export type LoggedInUser = {
  name: string;
  role: "counselor" | "client" | "admin";
  notificationPrefs?: NotificationPrefs;
};

type LoggedInAuth = { name: string; role: "counselor" | "client" | "admin"; notificationPrefs: NotificationPrefs };

export type AuthState = { phase: "loading" } | { phase: "out" } | ({ phase: "in" } & LoggedInAuth);

type AuthContextValue = {
  state: AuthState;
  /** 로그인/회원가입 성공 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedIn: (user: LoggedInUser) => void;
  /** 로그아웃 시 호출. 진행 중인 /me 응답보다 항상 우선한다. */
  setLoggedOut: () => void;
  /** 서버에 현재 세션을 다시 물어본다. */
  refresh: () => Promise<void>;
  /** 알림 설정을 낙관적으로 반영하고 서버에 저장한다. 실패하면 refresh()로 되돌린다. */
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => void;
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
      setState({
        phase: "in",
        name: data.name,
        role: data.role,
        notificationPrefs: data.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      });
    } catch {
      if (myGeneration !== generationRef.current || !mountedRef.current) return;
      setState({ phase: "out" });
    }
  }, []);

  const setLoggedIn = useCallback(
    (user: LoggedInUser) =>
      commit({
        phase: "in",
        name: user.name,
        role: user.role,
        notificationPrefs: user.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      }),
    [commit],
  );

  const setLoggedOut = useCallback(() => commit({ phase: "out" }), [commit]);

  const updateNotificationPrefs = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      generationRef.current += 1;
      setState((prev) =>
        prev.phase === "in" ? { ...prev, notificationPrefs: { ...prev.notificationPrefs, ...patch } } : prev,
      );
      apiFetch("/api/auth/notification-prefs", { method: "PATCH", body: JSON.stringify(patch) })
        .then((res) => {
          if (!res.ok) refresh();
        })
        .catch(() => refresh());
    },
    [refresh],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 세션 조회, setState는 refresh() 내부 await 이후에 일어난다
    refresh();

    // 뒤로/앞으로가기로 bfcache에서 복원되거나, 다른 탭에서 로그아웃한 뒤
    // 이 탭으로 돌아왔을 때 세션을 다시 확인한다.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        // bfcache에서 즉시 복원된 화면은 다른 계정으로 로그인한 상태에서도
        // 이전 계정의 role-gated UI를 그대로 보여줄 수 있다. /me 응답을 기다리지 않고
        // 먼저 "loading"으로 되돌려서 그 짧은 창 동안은 중립/허용적인 화면(스피너, 전체 메뉴)이
        // 보이게 한다 — RequireAuth와 Sidebar/BottomNav는 이미 phase !== "in"을 안전하게 처리한다.
        commit({ phase: "loading" });
        refresh();
      }
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
  }, [refresh, commit]);

  const value = useMemo(
    () => ({ state, setLoggedIn, setLoggedOut, refresh, updateNotificationPrefs }),
    [state, setLoggedIn, setLoggedOut, refresh, updateNotificationPrefs],
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

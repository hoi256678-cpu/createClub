"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NOTIFICATIONS, type NotificationItem } from "@/app/(shell)/notifications/mock";
import { readJSON, writeJSON } from "@/lib/storage";

const STORAGE_KEY = "somit:notifications:read";

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: number) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  // 읽은 알림 id 목록만 저장한다. 목록 자체(NOTIFICATIONS)가 바뀌어도 안전하다.
  const [readIds, setReadIds] = useState<number[]>([]);

  // localStorage는 렌더 중에 읽으면 서버/클라이언트 HTML이 달라져 하이드레이션이 깨진다.
  // 반드시 마운트 후 effect에서 읽는다.
  useEffect(() => {
    setReadIds(readJSON<number[]>(STORAGE_KEY, []));
  }, []);

  const persist = useCallback((next: number[]) => {
    setReadIds(next);
    writeJSON(STORAGE_KEY, next);
  }, []);

  const markRead = useCallback(
    (id: number) => {
      setReadIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        writeJSON(STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  const markAllRead = useCallback(() => {
    persist(NOTIFICATIONS.map((n) => n.id));
  }, [persist]);

  const items = useMemo(
    () => NOTIFICATIONS.map((n) => ({ ...n, unread: n.unread && !readIds.includes(n.id) })),
    [readIds],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const value = useMemo(
    () => ({ items, unreadCount, markRead, markAllRead }),
    [items, unreadCount, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}

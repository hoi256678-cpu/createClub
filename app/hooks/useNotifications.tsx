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
import { formatRelativeTime } from "@/app/(shell)/community/time";
import { readJSON, writeJSON } from "@/lib/storage";
import { useChatRooms } from "./useChatRooms";

const STORAGE_KEY = "somit:notifications:read";

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string | number) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  // 읽은 mock 알림 id 목록만 저장한다. 채팅 알림은 useChatRooms의 읽음상태를 그대로 쓴다.
  const [readIds, setReadIds] = useState<number[]>([]);
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();

  // localStorage는 렌더 중에 읽으면 서버/클라이언트 HTML이 달라져 하이드레이션이 깨진다.
  // 반드시 마운트 후 effect에서 읽는다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadIds(readJSON<number[]>(STORAGE_KEY, []));
  }, []);

  const persist = useCallback((next: number[]) => {
    setReadIds(next);
    writeJSON(STORAGE_KEY, next);
  }, []);

  const markRead = useCallback(
    (id: string | number) => {
      if (typeof id === "string" && id.startsWith("chat:")) {
        markRoomRead(id.slice("chat:".length));
        return;
      }
      setReadIds((prev) => {
        if (prev.includes(id as number)) return prev;
        const next = [...prev, id as number];
        writeJSON(STORAGE_KEY, next);
        return next;
      });
    },
    [markRoomRead],
  );

  const markAllRead = useCallback(() => {
    persist(NOTIFICATIONS.map((n) => n.id as number));
    rooms.filter(isRoomUnread).forEach((r) => markRoomRead(r.id));
  }, [persist, rooms, isRoomUnread, markRoomRead]);

  const chatItems = useMemo<NotificationItem[]>(
    () =>
      rooms
        .filter(isRoomUnread)
        .map((r) => ({
          id: `chat:${r.id}`,
          icon: "💬",
          title: `${r.otherPartyName}님이 메시지를 보냈어요`,
          desc: r.lastMessage ?? "",
          time: formatRelativeTime(r.lastMessageAt),
          unread: true,
          href: `/chat/${r.id}`,
        })),
    [rooms, isRoomUnread],
  );

  const items = useMemo<NotificationItem[]>(
    () => [
      ...chatItems,
      ...NOTIFICATIONS.map((n) => ({ ...n, unread: n.unread && !readIds.includes(n.id as number) })),
    ],
    [chatItems, readIds],
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

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
import { useAuthStatus } from "./useAuthStatus";
import { useChatRooms } from "./useChatRooms";

const READ_STORAGE_KEY = "somit:notifications:read";
const DELETED_STORAGE_KEY = "somit:notifications:deleted";

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string | number) => void;
  markAllRead: () => void;
  /** 알림을 목록에서 지운다. mock 알림은 다시 보이지 않고, 채팅 알림은 읽음 처리(=배지도 같이 사라짐)와 동일하게 동작한다. */
  deleteNotification: (id: string | number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  // 읽은/삭제한 mock 알림 id 목록만 저장한다. 채팅 알림은 useChatRooms의 읽음상태를 그대로 쓴다.
  const [readIds, setReadIds] = useState<number[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();
  const { state: auth } = useAuthStatus();
  // mock 알림(상담 매칭/심리검사 결과/환영)은 client 전용 시나리오라 상담사 계정에는 보여주지 않는다.
  const isCounselor = auth.phase === "in" && auth.role === "counselor";
  const mockNotifications = useMemo(() => (isCounselor ? [] : NOTIFICATIONS), [isCounselor]);

  // localStorage는 렌더 중에 읽으면 서버/클라이언트 HTML이 달라져 하이드레이션이 깨진다.
  // 반드시 마운트 후 effect에서 읽는다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadIds(readJSON<number[]>(READ_STORAGE_KEY, []));
    setDeletedIds(readJSON<number[]>(DELETED_STORAGE_KEY, []));
  }, []);

  const persist = useCallback((next: number[]) => {
    setReadIds(next);
    writeJSON(READ_STORAGE_KEY, next);
  }, []);

  const markRead = useCallback(
    (id: string | number) => {
      if (typeof id === "string" && id.startsWith("chat:")) {
        const roomId = id.slice("chat:".length);
        const room = rooms.find((r) => r.id === roomId);
        if (room) markRoomRead(room.id, room.lastMessageAt);
        return;
      }
      setReadIds((prev) => {
        if (prev.includes(id as number)) return prev;
        const next = [...prev, id as number];
        writeJSON(READ_STORAGE_KEY, next);
        return next;
      });
    },
    [rooms, markRoomRead],
  );

  const markAllRead = useCallback(() => {
    persist(mockNotifications.map((n) => n.id as number));
    rooms.filter(isRoomUnread).forEach((r) => markRoomRead(r.id, r.lastMessageAt));
  }, [persist, rooms, isRoomUnread, markRoomRead, mockNotifications]);

  const deleteNotification = useCallback(
    (id: string | number) => {
      if (typeof id === "string" && id.startsWith("chat:")) {
        // 채팅 알림은 별도 저장소가 없다 — 안읽음 상태에서 파생될 뿐이라, 지우는 것도 읽음 처리와 동일하다.
        markRead(id);
        return;
      }
      setDeletedIds((prev) => {
        if (prev.includes(id as number)) return prev;
        const next = [...prev, id as number];
        writeJSON(DELETED_STORAGE_KEY, next);
        return next;
      });
    },
    [markRead],
  );

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
      ...mockNotifications
        .filter((n) => !deletedIds.includes(n.id as number))
        .map((n) => ({ ...n, unread: n.unread && !readIds.includes(n.id as number) })),
    ],
    [chatItems, readIds, deletedIds, mockNotifications],
  );

  const unreadCount = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const value = useMemo(
    () => ({ items, unreadCount, markRead, markAllRead, deleteNotification }),
    [items, unreadCount, markRead, markAllRead, deleteNotification],
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

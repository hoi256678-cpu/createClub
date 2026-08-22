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
import { formatRelativeTime } from "@/app/(shell)/community/time";
import { useAuthStatus, DEFAULT_NOTIFICATION_PREFS } from "./useAuthStatus";
import { useChatRooms } from "./useChatRooms";
import { usePolling } from "./usePolling";

const POLL_INTERVAL_MS = 5000;

export type NotificationItem = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  href?: string;
};

type ServerNotification = {
  id: string;
  icon: string;
  title: string;
  desc: string;
  href?: string;
  unread: boolean;
  time: string;
};

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** 알림을 목록에서 지운다. 서버 알림은 삭제 API를 호출하고, 채팅 알림은 읽음 처리(=배지도 같이 사라짐)와 동일하게 동작한다. */
  deleteNotification: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

async function fetchNotifications(
  setNotifications: (updater: (prev: ServerNotification[]) => ServerNotification[]) => void,
  isFirstLoad: boolean,
  generationRef: { current: number },
  myGeneration: number,
) {
  try {
    const res = await apiFetch("/api/notifications");
    // 이 요청이 출발한 뒤에 낙관적 업데이트(읽음/삭제)가 일어났다면 이 응답은 이미 낡은 정보다.
    if (myGeneration !== generationRef.current) return;
    if (res.ok) {
      const data = await res.json();
      if (myGeneration !== generationRef.current) return;
      // API가 배열이 아닌 값을 반환하는 경우(예상 밖의 200 응답)에도 화면이 깨지지 않도록 방어한다.
      setNotifications(() => (Array.isArray(data) ? data : []));
    } else if (isFirstLoad) {
      // 최초 로드 실패는 빈 목록으로 보여주는 게 맞다. 폴링 중 실패(콜드스타트 등)는
      // 이미 불러온 목록을 그대로 유지해서 화면이 갑자기 비지 않도록 한다.
      setNotifications(() => []);
    }
  } catch {
    if (myGeneration !== generationRef.current) return;
    if (isFirstLoad) setNotifications(() => []);
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { rooms, isRoomUnread, markRoomRead } = useChatRooms();
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";
  const notificationPrefs = auth.phase === "in" ? auth.notificationPrefs : DEFAULT_NOTIFICATION_PREFS;

  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const firstLoadDoneRef = useRef(false);

  // 요청 세대(generation) 번호. markRead/markAllRead/deleteNotification처럼
  // "확실한" 낙관적 업데이트가 일어나면 번호를 올려서, 그보다 먼저 출발한 GET 응답이
  // 뒤늦게 도착해 낙관적 업데이트를 덮어써버리는 걸 막는다 (useAuthStatus와 동일한 패턴).
  const generationRef = useRef(0);

  const refresh = useCallback(() => {
    const isFirstLoad = !firstLoadDoneRef.current;
    firstLoadDoneRef.current = true;
    const myGeneration = generationRef.current;
    return fetchNotifications(setNotifications, isFirstLoad, generationRef, myGeneration);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      // 로그아웃 상태거나 아직 인증 확인 중이면 조회하지 않는다. 로그아웃 직후엔
      // 이전 계정의 알림 목록/배지가 남아있지 않도록 비운다.
      firstLoadDoneRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그아웃 전환 시 이전 목록을 즉시 비운다
      setNotifications([]);
      return;
    }
    refresh();
  }, [isLoggedIn, refresh]);

  usePolling(refresh, isLoggedIn ? POLL_INTERVAL_MS : null);

  const markRead = useCallback(
    (id: string) => {
      if (id.startsWith("chat:")) {
        const roomId = id.slice("chat:".length);
        const room = rooms.find((r) => r.id === roomId);
        if (room) markRoomRead(room.id, room.lastMessageAt);
        return;
      }
      generationRef.current += 1;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
      // 성공/실패 여부와 무관하게 서버 상태로 다시 맞춘다 — 실패 시 낙관적 업데이트를
      // 최대 5초(다음 폴링)가 아니라 이 요청이 끝나는 즉시 되돌리기 위함이다.
      apiFetch(`/api/notifications/${id}/read`, { method: "POST" })
        .catch(() => {})
        .finally(() => refresh());
    },
    [rooms, markRoomRead, refresh],
  );

  const markAllRead = useCallback(() => {
    rooms.filter(isRoomUnread).forEach((r) => markRoomRead(r.id, r.lastMessageAt));
    generationRef.current += 1;
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    apiFetch("/api/notifications/read-all", { method: "POST" })
      .catch(() => {})
      .finally(() => refresh());
  }, [rooms, isRoomUnread, markRoomRead, refresh]);

  const deleteNotification = useCallback(
    (id: string) => {
      if (id.startsWith("chat:")) {
        // 채팅 알림은 별도 저장소가 없다 — 안읽음 상태에서 파생될 뿐이라, 지우는 것도 읽음 처리와 동일하다.
        markRead(id);
        return;
      }
      generationRef.current += 1;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      apiFetch(`/api/notifications/${id}`, { method: "DELETE" })
        .catch(() => {})
        .finally(() => refresh());
    },
    [markRead, refresh],
  );

  const chatItems = useMemo<NotificationItem[]>(
    () =>
      notificationPrefs.chatMessages
        ? rooms
            .filter(isRoomUnread)
            .map((r) => ({
              id: `chat:${r.id}`,
              icon: "💬",
              title: `${r.otherPartyName}님이 메시지를 보냈어요`,
              desc: r.lastMessage ?? "",
              time: formatRelativeTime(r.lastMessageAt),
              unread: true,
              href: `/chat/${r.id}`,
            }))
        : [],
    [rooms, isRoomUnread, notificationPrefs.chatMessages],
  );

  const serverItems = useMemo<NotificationItem[]>(
    () =>
      notificationPrefs.systemAlerts ? notifications.map((n) => ({ ...n, time: formatRelativeTime(n.time) })) : [],
    [notifications, notificationPrefs.systemAlerts],
  );

  const items = useMemo<NotificationItem[]>(() => [...chatItems, ...serverItems], [chatItems, serverItems]);

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

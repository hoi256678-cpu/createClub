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
import { apiFetch } from "@/lib/api";
import { readJSON, writeJSON } from "@/lib/storage";
import { useAuthStatus } from "./useAuthStatus";
import { usePolling } from "./usePolling";

const READ_STATE_KEY = "somit:chat:read";
const POLL_INTERVAL_MS = 5000;

export type ChatRoom = {
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyMajor: string;
  otherPartyAvatarBg: string;
  otherPartyAvatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageFrom: "client" | "counselor" | null;
  createdAt: string;
};

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  unreadCount: number;
  /** 종료/신고 등으로 목록이 바뀐 뒤 다시 불러올 때 쓴다. */
  refresh: () => Promise<void>;
  markRoomRead: (id: string) => void;
  isRoomUnread: (room: ChatRoom) => boolean;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

async function fetchChatRooms(
  setRooms: (rooms: ChatRoom[]) => void,
  setLoading: (loading: boolean) => void,
) {
  try {
    const res = await apiFetch("/api/counseling/rooms");
    setRooms(res.ok ? await res.json() : []);
  } catch {
    setRooms([]);
  } finally {
    setLoading(false);
  }
}

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuthStatus();
  const myRole = auth.phase === "in" ? auth.role : null;

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [readState, setReadState] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadState(readJSON<Record<string, string>>(READ_STATE_KEY, {}));
  }, []);

  const refresh = useCallback(() => fetchChatRooms(setRooms, setLoading), []);

  useEffect(() => {
    fetchChatRooms(setRooms, setLoading);
  }, []);

  usePolling(refresh, POLL_INTERVAL_MS);

  const markRoomRead = useCallback((id: string) => {
    setReadState((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      writeJSON(READ_STATE_KEY, next);
      return next;
    });
  }, []);

  const isRoomUnread = useCallback(
    (room: ChatRoom) => {
      if (!myRole || !room.lastMessageFrom || room.lastMessageFrom === myRole) return false;
      const lastRead = readState[room.id];
      return !lastRead || new Date(room.lastMessageAt) > new Date(lastRead);
    },
    [myRole, readState],
  );

  const unreadCount = useMemo(() => rooms.filter(isRoomUnread).length, [rooms, isRoomUnread]);

  const value = useMemo(
    () => ({ rooms, loading, unreadCount, refresh, markRoomRead, isRoomUnread }),
    [rooms, loading, unreadCount, refresh, markRoomRead, isRoomUnread],
  );

  return <ChatRoomsContext.Provider value={value}>{children}</ChatRoomsContext.Provider>;
}

export function useChatRooms(): ChatRoomsContextValue {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) {
    throw new Error("useChatRooms must be used within a ChatRoomsProvider");
  }
  return ctx;
}

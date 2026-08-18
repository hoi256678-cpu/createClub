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

export type ChatRoom = {
  id: string;
  counselorId: string;
  counselorName: string;
  counselorMajor: string;
  avatarBg: string;
  avatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  createdAt: string;
};

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  /** 종료/신고 등으로 목록이 바뀐 뒤 다시 불러올 때 쓴다. */
  refresh: () => Promise<void>;
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
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => fetchChatRooms(setRooms, setLoading), []);

  useEffect(() => {
    fetchChatRooms(setRooms, setLoading);
  }, []);

  const value = useMemo(() => ({ rooms, loading, refresh }), [rooms, loading, refresh]);

  return <ChatRoomsContext.Provider value={value}>{children}</ChatRoomsContext.Provider>;
}

export function useChatRooms(): ChatRoomsContextValue {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) {
    throw new Error("useChatRooms must be used within a ChatRoomsProvider");
  }
  return ctx;
}

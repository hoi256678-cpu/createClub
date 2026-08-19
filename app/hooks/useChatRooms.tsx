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
  viewerSide: "client" | "counselor";
  createdAt: string;
};

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  loading: boolean;
  unreadCount: number;
  /** 종료/신고 등으로 목록이 바뀐 뒤 다시 불러올 때 쓴다. */
  refresh: () => Promise<void>;
  markRoomRead: (id: string, lastMessageAt: string) => void;
  isRoomUnread: (room: ChatRoom) => boolean;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

async function fetchChatRooms(
  setRooms: (updater: (prev: ChatRoom[]) => ChatRoom[]) => void,
  setLoading: (loading: boolean) => void,
  isFirstLoad: boolean,
) {
  try {
    const res = await apiFetch("/api/counseling/rooms");
    if (res.ok) {
      const data = await res.json();
      setRooms(() => data);
    } else if (isFirstLoad) {
      // 최초 로드 실패는 빈 목록으로 보여주는 게 맞다. 폴링 중 실패(콜드스타트 등)는
      // 이미 불러온 목록을 그대로 유지해서 화면이 갑자기 비지 않도록 한다.
      setRooms(() => []);
    }
  } catch {
    if (isFirstLoad) setRooms(() => []);
  } finally {
    setLoading(false);
  }
}

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [readState, setReadState] = useState<Record<string, string>>({});
  const firstLoadDoneRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setReadState(readJSON<Record<string, string>>(READ_STATE_KEY, {}));
  }, []);

  const refresh = useCallback(() => {
    const isFirstLoad = !firstLoadDoneRef.current;
    firstLoadDoneRef.current = true;
    return fetchChatRooms(setRooms, setLoading, isFirstLoad);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      // 로그아웃 상태거나 아직 인증 확인 중이면 조회하지 않는다. 로그아웃 직후엔
      // 이전 계정의 목록/배지가 남아있지 않도록 비운다.
      firstLoadDoneRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그아웃 전환 시 이전 목록을 즉시 비운다
      setRooms([]);
      setLoading(false);
      return;
    }
    refresh();
  }, [isLoggedIn, refresh]);

  usePolling(refresh, isLoggedIn ? POLL_INTERVAL_MS : null);

  const markRoomRead = useCallback((id: string, lastMessageAt: string) => {
    setReadState((prev) => {
      const next = { ...prev, [id]: lastMessageAt };
      writeJSON(READ_STATE_KEY, next);
      return next;
    });
  }, []);

  const isRoomUnread = useCallback(
    (room: ChatRoom) => {
      if (!room.lastMessageFrom || room.lastMessageFrom === room.viewerSide) return false;
      const lastRead = readState[room.id];
      return !lastRead || new Date(room.lastMessageAt) > new Date(lastRead);
    },
    [readState],
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

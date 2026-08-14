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
import { CHAT_ROOMS, type ChatRoom, type ChatMessage } from "@/app/(shell)/chat/mock";
import { readJSON, writeJSON } from "@/lib/storage";

const READ_KEY = "somit:chat:read";
const SENT_KEY = "somit:chat:sent";

type SentMap = Record<string, ChatMessage[]>;

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  markRoomRead: (id: string) => void;
  sendMessage: (id: string, text: string) => void;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const [readIds, setReadIds] = useState<string[]>([]);
  const [sent, setSent] = useState<SentMap>({});

  // 하이드레이션 불일치를 피하려고 마운트 후에 복원한다.
  useEffect(() => {
    setReadIds(readJSON<string[]>(READ_KEY, []));
    setSent(readJSON<SentMap>(SENT_KEY, {}));
  }, []);

  const markRoomRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeJSON(READ_KEY, next);
      return next;
    });
  }, []);

  const sendMessage = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSent((prev) => {
      const mine = prev[id] ?? [];
      // 방의 기존 메시지 개수와 무관하게 항상 유일한 id를 만든다.
      const message: ChatMessage = { id: Date.now(), from: "me", text: trimmed, time: "방금" };
      const next = { ...prev, [id]: [...mine, message] };
      writeJSON(SENT_KEY, next);
      return next;
    });
  }, []);

  const rooms = useMemo<ChatRoom[]>(
    () =>
      CHAT_ROOMS.map((room) => {
        const mine = sent[room.id] ?? [];
        const messages = mine.length ? [...room.messages, ...mine] : room.messages;
        const last = messages[messages.length - 1];
        return {
          ...room,
          messages,
          lastMessage: last ? last.text : room.lastMessage,
          unread: readIds.includes(room.id) ? 0 : room.unread,
        };
      }),
    [readIds, sent],
  );

  const value = useMemo(
    () => ({ rooms, markRoomRead, sendMessage }),
    [rooms, markRoomRead, sendMessage],
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

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CHAT_ROOMS, type ChatRoom, type ChatMessage } from "@/app/(shell)/chat/mock";

type ChatRoomsContextValue = {
  rooms: ChatRoom[];
  markRoomRead: (id: string) => void;
  sendMessage: (id: string, text: string) => void;
};

const ChatRoomsContext = createContext<ChatRoomsContextValue | null>(null);

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<ChatRoom[]>(CHAT_ROOMS);

  const markRoomRead = useCallback((id: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, unread: 0 } : r)));
  }, []);

  const sendMessage = useCallback((id: string, text: string) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const message: ChatMessage = { id: r.messages.length + 1, from: "me", text, time: "방금" };
        return { ...r, messages: [...r.messages, message], lastMessage: text };
      }),
    );
  }, []);

  return (
    <ChatRoomsContext.Provider value={{ rooms, markRoomRead, sendMessage }}>{children}</ChatRoomsContext.Provider>
  );
}

export function useChatRooms(): ChatRoomsContextValue {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) {
    throw new Error("useChatRooms must be used within a ChatRoomsProvider");
  }
  return ctx;
}

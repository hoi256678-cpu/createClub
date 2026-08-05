"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { NOTIFICATIONS, type NotificationItem } from "@/app/(shell)/notifications/mock";

type NotificationsContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: number) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>(NOTIFICATIONS);

  function markRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
  }

  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}

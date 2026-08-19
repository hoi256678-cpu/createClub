"use client";

import { useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { useNotifications } from "@/app/hooks/useNotifications";

export default function NotificationsPage() {
  const { items, markRead, markAllRead } = useNotifications();
  const router = useRouter();

  function handleClick(id: string | number, href?: string) {
    markRead(id);
    if (href) router.push(href);
  }

  return (
    <RequireAuth>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="font-extrabold text-text">🔔 알림</div>
          <button onClick={markAllRead} className="text-[13px] font-bold text-text-muted">
            모두 읽음
          </button>
        </div>
        {items.length === 0 ? (
          <div className="py-16 text-center text-text-faint">알림이 없어요</div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n.id, n.href)}
              className={`flex w-full gap-3.5 border-b border-border px-5 py-4 text-left last:border-0 hover:bg-primary-xlight ${
                n.unread ? "bg-primary-light" : ""
              }`}
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-lg">
                {n.icon}
              </div>
              <div className="flex-1">
                <div className="mb-0.5 font-bold text-text">{n.title}</div>
                <div className="text-[13px] leading-relaxed text-text-muted">{n.desc}</div>
                <div className="mt-1 text-[11px] text-text-faint">{n.time}</div>
              </div>
              {n.unread && <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-danger" />}
            </button>
          ))
        )}
      </div>
    </RequireAuth>
  );
}

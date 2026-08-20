"use client";

import { useRouter } from "next/navigation";
import { useNotifications } from "@/app/hooks/useNotifications";

export default function NotificationPanel({
  onNavigate,
  scrollable,
}: {
  /** 항목 클릭(이동) 후 호출된다 — 드롭다운에서 패널을 닫는 용도 */
  onNavigate?: () => void;
  /** true면 목록만 스크롤 영역으로 감싼다 (드롭다운용) */
  scrollable?: boolean;
}) {
  const { items, markRead, markAllRead, deleteNotification } = useNotifications();
  const router = useRouter();

  function handleClick(id: string, href?: string) {
    markRead(id);
    if (href) router.push(href);
    onNavigate?.();
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="font-extrabold text-text">🔔 알림</div>
        <button onClick={markAllRead} className="text-[13px] font-bold text-text-muted">
          모두 읽음
        </button>
      </div>
      <div className={scrollable ? "max-h-[360px] overflow-y-auto" : undefined}>
        {items.length === 0 ? (
          <div className="py-16 text-center text-text-faint">알림이 없어요</div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`group flex items-start gap-2 border-b border-border pl-5 pr-2 last:border-0 hover:bg-primary-xlight ${
                n.unread ? "bg-primary-light" : ""
              }`}
            >
              <button onClick={() => handleClick(n.id, n.href)} className="flex flex-1 gap-3.5 py-4 text-left">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(n.id);
                }}
                aria-label="알림 삭제"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center self-center rounded-full text-text-faint transition-colors hover:bg-bg hover:text-danger"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

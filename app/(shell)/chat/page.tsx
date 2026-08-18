"use client";

import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useChatRooms } from "@/app/hooks/useChatRooms";

export default function ChatListPage() {
  const { rooms, loading } = useChatRooms();

  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shell:grid-cols-[300px_1fr]">
        <div className="border-b border-border shell:border-b-0 shell:border-r">
          <div className="border-b border-border px-4 py-4 font-extrabold text-text">상담 목록</div>
          <div>
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">불러오는 중이에요...</div>
            ) : rooms.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">아직 상담이 없어요</div>
            ) : (
              rooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/chat/${r.id}`}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-primary-xlight"
                >
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
                    style={{ background: r.avatarBg, color: r.avatarColor }}
                  >
                    {r.counselorName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-text">
                      {r.counselorName}
                      {r.status !== "active" && (
                        <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-text-faint">
                          종료됨
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-text-muted">{r.lastMessage ?? "아직 메시지가 없어요"}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
        <div className="hidden flex-col items-center justify-center gap-4 py-24 text-text-faint shell:flex">
          왼쪽에서 상담을 선택해주세요
          <Link
            href="/counselors"
            className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-primary-dark transition-colors hover:border-primary-dark"
          >
            새 상담사 찾아보기 →
          </Link>
        </div>
      </div>
    </RequireAuth>
  );
}

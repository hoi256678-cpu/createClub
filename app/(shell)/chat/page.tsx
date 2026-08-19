"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useChatRooms, type ChatRoom } from "@/app/hooks/useChatRooms";
import { readJSON, writeJSON } from "@/lib/storage";

type Tab = "active" | "all" | "ended";

const TAB_STORAGE_KEY = "somit:chat:tab";

function isTab(value: unknown): value is Tab {
  return value === "active" || value === "all" || value === "ended";
}

export default function ChatListPage() {
  return (
    <Suspense fallback={null}>
      <ChatListPageContent />
    </Suspense>
  );
}

function ChatListPageContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: Tab = isTab(requestedTab) ? requestedTab : "active";
  const { state: auth } = useAuthStatus();
  const { rooms, loading, isRoomUnread } = useChatRooms();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const hideCounselorEntry = auth.phase === "in" && auth.role === "counselor";

  useEffect(() => {
    // URL에 ?tab=이 명시적으로 지정된 경우(마이페이지 "상담 횟수" 등)엔 그걸 우선한다.
    // 그렇지 않고 사이드바 "채팅 상담"처럼 탭 없이 들어온 경우엔 마지막으로 보던 탭을 복원한다.
    if (isTab(requestedTab)) return;
    const saved = readJSON<Tab | null>(TAB_STORAGE_KEY, null);
    if (isTab(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
      setTabState(saved);
    }
  }, [requestedTab]);

  function setTab(next: Tab) {
    setTabState(next);
    writeJSON(TAB_STORAGE_KEY, next);
  }

  const visibleRooms =
    tab === "active"
      ? rooms.filter((r) => r.status === "active")
      : tab === "ended"
        ? rooms.filter((r) => r.status !== "active")
        : rooms;

  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shell:grid-cols-[300px_1fr]">
        <div className="border-b border-border shell:border-b-0 shell:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <span className="font-extrabold text-text">상담 목록</span>
            <div className="flex gap-1 rounded-lg bg-bg p-0.5 text-[12px] font-bold">
              <button
                onClick={() => setTab("active")}
                className={`rounded-md px-2.5 py-1 ${
                  tab === "active" ? "bg-surface text-primary-dark shadow-sm" : "text-text-faint"
                }`}
              >
                진행중
              </button>
              <button
                onClick={() => setTab("ended")}
                className={`rounded-md px-2.5 py-1 ${
                  tab === "ended" ? "bg-surface text-primary-dark shadow-sm" : "text-text-faint"
                }`}
              >
                종료됨
              </button>
              <button
                onClick={() => setTab("all")}
                className={`rounded-md px-2.5 py-1 ${
                  tab === "all" ? "bg-surface text-primary-dark shadow-sm" : "text-text-faint"
                }`}
              >
                전체
              </button>
            </div>
          </div>
          <div>
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">불러오는 중이에요...</div>
            ) : visibleRooms.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-faint">
                {tab === "active" ? "진행 중인 상담이 없어요" : tab === "ended" ? "종료된 상담이 없어요" : "아직 상담이 없어요"}
              </div>
            ) : (
              visibleRooms.map((r) => <ChatRoomRow key={r.id} room={r} unread={isRoomUnread(r)} />)
            )}
          </div>
        </div>
        <div className="hidden flex-col items-center justify-center gap-4 py-24 text-text-faint shell:flex">
          왼쪽에서 상담을 선택해주세요
          {!hideCounselorEntry && (
            <Link
              href="/counselors"
              className="rounded-xl border border-border px-4 py-2 text-[13px] font-bold text-primary-dark transition-colors hover:border-primary-dark"
            >
              새 상담사 찾아보기 →
            </Link>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

function ChatRoomRow({ room, unread }: { room: ChatRoom; unread: boolean }) {
  return (
    <Link
      href={`/chat/${room.id}`}
      className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-primary-xlight"
    >
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-extrabold"
        style={{ background: room.otherPartyAvatarBg, color: room.otherPartyAvatarColor }}
      >
        {room.otherPartyName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold text-text">
          {room.otherPartyName}
          {room.status !== "active" && (
            <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-text-faint">종료됨</span>
          )}
        </div>
        <div className="truncate text-xs text-text-muted">{room.lastMessage ?? "아직 메시지가 없어요"}</div>
      </div>
      {unread && <div className="h-2 w-2 flex-shrink-0 rounded-full bg-danger" />}
    </Link>
  );
}

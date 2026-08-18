"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useChatRooms } from "@/app/hooks/useChatRooms";

type Message = { id: string; from: "client"; text: string; createdAt: string };

type RoomDetail = {
  id: string;
  counselorId: string;
  counselorName: string;
  counselorMajor: string;
  avatarBg: string;
  avatarColor: string;
  status: "active" | "ended" | "reported";
  lastMessage: string | null;
  createdAt: string;
  messages: Message[];
};

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh: refreshRoomList } = useChatRooms();
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"end" | "report" | null>(null);

  async function loadRoom() {
    try {
      const res = await apiFetch(`/api/counseling/rooms/${params.id}`);
      setRoom(res.ok ? await res.json() : null);
    } catch {
      setRoom(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 방 상세는 마운트/id 변경 시 API 호출 후 setState한다
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function send() {
    if (!room || !input.trim() || room.status !== "active") return;
    const text = input.trim();
    setInput("");
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const messages = await res.json();
      setRoom({ ...room, messages, lastMessage: text });
    }
  }

  async function handleEnd(rating: number | null) {
    if (!room) return;
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/end`, {
      method: "POST",
      body: JSON.stringify(rating ? { rating } : {}),
    });
    if (res.ok) {
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    }
  }

  async function handleReport(reason: string) {
    if (!room || !reason.trim()) return;
    const res = await apiFetch(`/api/counseling/rooms/${room.id}/report`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    }
  }

  if (room === undefined) {
    return (
      <RequireAuth>
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      </RequireAuth>
    );
  }

  if (!room) {
    return (
      <RequireAuth reason={GUEST_UPGRADE_REASON.liveChat}>
        <div className="py-16 text-center text-text-faint">채팅방을 찾을 수 없어요.</div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="flex h-[calc(100dvh-200px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shell:h-[calc(100dvh-160px)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <button onClick={() => router.push("/chat")} className="text-text-muted">
            ←
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: room.avatarBg, color: room.avatarColor }}
          >
            {room.counselorName.slice(0, 1)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-text">{room.counselorName}</div>
            <div className="text-xs text-text-muted">{room.counselorMajor}</div>
          </div>
          {room.status === "active" && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="px-2 text-lg text-text-muted">
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setModal("end");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-text hover:bg-bg"
                  >
                    상담 종료하기
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setModal("report");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-danger hover:bg-bg"
                  >
                    신고하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {room.status !== "active" && (
          <div className="border-b border-border bg-bg px-5 py-2 text-center text-xs font-semibold text-text-faint">
            {room.status === "reported" ? "신고 접수 후 종료된 상담이에요" : "종료된 상담이에요"}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-5">
          {room.messages.map((m) => (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[420px] rounded-2xl rounded-br-md bg-primary-dark px-3 py-2.5 text-sm leading-relaxed text-white">
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 border-t border-border bg-surface px-5 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={room.status !== "active"}
            placeholder={room.status === "active" ? "메시지를 입력하세요" : "종료된 상담이에요"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={room.status !== "active"}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>

      {modal === "end" && <EndModal onSubmit={handleEnd} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal onSubmit={handleReport} onClose={() => setModal(null)} />}
    </RequireAuth>
  );
}

function EndModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (rating: number | null) => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">상담을 종료할까요?</h2>
        <p className="mt-1 text-[13px] text-text-muted">상담사에게 별점을 남길 수 있어요 (선택)</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              aria-label={`${n}점`}
              className={`text-2xl ${rating !== null && n <= rating ? "text-[#f0b429]" : "text-border"}`}
            >
              ★
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(rating)}
            className="flex-1 rounded-xl bg-primary-dark py-2.5 text-sm font-extrabold text-white"
          >
            {rating ? "평점 남기고 종료" : "건너뛰고 종료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">신고하기</h2>
        <p className="mt-1 text-[13px] text-text-muted">신고 접수와 함께 상담이 바로 종료돼요.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="어떤 점이 불편했는지 알려주세요"
          className="mt-4 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={!reason.trim()}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
          >
            신고하고 종료
          </button>
        </div>
      </div>
    </div>
  );
}

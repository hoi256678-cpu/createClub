"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import { usePolling } from "@/app/hooks/usePolling";

type Message = { id: string; from: "client" | "counselor"; text: string; createdAt: string };

type RoomDetail = {
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
  messages: Message[];
};

const POLL_INTERVAL_MS = 5000;

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh: refreshRoomList, markRoomRead } = useChatRooms();
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"end" | "report" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstLoadDoneRef = useRef(false);

  function openModal(next: "end" | "report" | null) {
    setModalError(null);
    setModal(next);
  }

  async function loadRoom() {
    const isFirstLoad = !firstLoadDoneRef.current;
    firstLoadDoneRef.current = true;
    try {
      const res = await apiFetch(`/api/counseling/rooms/${params.id}`);
      if (res.ok) {
        setRoom(await res.json());
        return;
      }
      // 403/404는 "이 방에 접근할 수 없다"는 확정적인 답이므로 방을 못 찾은 것으로 처리한다.
      // 그 외(500 등) 실패는 최초 로드가 아니면(=이미 방을 보고 있던 중이면) 기존 상태를 유지한다 —
      // 백엔드 콜드스타트 같은 일시적 실패로 열어보던 방이 사라지는 걸 막기 위함이다.
      if (res.status === 403 || res.status === 404 || isFirstLoad) {
        setRoom(null);
      }
    } catch {
      if (isFirstLoad) setRoom(null);
    }
  }

  useEffect(() => {
    firstLoadDoneRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 방 상세는 마운트/id 변경 시 API 호출 후 setState한다
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  usePolling(loadRoom, POLL_INTERVAL_MS);

  // 서버의 lastMessageAt을 읽음 시각으로 저장한다(기기 시계 오차 문제를 피하기 위해).
  // 방이 열려있는 동안 폴링으로 새 메시지가 도착할 때마다 다시 호출해서,
  // 지금 보고 있는 방이 폴링 도중 "안읽음"으로 뒤집히지 않게 한다.
  useEffect(() => {
    if (!room) return;
    markRoomRead(room.id, room.lastMessageAt);
    // room 전체가 아니라 실제로 읽음 판정에 영향을 주는 값만 deps로 쓴다 —
    // room 객체 참조가 바뀔 때마다(폴링마다) 매번 markRoomRead가 다시 호출되는 걸 피하기 위함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.lastMessageAt, room?.messages.length, markRoomRead]);

  // 새 메시지가 생기면(전송 또는 폴링) 목록 하단으로 스크롤한다.
  useEffect(() => {
    if (!room || room.messages.length === 0) return;
    bottomRef.current?.scrollIntoView();
    // 메시지 개수가 바뀔 때만 스크롤하면 충분하다 (room 객체 참조 변화마다 스크롤하지 않도록).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.messages.length]);

  async function send() {
    if (!room || !input.trim() || room.status !== "active" || sending) return;
    const text = input.trim();
    setInput("");
    setSendError(null);
    setSending(true);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setInput(text);
        setSendError("메시지 전송에 실패했어요");
        return;
      }
      const messages = await res.json();
      setRoom({ ...room, messages, lastMessage: text });
    } catch {
      setInput(text);
      setSendError("백엔드에 연결할 수 없어요");
    } finally {
      setSending(false);
    }
  }

  async function handleEnd(rating: number | null) {
    if (!room) return;
    setModalError(null);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/end`, {
        method: "POST",
        body: JSON.stringify(rating ? { rating } : {}),
      });
      if (!res.ok) {
        setModalError("상담 종료에 실패했어요");
        return;
      }
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    } catch {
      setModalError("백엔드에 연결할 수 없어요");
    }
  }

  async function handleReport(reason: string) {
    if (!room || !reason.trim()) return;
    setModalError(null);
    try {
      const res = await apiFetch(`/api/counseling/rooms/${room.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        setModalError("신고 접수에 실패했어요");
        return;
      }
      const data = await res.json();
      setRoom({ ...room, status: data.status });
      setModal(null);
      refreshRoomList();
    } catch {
      setModalError("백엔드에 연결할 수 없어요");
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
            style={{ background: room.otherPartyAvatarBg, color: room.otherPartyAvatarColor }}
          >
            {room.otherPartyName.slice(0, 1)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-text">{room.otherPartyName}</div>
            {room.otherPartyMajor && <div className="text-xs text-text-muted">{room.otherPartyMajor}</div>}
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
                      openModal("end");
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-text hover:bg-bg"
                  >
                    상담 종료하기
                  </button>
                  {room.viewerSide === "client" && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openModal("report");
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[13px] font-semibold text-danger hover:bg-bg"
                    >
                      신고하기
                    </button>
                  )}
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
          {room.messages.map((m) => {
            const isMine = m.from === room.viewerSide;
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[420px] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? "rounded-br-md bg-primary-dark text-white"
                      : "rounded-bl-md border border-border bg-surface text-text"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {sendError && <p className="px-5 pt-2 text-xs font-semibold text-danger">{sendError}</p>}

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
            disabled={room.status !== "active" || sending}
            placeholder={room.status === "active" ? "메시지를 입력하세요" : "종료된 상담이에요"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={room.status !== "active" || sending}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>

      {modal === "end" && (
        <EndModal
          onSubmit={handleEnd}
          onClose={() => openModal(null)}
          error={modalError}
          showRating={room.viewerSide === "client"}
        />
      )}
      {modal === "report" && (
        <ReportModal onSubmit={handleReport} onClose={() => openModal(null)} error={modalError} />
      )}
    </RequireAuth>
  );
}

function EndModal({
  onSubmit,
  onClose,
  error,
  showRating,
}: {
  onSubmit: (rating: number | null) => void;
  onClose: () => void;
  error: string | null;
  showRating: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h2 className="font-extrabold text-text">상담을 종료할까요?</h2>
        {showRating ? (
          <>
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
          </>
        ) : (
          <p className="mt-1 text-[13px] text-text-muted">상담을 종료하면 다시 되돌릴 수 없어요.</p>
        )}
        {error && <p className="mt-3 text-center text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(showRating ? rating : null)}
            className="flex-1 rounded-xl bg-primary-dark py-2.5 text-sm font-extrabold text-white"
          >
            {showRating ? (rating ? "평점 남기고 종료" : "건너뛰고 종료") : "종료하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({
  onSubmit,
  onClose,
  error,
}: {
  onSubmit: (reason: string) => void;
  onClose: () => void;
  error: string | null;
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
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
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

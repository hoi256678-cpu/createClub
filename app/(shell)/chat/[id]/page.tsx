"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { useChatRooms } from "@/app/hooks/useChatRooms";

export default function ChatRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { rooms, markRoomRead, sendMessage } = useChatRooms();
  const room = rooms.find((r) => r.id === params.id);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (room && room.unread > 0) markRoomRead(room.id);
  }, [room, markRoomRead]);

  if (!room) {
    return (
      <RequireAuth>
        <div className="py-16 text-center text-text-faint">채팅방을 찾을 수 없어요.</div>
      </RequireAuth>
    );
  }

  function send() {
    if (!room || !input.trim()) return;
    sendMessage(room.id, input.trim());
    setInput("");
  }

  return (
    <RequireAuth>
      <div className="flex h-[calc(100vh-160px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <button onClick={() => router.push("/chat")} className="text-text-muted">
            ←
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: room.avatarBg, color: room.avatarColor }}
          >
            {room.avatarLabel}
          </div>
          <div>
            <div className="font-bold text-text">{room.counselorName}</div>
            <div className="text-xs text-text-muted">{room.counselorRole}</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-5">
          {room.messages.map((m) => (
            <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[420px] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                  m.from === "me"
                    ? "rounded-br-md bg-primary-dark text-white"
                    : "rounded-bl-md border border-border bg-surface text-text-2"
                }`}
              >
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
            placeholder="메시지를 입력하세요"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={send}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-dark text-white"
          >
            ↑
          </button>
        </div>
      </div>
    </RequireAuth>
  );
}

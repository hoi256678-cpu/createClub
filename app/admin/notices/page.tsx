"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { formatNoticeDate } from "@/app/(shell)/community/time";
import type { NoticeItem } from "@/app/(shell)/community/types";

export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 목록 조회
  useEffect(load, []);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newTitle, body: newBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewTitle("");
    setNewBody("");
    setCreating(false);
    load();
  }

  function startEdit(n: NoticeItem) {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditBody(n.body);
    setFormError(null);
  }

  async function submitEdit(e: FormEvent, id: string) {
    e.preventDefault();
    setFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editTitle, body: editBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const res = await apiFetch(`/api/admin/notices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-text">공지사항 관리</h1>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setFormError(null);
            }}
            className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
          >
            새 공지 작성
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="mb-4 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="내용"
            rows={4}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
          />
          {formError && <p className="text-xs font-semibold text-danger">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
            >
              취소
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
              작성하기
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : notices.length === 0 ? (
        <div className="py-16 text-center text-text-faint">공지가 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {notices.map((n) =>
            editingId === n.id ? (
              <form
                key={n.id}
                onSubmit={(e) => submitEdit(e, n.id)}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
              >
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                {formError && <p className="text-xs font-semibold text-danger">{formError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                  >
                    취소
                  </button>
                  <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                    저장
                  </button>
                </div>
              </form>
            ) : (
              <div key={n.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-text">{n.title}</span>
                  <span className="text-[11px] text-text-faint">{formatNoticeDate(n.createdAt)}</span>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-text-2">{n.body}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(n)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      confirmDeleteId === n.id
                        ? "border-danger bg-[#fff0f0] text-danger"
                        : "border-danger text-danger hover:bg-[#fff0f0]"
                    }`}
                  >
                    {confirmDeleteId === n.id ? "정말 삭제할까요?" : "삭제"}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

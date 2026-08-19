"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PendingCounselor = {
  id: string;
  name: string;
  email: string;
  major: string;
  year: string;
  bio: string;
  specialties: string[];
};

export default function AdminCounselorsPage() {
  const [pending, setPending] = useState<PendingCounselor[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    apiFetch("/api/admin/counselors/pending")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PendingCounselor[]) => setPending(data))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 페이지 진입 시 승인 대기 목록을 즉시 불러온다
  useEffect(load, []);

  async function approve(id: string) {
    const res = await apiFetch(`/api/admin/counselors/${id}/approve`, { method: "POST" });
    if (!res.ok) return;
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">상담사 인증</h1>
      <p className="mb-4 text-sm text-text-muted">등록 폼을 제출하고 승인을 기다리는 상담사예요.</p>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : pending.length === 0 ? (
        <div className="py-16 text-center text-text-faint">승인 대기 중인 상담사가 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-bold text-text">{c.name}</span>
                <span className="text-xs text-text-faint">{c.email}</span>
              </div>
              <div className="mb-2 text-[13px] text-text-muted">
                {c.major} {c.year && `· ${c.year}`}
              </div>
              <p className="mb-3 text-sm text-text-2">{c.bio}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {c.specialties.map((tag) => (
                  <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-text-muted">
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={() => approve(c.id)}
                className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
              >
                승인
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

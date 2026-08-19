"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/app/(shell)/community/time";

type AdminReport = {
  id: string;
  reporterName: string;
  counselorName: string;
  reason: string;
  status: "open" | "reviewed";
  createdAt: string;
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "reviewed">("open");

  function load() {
    setLoading(true);
    const query = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch(`/api/admin/reports${query}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminReport[]) => setReports(data))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 상태 필터 변경 시 로딩 상태를 즉시 업데이트한다
  useEffect(load, [statusFilter]);

  async function markReviewed(id: string) {
    const res = await apiFetch(`/api/admin/reports/${id}/review`, { method: "POST" });
    if (!res.ok) return;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: "reviewed" } : r)));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">상담 신고</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {(["open", "reviewed", ""] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === s ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            {s === "open" ? "미처리" : s === "reviewed" ? "처리완료" : "전체"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : reports.length === 0 ? (
        <div className="py-16 text-center text-text-faint">신고 내역이 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-text">
                  {r.reporterName} → {r.counselorName}
                </span>
                {r.status === "reviewed" ? (
                  <span className="rounded-full bg-[#eafaf5] px-2 py-0.5 text-xs font-bold text-success">처리완료</span>
                ) : (
                  <span className="rounded-full bg-[#fff0f0] px-2 py-0.5 text-xs font-bold text-danger">미처리</span>
                )}
              </div>
              <p className="mb-1 text-sm text-text-2">{r.reason}</p>
              <p className="mb-3 text-[11px] text-text-faint">{formatRelativeTime(r.createdAt)}</p>
              {r.status === "open" && (
                <button
                  onClick={() => markReviewed(r.id)}
                  className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
                >
                  처리완료로 표시
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

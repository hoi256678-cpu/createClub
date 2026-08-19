"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "counselor" | "client" | "admin";
  suspended: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<AdminUser["role"], string> = {
  counselor: "상담사",
  client: "고민 청소년",
  admin: "관리자",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"" | AdminUser["role"]>("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const query = roleFilter ? `?role=${roleFilter}` : "";
    apiFetch(`/api/admin/users${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: AdminUser[]) => setUsers(data))
      .catch(() => setError("불러오는 중 오류가 발생했어요"))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터 변경 시 로딩 상태를 즉시 업데이트한다
  useEffect(load, [roleFilter]);

  async function toggleSuspend(id: string) {
    const res = await apiFetch(`/api/admin/users/${id}/suspend`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { suspended: boolean };
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, suspended: data.suspended } : u)));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">사용자 관리</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {(["", "client", "counselor", "admin"] as const).map((r) => (
          <button
            key={r || "all"}
            onClick={() => setRoleFilter(r)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              roleFilter === r ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            {r === "" ? "전체" : ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm font-semibold text-danger">{error}</p>}

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-text-faint">사용자가 없어요</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-bg text-[11px] font-bold uppercase text-text-faint">
              <tr>
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">이메일</th>
                <th className="px-4 py-2.5">역할</th>
                <th className="px-4 py-2.5">상태</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-text">{u.name}</td>
                  <td className="px-4 py-3 text-text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-text-muted">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-3">
                    {u.suspended ? (
                      <span className="rounded-full bg-[#fff0f0] px-2 py-0.5 text-xs font-bold text-danger">정지됨</span>
                    ) : (
                      <span className="rounded-full bg-[#eafaf5] px-2 py-0.5 text-xs font-bold text-success">정상</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => toggleSuspend(u.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                          u.suspended
                            ? "border-border text-text-muted"
                            : "border-danger text-danger hover:bg-[#fff0f0]"
                        }`}
                      >
                        {u.suspended ? "정지 해제" : "정지"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

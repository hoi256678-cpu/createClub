"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { apiFetch } from "@/lib/api";

export default function MypagePage() {
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    apiFetch("/api/community/my-posts/count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => setPostCount(data.count))
      .catch(() => setPostCount(0));
  }, []);

  return (
    <RequireAuth>
      {(auth) => (
        <div className="grid grid-cols-1 gap-6 shell:grid-cols-[280px_1fr]">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark to-primary-darker p-7 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25 text-2xl font-extrabold text-white">
              {auth.name.slice(0, 1)}
            </div>
            <div className="mb-1 font-extrabold text-white">{auth.name}</div>
            <div className="text-xs text-white/75">{auth.role === "counselor" ? "상담사" : "고민 청소년"}</div>
            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl bg-white/15">
              <div className="border-r border-white/15 py-3 text-center">
                <div className="font-extrabold text-white">{postCount}</div>
                <div className="mt-0.5 text-[10px] text-white/70">작성한 글</div>
              </div>
              <div className="border-r border-white/15 py-3 text-center">
                <div className="font-extrabold text-white">0</div>
                <div className="mt-0.5 text-[10px] text-white/70">저장한 글</div>
              </div>
              <div className="py-3 text-center">
                <div className="font-extrabold text-white">0</div>
                <div className="mt-0.5 text-[10px] text-white/70">상담 횟수</div>
              </div>
            </div>
            <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/settings"
              className="flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 hover:bg-primary-xlight"
            >
              <span className="font-bold text-text">⚙️ 설정</span>
              <span className="text-text-faint">›</span>
            </Link>
            <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
              프로필 상세 정보(전공/학년/연령대 등) 입력은 곧 추가될 예정이에요.
            </div>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}

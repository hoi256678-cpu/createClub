"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { useTestHistory } from "@/app/hooks/useTestHistory";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import { formatRelativeTime } from "../community/time";
import { apiFetch } from "@/lib/api";

/**
 * 마이페이지를 오갈 때마다 컴포넌트가 다시 마운트되어 useState(0)으로
 * 초기화된다. 마지막으로 불러온 값을 모듈 스코프에 남겨두면, 재방문 시
 * 새로 fetch가 끝나기 전까지 0이 잠깐 보이는 대신 직전 값을 바로 보여준다.
 */
let cachedPostCount: number | null = null;
let cachedSavedCount: number | null = null;

export default function MypagePage() {
  const [postCount, setPostCount] = useState(() => cachedPostCount ?? 0);
  const [savedCount, setSavedCount] = useState(() => cachedSavedCount ?? 0);
  const { records } = useTestHistory();
  const { rooms } = useChatRooms();
  const endedSessionCount = rooms.filter((r) => r.status !== "active").length;

  useEffect(() => {
    apiFetch("/api/community/my-posts/count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => {
        cachedPostCount = data.count;
        setPostCount(data.count);
      })
      .catch(() => setPostCount(0));

    apiFetch("/api/community/my-saved-posts/count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => {
        cachedSavedCount = data.count;
        setSavedCount(data.count);
      })
      .catch(() => setSavedCount(0));
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
              <Link href="/mypage/my-posts" className="border-r border-white/15 py-3 text-center hover:bg-white/10">
                <div className="font-extrabold text-white">{postCount}</div>
                <div className="mt-0.5 text-[10px] text-white/70">작성한 글</div>
              </Link>
              <Link
                href="/mypage/saved-posts"
                className="border-r border-white/15 py-3 text-center hover:bg-white/10"
              >
                <div className="font-extrabold text-white">{savedCount}</div>
                <div className="mt-0.5 text-[10px] text-white/70">저장한 글</div>
              </Link>
              <Link href="/chat?tab=ended" className="py-3 text-center hover:bg-white/10">
                <div className="font-extrabold text-white">{endedSessionCount}</div>
                <div className="mt-0.5 text-[10px] text-white/70">상담 횟수</div>
              </Link>
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
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-bold text-text">내 심리검사 기록</div>
                {records.length > 0 && (
                  <Link
                    href="/mypage/test-history"
                    className="text-xs font-semibold text-text-faint hover:text-text-muted"
                  >
                    이전 검사기록
                  </Link>
                )}
              </div>
              {records.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-text-faint">
                  아직 받은 검사가 없어요
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {records.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">{r.title}</span>
                      <span className="flex-shrink-0 text-sm font-extrabold" style={{ color: r.color }}>
                        {r.score}점
                      </span>
                      <span className="w-16 flex-shrink-0 text-right text-[11px] text-text-faint">
                        {formatRelativeTime(r.takenAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
              프로필 상세 정보(전공/학년/연령대 등) 입력은 곧 추가될 예정이에요.
            </div>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}

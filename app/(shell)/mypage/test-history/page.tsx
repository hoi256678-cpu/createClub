"use client";

import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import { useTestHistory } from "@/app/hooks/useTestHistory";
import { formatRelativeTime } from "../../community/time";
import { TEST_CARDS } from "../../test/data";

export default function TestHistoryPage() {
  return (
    <RequireAuth>
      {() => <TestHistoryContent />}
    </RequireAuth>
  );
}

function TestHistoryContent() {
  const { records } = useTestHistory();

  const groups = TEST_CARDS.map((card) => ({
    card,
    records: records.filter((r) => r.type === card.type),
  })).filter((g) => g.records.length > 0);

  return (
    <div>
      <Link
        href="/mypage"
        className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-text-muted"
      >
        ← 마이페이지로 돌아가기
      </Link>

      <div className="mb-5 text-lg font-extrabold text-text">이전 검사기록</div>

      {groups.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-text-faint">아직 받은 검사가 없어요</div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ card, records: groupRecords }) => (
            <div key={card.type} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 font-bold text-text">
                {card.emoji} {card.title}
              </div>
              <div className="flex flex-col divide-y divide-border">
                {groupRecords.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-3">
                    <span className="flex-shrink-0 text-sm font-extrabold" style={{ color: r.color }}>
                      {r.score}점
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-2">{r.label}</span>
                    <span className="w-20 flex-shrink-0 text-right text-xs text-text-faint">
                      {formatRelativeTime(r.takenAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

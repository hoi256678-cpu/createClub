"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Chip from "@/app/components/ui/Chip";
import Rating from "@/app/components/ui/Rating";
import { COUNSELORS, ALL_TAGS, type CounselorTag } from "./mock";
import { matchScore, isEligible, isNewCounselor, reserveSlotForNewcomer } from "@/lib/matching";

/**
 * 기본은 "배정순"이다.
 * 내담자가 직접 고르게만 두면 상담이 상위 몇 명에게 쏠려, 실습이 필요한 신입 상담사는
 * 계속 0회에 머문다. 직접 고르기는 남겨두되 부가 경로로 내린다.
 */
type Sort = "match" | "rating" | "sessions";

export default function CounselorsPage() {
  return (
    <Suspense fallback={null}>
      <CounselorsPageContent />
    </Suspense>
  );
}

function CounselorsPageContent() {
  const fromTest = useSearchParams().get("from") === "test";
  const [topic, setTopic] = useState<CounselorTag | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("match");

  const list = useMemo(() => {
    let result = COUNSELORS.filter(isEligible);
    if (topic) result = result.filter((c) => c.tags.includes(topic));
    if (onlineOnly) result = result.filter((c) => c.online);

    if (sort === "rating") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    } else if (sort === "sessions") {
      result = [...result].sort((a, b) => b.sessionCount - a.sessionCount);
    } else {
      result = [...result].sort((a, b) => matchScore(b, topic) - matchScore(a, topic));
      result = reserveSlotForNewcomer(result);
    }
    return result;
  }, [topic, onlineOnly, sort]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-extrabold text-text">또래 상담사 찾기</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
          고민 주제를 고르면 지금 이야기 나눌 수 있는 순서로 보여드려요.
        </p>
      </div>

      {fromTest && (
        <div className="rounded-2xl border border-border bg-primary-light px-4 py-3 text-[13px] leading-relaxed text-text-2">
          검사 결과를 가져왔어요. 상담을 시작하면 결과를 함께 전달할 수 있어요.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_TAGS.map((t) => (
          <Chip key={t} active={topic === t} onClick={() => setTopic((p) => (p === t ? null : t))}>
            {t}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOnlineOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
            onlineOnly ? "border-success bg-[#eafaf5] text-success" : "border-border text-text-muted"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${onlineOnly ? "bg-success" : "bg-text-faint"}`} />
          지금 가능한 사람만
        </button>
        <div className="ml-auto flex gap-1 rounded-xl border border-border bg-surface p-1">
          {(["match", "rating", "sessions"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                sort === s ? "bg-primary-dark text-white" : "text-text-muted"
              }`}
            >
              {s === "match" ? "배정순" : s === "rating" ? "평점순" : "상담많은순"}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-faint">조건에 맞는 상담사가 없어요</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 shell:grid-cols-2">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/counselors/${c.id}`}
              className="flex gap-3.5 rounded-2xl border border-border bg-surface p-4 transition-shadow hover:shadow-card"
            >
              <div className="relative flex-shrink-0">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-extrabold"
                  style={{ background: c.avatarBg, color: c.avatarColor }}
                >
                  {c.name.slice(0, 1)}
                </div>
                {c.online && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface bg-success" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-text">{c.name}</span>
                  {c.online && (
                    <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                      지금 가능
                    </span>
                  )}
                  <span className="ml-auto">
                    {/* 후기가 없는 프로필에 빈 별점을 띄우면 그 자체로 기피 대상이 된다. */}
                    {isNewCounselor(c) ? (
                      <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-dark">
                        이제 막 시작했어요
                      </span>
                    ) : (
                      <Rating value={c.rating} count={c.reviewCount} />
                    )}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-text-muted">{c.major}</div>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-2">{c.intro}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] font-bold text-text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-text-faint">
        배정순은 지금 상담 가능한지, 주제가 맞는지, 최근 상담이 적었는지를 함께 봅니다.
        솜잇은 상담을 처음 시작하는 또래 상담사에게도 기회가 고르게 돌아가도록 순서를 정합니다.
      </p>
    </div>
  );
}

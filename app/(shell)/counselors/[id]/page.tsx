"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Rating from "@/app/components/ui/Rating";
import AuthLink from "@/app/components/AuthLink";
import { formatRelativeTime } from "../../community/time";
import { COUNSELORS } from "../mock";
import { isNewCounselor } from "@/lib/matching";

export default function CounselorDetailPage() {
  const params = useParams<{ id: string }>();
  const counselor = COUNSELORS.find((c) => c.id === params.id);

  if (!counselor) {
    return (
      <div className="py-16 text-center text-sm text-text-faint">
        상담사를 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/counselors" className="font-bold text-primary-dark">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <div className="flex gap-4">
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold"
            style={{ background: counselor.avatarBg, color: counselor.avatarColor }}
          >
            {counselor.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-text">{counselor.name}</h1>
              {counselor.online && (
                <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                  지금 가능
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted">{counselor.major}</div>
            <div className="mt-1.5 flex items-center gap-3">
              {isNewCounselor(counselor) ? (
                <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  이제 막 시작했어요
                </span>
              ) : (
                <Rating value={counselor.rating} count={counselor.reviewCount} size="md" />
              )}
              <span className="text-xs text-text-faint">상담 {counselor.sessionCount}회</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-2">{counselor.intro}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counselor.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-primary-light px-2 py-1 text-[11px] font-bold text-primary-dark"
            >
              {t}
            </span>
          ))}
        </div>
        <AuthLink
          href={`/chat?counselor=${counselor.id}`}
          className="mt-5 block rounded-xl bg-primary-dark py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
        >
          {counselor.online ? "지금 상담 시작하기 →" : "상담 신청하기 →"}
        </AuthLink>
      </Card>

      <Card>
        <div className="mb-3 font-extrabold text-text">
          후기 <span className="text-primary-dark">{counselor.reviews.length}</span>
        </div>
        {counselor.reviews.length === 0 ? (
          <div className="py-8 text-center text-[13px] leading-relaxed text-text-faint">
            아직 후기가 없어요.
            <br />
            처음 이야기를 나누는 사람이 되어주실 수 있어요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {counselor.reviews.map((r) => (
              <div key={r.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-text">{r.authorName}</span>
                  <Rating value={r.rating} />
                  <span className="ml-auto text-[11px] text-text-faint">
                    {formatRelativeTime(r.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-text-2">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

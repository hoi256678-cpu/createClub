"use client";

import Link from "next/link";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { loginHref } from "@/app/components/RequireAuth";
import CrisisNotice from "@/app/components/CrisisNotice";

/**
 * 검사 결과 화면의 다음 행동.
 *
 * 검사는 게스트도 할 수 있고, 결과는 기기에 먼저 저장된다.
 * 로그인하면 그 기록이 계정으로 이어지므로, 검사를 다시 할 필요가 없다.
 *
 * 다만 위험 구간에서는 상담 연결보다 전문기관 안내가 먼저다.
 * 아직 자격을 갖추지 않은 또래 상담사에게 넘길 사안이 아니다.
 */
export default function TestResultActions({
  needsSupport,
  isHighRisk = false,
  delta,
}: {
  needsSupport: boolean;
  isHighRisk?: boolean;
  delta: number | null;
}) {
  const { state } = useAuthStatus();
  const isGuest = state.phase === "out";

  // 로그인하면 방금 본 결과를 들고 상담사 찾기로 이어진다.
  const counselHref = isGuest ? loginHref("/counselors?from=test") : "/counselors?from=test";

  return (
    <div className="mt-6 flex flex-col gap-3 text-left">
      {delta !== null && (
        <div className="rounded-xl border border-border bg-bg px-4 py-3 text-[13px] leading-relaxed text-text-2">
          지난번보다{" "}
          <span className="font-extrabold text-primary-dark">
            {delta > 0
              ? `${delta}점 높아`
              : delta < 0
                ? `${Math.abs(delta)}점 낮아`
                : "변화 없이 같아"}
          </span>
          졌어요.
        </div>
      )}

      {isHighRisk && <CrisisNotice compact />}

      {needsSupport && !isHighRisk && (
        <Link
          href={counselHref}
          className="rounded-xl bg-primary-dark px-5 py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
        >
          이 결과로 상담사 찾아보기
        </Link>
      )}

      {isGuest ? (
        <div className="rounded-xl border border-border bg-bg px-4 py-3 text-[12px] leading-relaxed text-text-muted">
          결과는 이 기기에 저장했어요. 로그인하면 계정으로 옮겨져서 기기를 바꿔도 남아요.
          <Link href={loginHref("/mypage")} className="mt-1 block font-bold text-primary-dark">
            로그인하고 기록 지키기
          </Link>
        </div>
      ) : (
        <Link
          href="/mypage"
          className="rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-text-muted transition-colors hover:border-primary-dark hover:text-primary-dark"
        >
          내 검사 기록 보기
        </Link>
      )}
    </div>
  );
}

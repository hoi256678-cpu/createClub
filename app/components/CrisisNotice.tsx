"use client";

import { CRISIS_RESOURCES } from "@/lib/crisis";

/**
 * 위기 신호가 감지됐을 때 보여주는 안내.
 *
 * 설계 원칙
 * - 글 작성이나 기록을 "막지 않는다". 막으면 표현을 바꿔 우회하고 도움받을 기회만 사라진다.
 * - 진단하거나 비난하지 않는다. 도움받을 곳이 있다는 사실만 전한다.
 * - 이 화면에는 이모지를 쓰지 않는다. 가벼워 보이면 안내가 진지하게 읽히지 않는다.
 * - 전화번호는 tel: 링크로 걸어 모바일에서 한 번에 연결되게 한다.
 */
export default function CrisisNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="위기 상담 안내"
      className="rounded-2xl border border-[#e4cdcd] bg-[#fdf6f6] p-5"
    >
      <h2 className="text-[15px] font-extrabold text-text">지금 많이 힘드신 것 같아요</h2>
      {!compact && (
        <p className="mt-2 text-[13px] leading-relaxed text-text-2">
          혼자 견디지 않아도 됩니다. 아래 번호는 24시간 언제나 연결됩니다.
          당신을 판단하지 않고 끝까지 당신 편에서 들어주는 사람이 지금도 기다리고 있어요.
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.tel}>
            <a
              href={`tel:${r.tel.replace(/-/g, "")}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-primary-dark"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-text">{r.name}</span>
                <span className="block text-[11px] text-text-muted">{r.desc}</span>
              </span>
              <span className="flex-shrink-0 text-[15px] font-extrabold tracking-tight text-primary-dark">
                {r.tel}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

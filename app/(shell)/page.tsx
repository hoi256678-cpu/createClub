import Link from "next/link";
import Card from "@/app/components/ui/Card";
import SectionTitle from "@/app/components/ui/SectionTitle";
import { TEST_CARDS } from "./test/data";
import { COMMUNITY_POSTS } from "./community/mock";

const QUOTES = [
  { text: "어둠 속을 걷고 있다면, 그냥 계속 걸어라.", src: "— 윈스턴 처칠" },
  { text: "넘어지는 것이 실패가 아니다. 넘어진 채로 머무는 것이 실패다.", src: "— 메리 피커드" },
  { text: "지금 이 순간도 괜찮다. 천천히 가도 된다. 멈춰있어도 된다.", src: "— 채사장" },
];

export default function HomePage() {
  const popularPosts = [...COMMUNITY_POSTS]
    .filter((p) => p.likes >= 15)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);
  const quote = QUOTES[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark via-primary to-[#b8d4f0] px-8 py-9">
        <div className="relative z-10 max-w-md">
          <h1 className="text-2xl font-black leading-snug text-white">
            마음이 힘들 때
            <br />
            솜잇이 함께해요 💙
          </h1>
          <p className="mt-2 text-sm text-white/80">또래 상담사와 1:1로 이야기를 나눠보세요</p>
          <Link
            href="/chat"
            className="mt-5 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-primary-dark transition-shadow hover:shadow-card-md"
          >
            AI 맞춤 상담 시작하기 →
          </Link>
        </div>
        <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-7xl opacity-20">
          🌊
        </div>
      </div>

      <div>
        <SectionTitle action={<Link href="/test">전체보기 ›</Link>}>🧪 나를 위한 심리검사</SectionTitle>
        <div className="grid grid-cols-1 gap-3.5 shell:grid-cols-3">
          {TEST_CARDS.map((t) => (
            <Link
              key={t.type}
              href="/test"
              className="relative flex min-h-[130px] flex-col gap-2.5 overflow-hidden rounded-2xl p-5 text-white transition-transform hover:-translate-y-1"
              style={{ background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})` }}
            >
              <div className="text-[11px] font-bold text-white/75">{t.label}</div>
              <div className="text-lg font-extrabold leading-snug">{t.title}</div>
              <div className="mt-auto text-xs text-white/70">{t.sub}</div>
              <div className="absolute bottom-3.5 right-4 text-4xl opacity-85">{t.emoji}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 shell:grid-cols-[2fr_1fr]">
        <div>
          <SectionTitle action={<Link href="/community">더보기 ›</Link>}>⭐ 인기 글</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {popularPosts.map((p) => (
              <Link
                key={p.id}
                href={`/community/${p.id}`}
                className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0 hover:bg-primary-xlight"
              >
                <span className="w-12 flex-shrink-0 rounded-md bg-primary-light px-1.5 py-0.5 text-center text-[10px] font-bold text-primary-dark">
                  {p.tag}
                </span>
                <span className="flex-1 truncate text-sm text-text-2">{p.title}</span>
                <span className="flex flex-shrink-0 items-center gap-2 text-xs text-text-faint">
                  <span className="font-bold text-primary-dark">👍 {p.likes}</span>
                  <span>💬 {p.cmtCount}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <SectionTitle>💬 오늘의 한마디</SectionTitle>
          <Card className="relative overflow-hidden">
            <div className="text-sm font-semibold leading-relaxed text-text-2">{quote.text}</div>
            <div className="mt-3 text-right text-xs italic text-text-muted">{quote.src}</div>
          </Card>
          <Link href="/chat" className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 hover:bg-primary-xlight">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-xl">💬</div>
            <div>
              <div className="text-sm font-bold text-text">AI 맞춤 1:1 상담</div>
              <div className="mt-0.5 text-xs text-text-muted">나에게 맞는 상담사를 연결해드려요</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

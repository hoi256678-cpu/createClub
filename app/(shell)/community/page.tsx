"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { COMMUNITY_POSTS, NOTICE_POSTS, TOPICS, TOPIC_EMOJI } from "./mock";

type Tab = "best" | "all" | "notice";

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("best");
  const [search, setSearch] = useState("");

  const posts = useMemo(() => {
    let list =
      tab === "best"
        ? [...COMMUNITY_POSTS].filter((p) => p.likes >= 15).sort((a, b) => b.likes - a.likes)
        : [...COMMUNITY_POSTS];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    return list;
  }, [tab, search]);

  return (
    <div className="grid grid-cols-1 gap-6 shell:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(["best", "all", "notice"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t ? "bg-primary-dark text-white" : "text-text-muted"
                }`}
              >
                {t === "best" ? "인기글" : t === "all" ? "전체글" : "공지사항"}
              </button>
            ))}
          </div>
          <Link
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </Link>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {tab === "notice" ? (
          <div className="flex flex-col gap-2">
            {NOTICE_POSTS.map((n) => (
              <Card key={n.id}>
                <div className="text-sm font-bold text-primary-dark">공지</div>
                <div className="mt-1 font-bold text-text">{n.title}</div>
                <div className="mt-1 text-xs text-text-faint">{n.time}</div>
              </Card>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-text-faint">해당하는 글이 없어요</div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                      {p.tag}
                    </span>
                    {p.likes >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{p.body}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-faint">
                    <span>
                      {p.author} · {p.time}
                    </span>
                    <span>👍 {p.likes}</span>
                    <span>💬 {p.cmtCount}</span>
                    <span>👁 {p.views}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-3 font-extrabold text-text">🔥 주목받는 주제</div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <Chip key={t}>
                {TOPIC_EMOJI[t]} {t}
              </Chip>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          <div className="flex flex-col divide-y divide-border">
            {NOTICE_POSTS.map((n) => (
              <div key={n.id} className="py-2 text-[13px] text-text-muted">
                {n.title}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

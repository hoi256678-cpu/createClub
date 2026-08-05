"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { NOTICE_POSTS, TOPICS, TOPIC_EMOJI } from "./mock";
import { formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost } from "./types";

type Tab = "best" | "all" | "notice";

export default function CommunityPage() {
  const [auth] = useAuthStatus();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = tab === "best" ? pickPopularPosts(posts) : [...posts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    return list;
  }, [tab, search, posts]);

  function handleWriteClick(e: React.MouseEvent) {
    if (auth.phase === "out") {
      e.preventDefault();
      router.push("/login");
    }
  }

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
            onClick={handleWriteClick}
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
        ) : loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-text-faint">해당하는 글이 없어요</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <Link key={p.id} href={`/community/${p.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                      {p.tag}
                    </span>
                    {p.likeCount >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{p.body}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-faint">
                    <span>
                      {p.authorName} · {formatRelativeTime(p.createdAt)}
                    </span>
                    <span>👍 {p.likeCount}</span>
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

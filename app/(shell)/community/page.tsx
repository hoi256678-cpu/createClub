"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost } from "./types";

function stripHtml(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
}

function firstImageSrc(html: string) {
  return html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
}

type Tab = "best" | "all";
type Sort = "recent" | "likes" | "comments" | "views";

export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <CommunityPageContent />
    </Suspense>
  );
}

function CommunityPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  // 게시글 상세 화면의 주제 칩에서 넘어온 경우 해당 주제로 바로 걸러준다.
  const [topic, setTopic] = useState<string | null>(searchParams.get("topic"));
  const [sort, setSort] = useState<Sort>("recent");
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
    if (topic) {
      list = list.filter((p) => p.tag === topic);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || stripHtml(p.body).toLowerCase().includes(q));
    }
    // 인기글 탭은 이미 좋아요순으로 추려진 목록이라 정렬을 덮어쓰지 않는다.
    if (tab !== "best") {
      if (sort === "likes") list.sort((a, b) => b.likeCount - a.likeCount);
      else if (sort === "comments") list.sort((a, b) => b.cmtCount - a.cmtCount);
      else if (sort === "views") list.sort((a, b) => b.views - a.views);
      else list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    // 전체글 탭 + 주제 필터/검색이 없을 때만 고정 공지를 맨 위로 묶는다.
    // 인기글 탭이나 필터/검색 중에는 억지로 끌어올리지 않고 자연스러운 순서에 둔다.
    const showPinnedFirst = tab === "all" && !topic && !search.trim();
    if (showPinnedFirst) {
      const pinned = list.filter((p) => p.isNotice && p.pinned);
      const rest = list.filter((p) => !(p.isNotice && p.pinned));
      return [...pinned, ...rest];
    }
    return list;
  }, [tab, search, topic, sort, posts]);

  const noticePosts = useMemo(
    () => [...posts].filter((p) => p.isNotice).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [posts]
  );

  return (
    <div className="grid grid-cols-1 gap-6 shell:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(["best", "all"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t ? "bg-primary-dark text-white" : "text-text-muted"
                }`}
              >
                {t === "best" ? "인기글" : "전체글"}
              </button>
            ))}
          </div>
          <AuthLink
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </AuthLink>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1">
          {(["recent", "likes", "comments", "views"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              disabled={tab === "best"}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                sort === s && tab !== "best" ? "text-primary-dark" : "text-text-faint"
              }`}
            >
              {s === "recent" ? "최신순" : s === "likes" ? "공감순" : s === "comments" ? "댓글순" : "조회순"}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-text-faint">
            {topic ? `'${topic}' 주제의 글이 아직 없어요` : "해당하는 글이 없어요"}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => {
              const thumbnail = p.image ?? firstImageSrc(p.body);
              return (
                <Link key={p.id} href={`/community/${p.id}`}>
                  <Card
                    className={`cursor-pointer transition-shadow hover:shadow-card ${
                      p.isNotice && p.pinned ? "bg-primary-xlight" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                        {p.isNotice ? (p.pinned ? "📌 고정 공지" : "공지") : p.tag}
                      </span>
                      {p.likeCount >= 15 && <span className="text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>}
                      {p.cmtCount > 0 && (
                        <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                          답변 완료
                        </span>
                      )}
                    </div>
                    <div className="mb-1.5 font-bold text-text">{p.title}</div>
                    <div className="mb-3 flex gap-3">
                      <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{stripHtml(p.body)}</p>
                      {thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                        <img
                          src={thumbnail}
                          alt=""
                          className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                        />
                      )}
                    </div>
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
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-3 flex items-center gap-2 font-extrabold text-text">
            🔥 주목받는 주제
            {topic && (
              <button
                onClick={() => setTopic(null)}
                className="ml-auto text-[11px] font-bold text-primary-dark"
              >
                필터 해제
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <Chip
                key={t}
                active={topic === t}
                onClick={() => setTopic((prev) => (prev === t ? null : t))}
              >
                {TOPIC_EMOJI[t]} {t}
              </Chip>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3 font-extrabold text-text">📋 공지사항</div>
          {noticePosts.length === 0 ? (
            <p className="py-2 text-[13px] text-text-faint">아직 공지가 없어요</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {noticePosts.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

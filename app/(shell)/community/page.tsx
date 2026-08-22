"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import AuthLink from "@/app/components/AuthLink";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS, TOPIC_EMOJI } from "./mock";
import { formatNoticeDate, formatRelativeTime } from "./time";
import { pickPopularPosts } from "./popular";
import type { CommunityPost, NoticeItem } from "./types";

type Tab = "best" | "all" | "notice";
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
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { state: auth } = useAuthStatus();
  const isAdmin = auth.phase === "in" && auth.role === "admin";
  const [creatingNotice, setCreatingNotice] = useState(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeTitle, setEditNoticeTitle] = useState("");
  const [editNoticeBody, setEditNoticeBody] = useState("");
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/community/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  function loadNotices() {
    apiFetch("/api/community/notices")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NoticeItem[]) => setNotices(data))
      .catch(() => setNotices([]));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 공지 목록 조회
  useEffect(loadNotices, []);

  async function submitCreateNotice(e: FormEvent) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify({ title: newNoticeTitle, body: newNoticeBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "작성에 실패했어요");
      return;
    }
    setNewNoticeTitle("");
    setNewNoticeBody("");
    setCreatingNotice(false);
    loadNotices();
  }

  function startEditNotice(n: NoticeItem) {
    setEditingNoticeId(n.id);
    setEditNoticeTitle(n.title);
    setEditNoticeBody(n.body);
    setNoticeFormError(null);
  }

  async function submitEditNotice(e: FormEvent, id: string) {
    e.preventDefault();
    setNoticeFormError(null);
    const res = await apiFetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editNoticeTitle, body: editNoticeBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNoticeFormError(data.error ?? "수정에 실패했어요");
      return;
    }
    setEditingNoticeId(null);
    loadNotices();
  }

  async function handleDeleteNotice(id: string) {
    if (confirmDeleteNoticeId !== id) {
      setConfirmDeleteNoticeId(id);
      return;
    }
    const res = await apiFetch(`/api/admin/notices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
    setConfirmDeleteNoticeId(null);
  }

  const filtered = useMemo(() => {
    let list = tab === "best" ? pickPopularPosts(posts) : [...posts];
    if (topic) {
      list = list.filter((p) => p.tag === topic);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    // 인기글 탭은 이미 좋아요순으로 추려진 목록이라 정렬을 덮어쓰지 않는다.
    if (tab !== "best") {
      if (sort === "likes") list.sort((a, b) => b.likeCount - a.likeCount);
      else if (sort === "comments") list.sort((a, b) => b.cmtCount - a.cmtCount);
      else if (sort === "views") list.sort((a, b) => b.views - a.views);
      else list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return list;
  }, [tab, search, topic, sort, posts]);

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
          <AuthLink
            href="/community/write"
            className="rounded-xl bg-primary-dark px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            ✍️ 글쓰기
          </AuthLink>
        </div>

        {tab !== "notice" && (
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
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="궁금한 내용을 검색해보세요"
          className="mb-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />

        {tab === "notice" ? (
          <div className="flex flex-col gap-2">
            {isAdmin && (
              <div className="mb-2">
                {!creatingNotice ? (
                  <button
                    onClick={() => {
                      setCreatingNotice(true);
                      setNoticeFormError(null);
                    }}
                    className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-bold text-white"
                  >
                    새 공지 작성
                  </button>
                ) : (
                  <form
                    onSubmit={submitCreateNotice}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={newNoticeTitle}
                      onChange={(e) => setNewNoticeTitle(e.target.value)}
                      placeholder="제목"
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <textarea
                      value={newNoticeBody}
                      onChange={(e) => setNewNoticeBody(e.target.value)}
                      placeholder="내용"
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreatingNotice(false)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        작성하기
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {notices.length === 0 ? (
              <div className="py-16 text-center text-text-faint">공지가 없어요</div>
            ) : (
              notices.map((n) =>
                isAdmin && editingNoticeId === n.id ? (
                  <form
                    key={n.id}
                    onSubmit={(e) => submitEditNotice(e, n.id)}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5"
                  >
                    <input
                      value={editNoticeTitle}
                      onChange={(e) => setEditNoticeTitle(e.target.value)}
                      maxLength={100}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <textarea
                      value={editNoticeBody}
                      onChange={(e) => setEditNoticeBody(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    {noticeFormError && <p className="text-xs font-semibold text-danger">{noticeFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoticeId(null)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-text-muted"
                      >
                        취소
                      </button>
                      <button type="submit" className="flex-1 rounded-lg bg-primary-dark py-2 text-xs font-bold text-white">
                        저장
                      </button>
                    </div>
                  </form>
                ) : (
                  <Card key={n.id} className="transition-shadow hover:shadow-card">
                    <Link href={`/community/notice/${n.id}`} className="block cursor-pointer">
                      <div className="text-sm font-bold text-primary-dark">공지</div>
                      <div className="mt-1 font-bold text-text">{n.title}</div>
                      <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(n.createdAt)}</div>
                    </Link>
                    {isAdmin && (
                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => startEditNotice(n)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteNotice(n.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                            confirmDeleteNoticeId === n.id
                              ? "border-danger bg-[#fff0f0] text-danger"
                              : "border-danger text-danger hover:bg-[#fff0f0]"
                          }`}
                        >
                          {confirmDeleteNoticeId === n.id ? "정말 삭제할까요?" : "삭제"}
                        </button>
                      </div>
                    )}
                  </Card>
                )
              )
            )}
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-text-faint">
            {topic ? `'${topic}' 주제의 글이 아직 없어요` : "해당하는 글이 없어요"}
          </div>
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
                    {p.cmtCount > 0 && (
                      <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                        답변 완료
                      </span>
                    )}
                  </div>
                  <div className="mb-1.5 font-bold text-text">{p.title}</div>
                  <div className="mb-3 flex gap-3">
                    <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{p.body}</p>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                      <img
                        src={p.image}
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
            ))}
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
          {notices.length === 0 ? (
            <p className="py-2 text-[13px] text-text-faint">아직 공지가 없어요</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {notices.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/community/notice/${n.id}`}
                  className="py-2 text-[13px] text-text-muted transition-colors hover:text-primary-dark"
                >
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

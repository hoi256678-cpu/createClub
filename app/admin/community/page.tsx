"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { stripHtml } from "@/app/(shell)/community/htmlUtils";

type AdminComment = { id: string; authorId: string; text: string; createdAt: string };
type AdminPost = {
  id: string;
  tag: string;
  title: string;
  body: string;
  image: string | null;
  authorId: string;
  createdAt: string;
  comments: AdminComment[];
};

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    apiFetch("/api/admin/posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 게시글 로드 시 로딩 상태를 즉시 업데이트한다
  useEffect(load, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deletePost(id: string) {
    const res = await apiFetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function deleteComment(postId: string, commentId: string) {
    const res = await apiFetch(`/api/admin/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p)),
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-text">커뮤니티 관리</h1>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center text-text-faint">게시글이 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  {post.tag}
                </span>
                <span className="text-[11px] text-text-faint">댓글 {post.comments.length}개</span>
              </div>
              <div className="mb-1.5 font-bold text-text">{post.title}</div>
              <div className="mb-3 flex gap-3">
                <p className="line-clamp-2 flex-1 text-[13px] text-text-muted">{stripHtml(post.body)}</p>
                {post.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
                  <img
                    src={post.image}
                    alt="첨부 이미지"
                    className="h-14 w-14 flex-shrink-0 rounded-lg border border-border object-cover"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleExpand(post.id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                >
                  {expanded.has(post.id) ? "댓글 숨기기" : "댓글 보기"}
                </button>
                <button
                  onClick={() => deletePost(post.id)}
                  className="rounded-lg border border-danger px-3 py-1.5 text-xs font-bold text-danger hover:bg-[#fff0f0]"
                >
                  게시글 삭제
                </button>
              </div>

              {expanded.has(post.id) && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  {post.comments.length === 0 ? (
                    <div className="text-xs text-text-faint">댓글이 없어요</div>
                  ) : (
                    post.comments.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-2">{c.text}</span>
                        <button
                          onClick={() => deleteComment(post.id, c.id)}
                          className="flex-shrink-0 text-xs font-bold text-danger"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

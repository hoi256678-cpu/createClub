"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { loginHref } from "@/app/components/RequireAuth";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS, TOPIC_EMOJI } from "../mock";
import { formatRelativeTime } from "../time";
import type { CommunityPostDetail } from "../types";

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [post, setPost] = useState<CommunityPostDetail | null | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    apiFetch(`/api/community/posts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setPost(null);
          return;
        }
        setPost(await res.json());
      })
      .catch(() => setPost(null));
  }, [params.id]);

  function requireLogin() {
    if (auth.phase === "out") {
      router.push(loginHref(`/community/${params.id}`));
      return true;
    }
    return false;
  }

  async function toggleLike() {
    if (requireLogin() || !post) return;
    const res = await apiFetch(`/api/community/posts/${post.id}/like`, { method: "POST" });
    if (res.status === 401) {
      router.push(loginHref(`/community/${params.id}`));
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { liked: boolean; likeCount: number };
    setPost({ ...post, likedByMe: data.liked, likeCount: data.likeCount });
  }

  async function toggleSave() {
    if (requireLogin() || !post) return;
    const res = await apiFetch(`/api/community/posts/${post.id}/save`, { method: "POST" });
    if (res.status === 401) {
      router.push(loginHref(`/community/${params.id}`));
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { saved: boolean };
    setPost({ ...post, savedByMe: data.saved });
    refreshPostCounts();
  }

  async function handleDelete() {
    if (!post) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const res = await apiFetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
    if (res.status === 401) {
      router.push(loginHref(`/community/${params.id}`));
      return;
    }
    if (res.ok) {
      refreshPostCounts();
      router.push("/community");
    }
    setConfirmDelete(false);
  }

  async function submitComment() {
    if (requireLogin() || !post || !comment.trim()) return;
    const res = await apiFetch(`/api/community/posts/${post.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text: comment.trim() }),
    });
    if (res.status === 401) {
      router.push(loginHref(`/community/${params.id}`));
      return;
    }
    if (!res.ok) return;
    const comments = await res.json();
    setPost({ ...post, comments, cmtCount: comments.length });
    setComment("");
  }

  if (post === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
    return (
      <div className="py-16 text-center text-text-faint">
        게시글을 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/community" className="font-bold text-primary-dark">
            커뮤니티로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 shell:grid-cols-[1fr_300px]">
      <div>
        <button
          onClick={() => router.push("/community")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-text-muted"
        >
          ← 커뮤니티로 돌아가기
        </button>
        <Card>
          <div className="mb-3 flex gap-2">
            <span className="rounded-md bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary-dark">
              {post.isNotice ? (post.pinned ? "📌 고정 공지" : "공지") : post.tag}
            </span>
            {post.likeCount >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-black text-text">{post.title}</h1>
            {(post.isMine || (auth.phase === "in" && auth.role === "admin")) && (
              <div className="flex flex-shrink-0 gap-1.5">
                <Link
                  href={`/community/${post.id}/edit`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-muted"
                >
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                    confirmDelete
                      ? "border-danger bg-[#fff0f0] text-danger"
                      : "border-danger text-danger hover:bg-[#fff0f0]"
                  }`}
                >
                  {confirmDelete ? "정말 삭제할까요?" : "삭제"}
                </button>
              </div>
            )}
          </div>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.authorName} · {post.authorRole} · {formatRelativeTime(post.createdAt)} · 조회 {post.views}
            {post.editedAt && <span className="ml-1 text-text-faint">(수정됨)</span>}
          </div>
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI
            <img
              src={post.image}
              alt=""
              className="mb-4 max-h-[480px] w-full rounded-xl border border-border object-contain"
            />
          )}
          <div
            className="rich-body text-[15px] leading-[1.85] text-text-2"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />

          <div className="my-6 flex justify-center gap-3 border-y border-border py-6">
            <button
              onClick={toggleLike}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-6 py-3 font-bold transition-colors ${
                post.likedByMe ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-xl">👍</span>
              <span className="text-sm text-text">{post.likeCount}</span>
            </button>
            <button
              onClick={toggleSave}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-6 py-3 font-bold transition-colors ${
                post.savedByMe ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-xl">🔖</span>
              <span className="text-sm text-text">{post.savedByMe ? "저장됨" : "저장"}</span>
            </button>
          </div>

          <div className="mb-3 font-extrabold text-text">
            댓글 <span className="text-primary-dark">{post.comments.length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {post.comments.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary-dark">
                  💬
                </div>
                <div>
                  <div className="text-[13px] font-bold text-text">
                    {c.authorName}
                    <span className="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-dark">
                      {c.authorRole}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-text-2">{c.text}</div>
                  <div className="mt-1 text-[11px] text-text-faint">{formatRelativeTime(c.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="따뜻한 댓글을 남겨보세요 💙"
              rows={2}
              className="flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-[13px] outline-none focus:border-primary"
            />
            <button onClick={submitComment} className="rounded-xl bg-primary-dark px-4 py-2.5 text-[13px] font-bold text-white">
              올리기
            </button>
          </div>
        </Card>
      </div>
      <div>
        <Card>
          <div className="mb-3 font-extrabold text-text">🔥 주목받는 주제</div>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <Link
                key={t}
                href={`/community?topic=${encodeURIComponent(t)}`}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:border-primary-dark hover:text-primary-dark"
              >
                {TOPIC_EMOJI[t]} {t}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

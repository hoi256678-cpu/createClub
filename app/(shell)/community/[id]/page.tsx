"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { COMMUNITY_POSTS, TOPICS, TOPIC_EMOJI, type CommunityComment } from "../mock";

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const post = COMMUNITY_POSTS.find((p) => p.id === Number(params.id));

  const [likes, setLikes] = useState(post?.likes ?? 0);
  const [voted, setVoted] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommunityComment[]>(post?.comments ?? []);

  if (!post) {
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

  function toggleVote() {
    if (voted) {
      setLikes((n) => n - 1);
      setVoted(false);
    } else {
      setLikes((n) => n + 1);
      setVoted(true);
    }
  }

  function submitComment() {
    if (!comment.trim()) return;
    setComments((c) => [...c, { av: "💬", name: "나", role: "", text: comment.trim(), date: "방금 전" }]);
    setComment("");
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
              {post.tag}
            </span>
            {post.likes >= 15 && (
              <span className="rounded-md bg-[#fff0f0] px-2.5 py-1 text-[11px] font-bold text-[#e07b8b]">🔥 인기</span>
            )}
          </div>
          <h1 className="mb-3 text-2xl font-black text-text">{post.title}</h1>
          <div className="mb-5 border-b border-border pb-4 text-[13px] text-text-muted">
            {post.author} · {post.gender}성 {post.age}세 · {post.time} · 조회 {post.views}
          </div>
          <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-text-2">{post.body}</div>

          <div className="my-6 flex justify-center border-y border-border py-6">
            <button
              onClick={toggleVote}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-6 py-3 font-bold transition-colors ${
                voted ? "border-primary-dark bg-primary-light" : "border-border"
              }`}
            >
              <span className="text-xl">👍</span>
              <span className="text-sm text-text">{likes}</span>
            </button>
          </div>

          <div className="mb-3 font-extrabold text-text">
            댓글 <span className="text-primary-dark">{comments.length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {comments.map((c, i) => (
              <div key={i} className="flex gap-3 border-b border-border pb-3 last:border-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary-dark">
                  {c.av}
                </div>
                <div>
                  <div className="text-[13px] font-bold text-text">
                    {c.name}
                    {c.role && (
                      <span className="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-dark">
                        {c.role}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[13px] text-text-2">{c.text}</div>
                  <div className="mt-1 text-[11px] text-text-faint">{c.date}</div>
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
              <Chip key={t}>
                {TOPIC_EMOJI[t]} {t}
              </Chip>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

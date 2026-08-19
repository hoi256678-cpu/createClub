"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/app/components/RequireAuth";
import PostListCard from "@/app/components/PostListCard";
import { apiFetch } from "@/lib/api";
import type { CommunityPost } from "../../community/types";

export default function MyPostsPage() {
  return <RequireAuth>{() => <MyPostsContent />}</RequireAuth>;
}

function MyPostsContent() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/community/my-posts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CommunityPost[]) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Link
        href="/mypage"
        className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-text-muted"
      >
        ← 마이페이지로 돌아가기
      </Link>

      <div className="mb-5 text-lg font-extrabold text-text">작성한 글</div>

      {loading ? (
        <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center text-text-faint">아직 작성한 글이 없어요</div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((p) => (
            <PostListCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

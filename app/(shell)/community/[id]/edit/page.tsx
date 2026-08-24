"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import PostForm from "../../PostForm";
import type { CommunityPost } from "../../types";

export default function CommunityPostEditPage() {
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityPostEditContent />
    </RequireAuth>
  );
}

function CommunityPostEditContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);

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

  if (post === undefined || auth.phase === "loading") {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
    return <div className="py-16 text-center text-text-faint">게시글을 찾을 수 없어요.</div>;
  }

  const isAdmin = auth.phase === "in" && auth.role === "admin";
  const canEdit = post.isMine || isAdmin;
  if (!canEdit) {
    return (
      <div className="py-16 text-center text-text-faint">
        수정 권한이 없어요.
        <div className="mt-4">
          <button onClick={() => router.push(`/community/${params.id}`)} className="font-bold text-primary-dark">
            게시글로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <PostForm
      postId={params.id}
      initial={{ tag: post.tag, title: post.title, body: post.body, isNotice: post.isNotice, pinned: post.pinned }}
      isAdmin={isAdmin}
      onSuccess={(id) => router.push(`/community/${id}`)}
    />
  );
}

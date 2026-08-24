"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { TOPICS } from "../../mock";
import type { CommunityPost } from "../../types";

export default function CommunityPostEditPage() {
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityPostEditForm />
    </RequireAuth>
  );
}

function CommunityPostEditForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/community/posts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setPost(null);
          return;
        }
        const data: CommunityPost = await res.json();
        setPost(data);
        setCategory(data.tag);
        setTitle(data.title);
        setBody(data.body);
      })
      .catch(() => setPost(null));
  }, [params.id]);

  // 글을 막지 않는다. 도움받을 곳이 있다는 것만 조용히 알린다.
  const showCrisis = detectCrisis(`${title} ${body}`);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/community/posts/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tag: category, title, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정에 실패했습니다");
        return;
      }
      router.push(`/community/${params.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (post === undefined || auth.phase === "loading") {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (post === null) {
    return <div className="py-16 text-center text-text-faint">게시글을 찾을 수 없어요.</div>;
  }

  const canEdit = post.isMine || (auth.phase === "in" && auth.role === "admin");
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
    <Card className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <Chip key={t} active={category === t} onClick={() => setCategory(t)}>
            {t}
          </Chip>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목을 입력하세요"
        maxLength={50}
        className="mb-3 w-full border-b border-border pb-3 text-xl font-bold text-text outline-none placeholder:text-text-faint"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="고민이나 이야기를 자유롭게 적어보세요 💙"
        rows={8}
        className="w-full resize-none text-sm leading-relaxed text-text-2 outline-none placeholder:text-text-faint"
      />
      {showCrisis && (
        <div className="mt-4">
          <CrisisNotice />
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
        <button
          onClick={() => router.push(`/community/${params.id}`)}
          className="rounded-xl border border-border px-6 py-2.5 text-sm font-bold text-text-muted"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "저장하는 중..." : "저장하기"}
        </button>
      </div>
    </Card>
  );
}

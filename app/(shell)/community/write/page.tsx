"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { apiFetch } from "@/lib/api";
import { TOPICS } from "../mock";

export default function CommunityWritePage() {
  // 글을 다 쓴 뒤 제출 순간에 튕기지 않도록 진입 시점에 막는다.
  return (
    <RequireAuth>
      <CommunityWriteForm />
    </RequireAuth>
  );
}

function CommunityWriteForm() {
  const router = useRouter();
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/community/posts", {
        method: "POST",
        body: JSON.stringify({ tag: category, title, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "글 작성에 실패했습니다");
        return;
      }
      router.push(`/community/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
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
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "올리는 중..." : "✍️ 올리기"}
        </button>
      </div>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "./mock";
import PostEditor from "./PostEditor";

// 리치 에디터 도입 전 평문(\n 줄바꿈만 있던) 본문인지 판별한다 — HTML 태그가 하나도 없으면 레거시로 본다.
function isLegacyPlainText(body: string) {
  return !/<[a-z][^>]*>/i.test(body);
}

// 레거시 평문 본문을 PostEditor(TipTap)가 안전하게 파싱할 수 있는 HTML로 변환한다.
// HTML로 파싱될 때 \n이 공백으로 뭉개지는 것을 막기 위해 줄바꿈을 명시적인 태그(p/br)로 바꾼다.
function legacyPlainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Initial = { tag: string; title: string; body: string; isNotice: boolean; pinned: boolean };

type Props = {
  postId?: string;
  initial?: Initial;
  isAdmin: boolean;
  onSuccess: (id: string) => void;
};

export default function PostForm({ postId, initial, isAdmin, onSuccess }: Props) {
  const router = useRouter();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [category, setCategory] = useState<string>(initial?.tag ?? TOPICS[0]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(
    initial ? (isLegacyPlainText(initial.body) ? legacyPlainTextToHtml(initial.body) : initial.body) : ""
  );
  const [isNotice, setIsNotice] = useState(initial?.isNotice ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 글을 막지 않는다. 도움받을 곳이 있다는 것만 조용히 알린다.
  const showCrisis = detectCrisis(`${title} ${body}`);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { tag: category, title, body };
      if (isAdmin) {
        payload.isNotice = isNotice;
        payload.pinned = isNotice && pinned;
      }
      const url = postId ? `/api/community/posts/${postId}` : "/api/community/posts";
      const res = await apiFetch(url, { method: postId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다");
        return;
      }
      if (!postId) refreshPostCounts();
      onSuccess(postId ?? data.id);
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-2xl">
      {isNotice ? (
        <p className="mb-4 text-xs font-semibold text-text-faint">📌 공지는 별도 배지로 표시돼요</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Chip key={t} active={category === t} onClick={() => setCategory(t)}>
              {t}
            </Chip>
          ))}
        </div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목을 입력하세요"
        maxLength={50}
        className="mb-3 w-full border-b border-border pb-3 text-xl font-bold text-text outline-none placeholder:text-text-faint"
      />
      <PostEditor value={body} onChange={setBody} />

      {isAdmin && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
            <input
              type="checkbox"
              checked={isNotice}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsNotice(checked);
                if (!checked && category === "공지") {
                  setCategory(TOPICS[0]);
                }
              }}
            />
            📌 공지로 등록
          </label>
          {isNotice && (
            <label className="ml-5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              📌 상단 고정
            </label>
          )}
        </div>
      )}

      {showCrisis && (
        <div className="mt-4">
          <CrisisNotice />
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
        {postId && (
          <button
            onClick={() => router.push(`/community/${postId}`)}
            className="rounded-xl border border-border px-6 py-2.5 text-sm font-bold text-text-muted"
          >
            취소
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim() || submitting}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {submitting ? "저장하는 중..." : postId ? "저장하기" : "✍️ 올리기"}
        </button>
      </div>
    </Card>
  );
}

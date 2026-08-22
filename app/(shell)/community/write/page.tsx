"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import CrisisNotice from "@/app/components/CrisisNotice";
import { detectCrisis } from "@/lib/crisis";
import { apiFetch } from "@/lib/api";
import { usePostCounts } from "@/app/hooks/usePostCounts";
import { TOPICS } from "../mock";

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

function resizeImageFile(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이미지를 처리할 수 없어요"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러올 수 없어요"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
    reader.readAsDataURL(file);
  });
}

export default function CommunityWritePage() {
  // 글을 다 쓴 뒤 제출 순간에 튕기지 않도록 진입 시점에 막는다.
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityWriteForm />
    </RequireAuth>
  );
}

function CommunityWriteForm() {
  const router = useRouter();
  const { refresh: refreshPostCounts } = usePostCounts();
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setImageError("이미지 용량이 너무 커요 (10MB 이하로 선택해주세요)");
      return;
    }
    try {
      const resized = await resizeImageFile(file);
      setImage(resized);
    } catch {
      setImageError("이미지를 처리하지 못했어요");
    }
  }

  // 글을 막지 않는다. 도움받을 곳이 있다는 것만 조용히 알린다.
  const showCrisis = detectCrisis(`${title} ${body}`);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/community/posts", {
        method: "POST",
        body: JSON.stringify({ tag: category, title, body, image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "글 작성에 실패했습니다");
        return;
      }
      refreshPostCounts();
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

      <div className="mt-4 border-t border-border pt-4">
        {image ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element -- base64 데이터 URI라 next/image 최적화 대상이 아님 */}
            <img src={image} alt="첨부 이미지 미리보기" className="max-h-48 rounded-xl border border-border" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-bold text-white"
            >
              제거
            </button>
          </div>
        ) : (
          <label className="inline-block cursor-pointer rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:border-primary">
            📷 이미지 첨부
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
        )}
        {imageError && <p className="mt-2 text-xs font-semibold text-danger">{imageError}</p>}
      </div>

      {showCrisis && (
        <div className="mt-4">
          <CrisisNotice />
        </div>
      )}
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

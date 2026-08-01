"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Chip from "@/app/components/ui/Chip";
import { TOPICS } from "../mock";

export default function CommunityWritePage() {
  const router = useRouter();
  const [category, setCategory] = useState<string>(TOPICS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="py-16 text-center">
        <div className="mb-2 text-2xl">✍️💙</div>
        <div className="mb-1 font-bold text-text">글이 올라갔어요 (임시 저장, 실제 저장은 아직 연결 전이에요)</div>
        <button onClick={() => router.push("/community")} className="mt-4 font-bold text-primary-dark">
          커뮤니티로 돌아가기
        </button>
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
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !body.trim()}
          className="rounded-xl bg-primary-dark px-6 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          ✍️ 올리기
        </button>
      </div>
    </Card>
  );
}

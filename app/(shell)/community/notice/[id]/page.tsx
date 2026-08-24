"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatNoticeDate } from "../../time";
import type { NoticeItem } from "../../types";

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const [notice, setNotice] = useState<NoticeItem | null | undefined>(undefined);

  useEffect(() => {
    apiFetch(`/api/community/notices/${params.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NoticeItem | null) => setNotice(data))
      .catch(() => setNotice(null));
  }, [params.id]);

  if (notice === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (!notice) {
    return (
      <div className="py-16 text-center text-sm text-text-faint">
        공지를 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/community" className="font-bold text-primary-dark">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/community" className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
        ← 커뮤니티로 돌아가기
      </Link>
      <Card>
        <div className="text-sm font-bold text-primary-dark">{notice.pinned ? "📌 고정 공지" : "공지"}</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{formatNoticeDate(notice.createdAt)}</div>
        <div
          className="notice-body mt-4 text-sm leading-relaxed text-text-2"
          dangerouslySetInnerHTML={{ __html: notice.body }}
        />
      </Card>
    </div>
  );
}

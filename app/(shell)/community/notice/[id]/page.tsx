"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { NOTICE_POSTS } from "../../mock";

export default function NoticeDetailPage() {
  const params = useParams<{ id: string }>();
  const notice = NOTICE_POSTS.find((n) => n.id === params.id);

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
        <div className="text-sm font-bold text-primary-dark">공지</div>
        <h1 className="mt-1 text-lg font-extrabold text-text">{notice.title}</h1>
        <div className="mt-1 text-xs text-text-faint">{notice.time}</div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-2">{notice.body}</p>
      </Card>
    </div>
  );
}

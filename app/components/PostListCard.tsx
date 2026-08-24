import Link from "next/link";
import Card from "@/app/components/ui/Card";
import { formatRelativeTime } from "@/app/(shell)/community/time";
import { stripHtml } from "@/app/(shell)/community/htmlUtils";
import type { CommunityPost } from "@/app/(shell)/community/types";

export default function PostListCard({ post }: { post: CommunityPost }) {
  return (
    <Link href={`/community/${post.id}`}>
      <Card className="cursor-pointer transition-shadow hover:shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
            {post.isNotice ? (post.pinned ? "📌 고정 공지" : "공지") : post.tag}
          </span>
          {post.cmtCount > 0 && (
            <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
              답변 완료
            </span>
          )}
        </div>
        <div className="mb-1.5 font-bold text-text">{post.title}</div>
        <div className="mb-3 line-clamp-2 text-[13px] text-text-muted">{stripHtml(post.body)}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-faint">
          <span>
            {post.authorName} · {formatRelativeTime(post.createdAt)}
          </span>
          <span>👍 {post.likeCount}</span>
          <span>💬 {post.cmtCount}</span>
          <span>👁 {post.views}</span>
        </div>
      </Card>
    </Link>
  );
}

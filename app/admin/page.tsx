import Link from "next/link";
import Card from "@/app/components/ui/Card";

const SECTIONS = [
  { href: "/admin/users", title: "사용자 관리", desc: "전체 사용자 조회, 계정 정지/해제" },
  { href: "/admin/community", title: "커뮤니티 관리", desc: "게시글/댓글 조회 및 삭제" },
  { href: "/admin/reports", title: "상담 신고", desc: "접수된 상담 신고 확인 및 처리" },
  { href: "/admin/counselors", title: "상담사 인증", desc: "등록 신청한 상담사 승인" },
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-text">관리자 대시보드</h1>
      <div className="grid grid-cols-1 gap-4 shell:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="cursor-pointer transition-shadow hover:shadow-card">
              <div className="font-bold text-text">{s.title}</div>
              <div className="mt-1 text-[13px] text-text-muted">{s.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import AuthStatus from "@/app/components/AuthStatus";

export default function TopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-[60px] items-center gap-4 border-b border-border bg-surface px-4 shell:px-8">
      <div className="flex-1 text-[18px] font-extrabold text-text">{title}</div>
      <div className="flex items-center gap-3">
        <Link
          href="/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-primary-light hover:text-primary-dark"
          title="알림"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
        <AuthStatus />
      </div>
    </header>
  );
}

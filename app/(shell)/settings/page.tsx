"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SystemStatus from "@/app/components/SystemStatus";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { apiFetch } from "@/lib/api";

function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border bg-bg px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-faint">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [auth, setAuth] = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAuth({ phase: "out" });
    router.push("/");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <SectionCard title="알림">
        <ToggleRow label="새 메시지 알림" defaultOn />
        <ToggleRow label="알림음" defaultOn />
        <ToggleRow label="채팅 알림" defaultOn />
      </SectionCard>

      <SectionCard title="개인정보">
        <ToggleRow label="닉네임 익명 표시" defaultOn />
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">대화 내용 암호화</span>
          <span className="text-xs font-bold text-success">적용 중</span>
        </div>
      </SectionCard>

      <SectionCard title="앱 정보">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">버전</span>
          <span className="text-xs text-text-muted">1.0.0 (Web)</span>
        </div>
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">백엔드 연결 상태</span>
          <SystemStatus />
        </div>
      </SectionCard>

      {auth.phase === "in" && (
        <SectionCard title="계정">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
          >
            로그아웃
          </button>
        </SectionCard>
      )}
    </div>
  );
}

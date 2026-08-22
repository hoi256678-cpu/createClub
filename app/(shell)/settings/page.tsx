"use client";

import { useRouter } from "next/navigation";
import CrisisNotice from "@/app/components/CrisisNotice";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { apiFetch } from "@/lib/api";

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      <button
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
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
  const { state: auth, setLoggedOut, updateNotificationPrefs } = useAuthStatus();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoggedOut();
      router.push("/");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      {auth.phase === "in" && (
        <SectionCard title="알림">
          <ToggleRow
            label="새 메시지 알림"
            on={auth.notificationPrefs.chatMessages}
            onChange={(v) => updateNotificationPrefs({ chatMessages: v })}
          />
          <ToggleRow
            label="신고 처리 알림"
            on={auth.notificationPrefs.systemAlerts}
            onChange={(v) => updateNotificationPrefs({ systemAlerts: v })}
          />
        </SectionCard>
      )}

      <CrisisNotice />

      <SectionCard title="앱 정보">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex-1 text-sm font-semibold text-text">버전</span>
          <span className="text-xs text-text-muted">1.0.0 (Web)</span>
        </div>
      </SectionCard>

      {auth.phase === "in" && (
        <SectionCard title="계정">
          <div className="border-b border-border">
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
            >
              로그아웃
            </button>
          </div>
          {/* Task 8: 비밀번호 변경, Task 9: 회원 탈퇴가 여기 추가됨 */}
        </SectionCard>
      )}
    </div>
  );
}

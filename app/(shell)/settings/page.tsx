"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function submitPasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("새 비밀번호가 일치하지 않아요");
      return;
    }
    const res = await apiFetch("/api/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPasswordError(data.error ?? "비밀번호 변경에 실패했어요");
      return;
    }
    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      setPasswordSuccess(false);
      setShowPasswordForm(false);
    }, 1500);
  }

  async function submitDeleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    const res = await apiFetch("/api/auth/me", {
      method: "DELETE",
      body: JSON.stringify({ password: deletePassword }),
    });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "회원 탈퇴에 실패했어요");
      return;
    }
    setLoggedOut();
    router.push("/");
  }

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
          <div className="border-b border-border">
            <button
              onClick={() => setShowPasswordForm((v) => !v)}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-text"
            >
              비밀번호 변경
            </button>
            {showPasswordForm && (
              <form onSubmit={submitPasswordChange} className="flex flex-col gap-2 px-5 pb-4">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (4자 이상)"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호 확인"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                {passwordError && <p className="text-xs font-semibold text-danger">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs font-semibold text-success">변경됐어요</p>}
                <button type="submit" className="mt-1 w-full rounded-lg bg-primary-dark py-2 text-sm font-bold text-white">
                  변경하기
                </button>
              </form>
            )}
          </div>
          <div>
            <button
              onClick={() => setShowDeleteForm((v) => !v)}
              className="flex w-full items-center px-5 py-3 text-left text-sm font-semibold text-danger"
            >
              회원 탈퇴
            </button>
            {showDeleteForm && (
              <form onSubmit={submitDeleteAccount} className="flex flex-col gap-2 px-5 pb-4">
                <p className="text-xs text-text-muted">탈퇴하면 되돌릴 수 없어요. 계정 확인을 위해 비밀번호를 입력해주세요.</p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="비밀번호"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-danger"
                />
                {deleteError && <p className="text-xs font-semibold text-danger">{deleteError}</p>}
                <button
                  type="submit"
                  disabled={deleting}
                  className="mt-1 w-full rounded-lg bg-danger py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  탈퇴하기
                </button>
              </form>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

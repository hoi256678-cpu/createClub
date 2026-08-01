"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "로그인에 실패했습니다");
        return;
      }

      router.push("/");
    } catch {
      setError("백엔드에 연결할 수 없습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col shell:flex-row">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary-darker to-primary px-8 py-16 text-center shell:flex-1">
        <div className="mb-2 text-4xl font-black text-white">솜잇 💙</div>
        <p className="max-w-xs text-sm leading-relaxed text-white/80">
          고민이 있는 청소년과
          <br />
          상담 전공 대학생을 연결하는
          <br />
          또래 상담 플랫폼
        </p>
        <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 text-[200px] opacity-10">
          🌊
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16 shell:max-w-[480px]">
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="text-2xl font-black text-text">로그인</h2>
          <p className="text-sm text-text-muted">솜잇에 오신 걸 환영해요 🌊</p>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-text-muted">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="이메일을 입력하세요"
              className="w-full rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-text-muted">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="비밀번호를 입력하세요"
              className="w-full rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
            />
          </div>

          {error && <p className="text-xs font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p className="text-center text-xs text-text-muted">
            아직 계정이 없으신가요?{" "}
            <Link href="/signup" className="font-bold text-primary-dark">
              회원가입
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

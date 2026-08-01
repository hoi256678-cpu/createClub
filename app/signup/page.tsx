"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"counselor" | "client">("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "회원가입에 실패했습니다");
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
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-surface p-8 shadow-card"
      >
        <div className="mb-1 text-2xl font-black text-text">솜잇 회원가입 💙</div>
        <p className="mb-2 text-sm text-text-muted">몇 가지만 알려주시면 바로 시작할 수 있어요</p>

        <div className="flex gap-2 rounded-xl border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => setRole("client")}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              role === "client" ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            내담자
          </button>
          <button
            type="button"
            onClick={() => setRole("counselor")}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              role === "counselor" ? "bg-primary-dark text-white" : "text-text-muted"
            }`}
          >
            상담사
          </button>
        </div>

        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />
        <input
          type="password"
          placeholder="비밀번호 (4자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className="rounded-xl border border-border px-3.5 py-3 text-sm text-text outline-none focus:border-primary-dark"
        />

        {error && <p className="text-xs font-semibold text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>

        <p className="text-center text-xs text-text-muted">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-bold text-primary-dark">
            로그인
          </Link>
        </p>
      </form>
    </main>
  );
}

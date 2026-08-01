"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-display text-3xl font-medium text-paper">회원가입</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRole("client")}
            className={`flex-1 rounded-lg border px-4 py-2 font-mono text-xs transition-colors ${
              role === "client" ? "border-accent text-paper" : "border-line text-muted"
            }`}
          >
            내담자
          </button>
          <button
            type="button"
            onClick={() => setRole("counselor")}
            className={`flex-1 rounded-lg border px-4 py-2 font-mono text-xs transition-colors ${
              role === "counselor" ? "border-accent text-paper" : "border-line text-muted"
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
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />
        <input
          type="password"
          placeholder="비밀번호 (4자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-paper outline-none focus:border-accent"
        />

        {error && <p className="font-mono text-xs text-accent">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 font-mono text-xs text-ink disabled:opacity-50"
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </form>
    </main>
  );
}

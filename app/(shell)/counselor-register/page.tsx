"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import Card from "@/app/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { ALL_TAGS, type CounselorTag } from "@/app/(shell)/counselors/mock";

type MyProfile = {
  major: string;
  year: string;
  bio: string;
  specialties: CounselorTag[];
  verified: boolean;
};

export default function CounselorRegisterPage() {
  return (
    <RequireAuth>
      {(auth) =>
        auth.role !== "counselor" ? (
          <div className="py-16 text-center text-sm text-text-faint">
            상담사 계정에서만 이용할 수 있어요.
          </div>
        ) : (
          <RegisterForm />
        )
      }
    </RequireAuth>
  );
}

function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<CounselorTag[]>([]);
  const [wasVerified, setWasVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/counselors/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MyProfile | null) => {
        if (data) {
          setMajor(data.major);
          setYear(data.year);
          setBio(data.bio);
          setSpecialties(data.specialties);
          setWasVerified(data.verified);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleTag(tag: CounselorTag) {
    setSpecialties((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/counselors/register", {
        method: "POST",
        body: JSON.stringify({ major, year, bio, specialties }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했어요");
        return;
      }
      router.push(`/counselors/${data.id}`);
    } catch {
      setError("백엔드에 연결할 수 없어요");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <h1 className="text-lg font-extrabold text-text">
          {wasVerified ? "내 상담사 프로필 수정" : "상담사 등록하기"}
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          여기서 입력한 내용이 상담사 찾기 목록과 프로필에 그대로 보여요.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-text">전공</span>
            <input
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              maxLength={60}
              placeholder="예: 상담심리학과 3학년"
              className="rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-text">학년 (선택)</span>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              maxLength={20}
              placeholder="예: 3학년"
              className="rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-text">소개글</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="어떤 고민을 함께 나누고 싶은지 편하게 적어주세요"
              className="resize-none rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-text">태그 (1개 이상)</span>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map((tag) => {
                const active = specialties.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-xl border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      active
                        ? "border-primary-dark bg-primary-light text-primary-dark"
                        : "border-border text-text-muted hover:border-primary-dark"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-primary-dark py-3 text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
          >
            {submitting ? "저장 중..." : wasVerified ? "수정하기" : "등록하고 목록에 나오기"}
          </button>
        </form>
      </Card>
    </div>
  );
}

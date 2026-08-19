"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/app/components/ui/Card";
import Rating from "@/app/components/ui/Rating";
import { isNewCounselor } from "@/lib/matching";
import { apiFetch } from "@/lib/api";
import { loginHref } from "@/app/components/RequireAuth";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { useChatRooms } from "@/app/hooks/useChatRooms";
import type { Counselor } from "../mock";

type RoomSummary = {
  id: string;
  status: "active" | "ended" | "reported";
  otherPartyId: string;
  viewerSide: "client" | "counselor";
};

export default function CounselorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const { refresh: refreshRoomList } = useChatRooms();
  const [counselor, setCounselor] = useState<Counselor | null | undefined>(undefined);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/counselors/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setCounselor(null);
          return;
        }
        setCounselor(await res.json());
      })
      .catch(() => setCounselor(null));
  }, [params.id]);

  useEffect(() => {
    if (auth.phase !== "in") return;
    apiFetch("/api/counseling/rooms")
      .then((res) => (res.ok ? res.json() : []))
      .then((rooms: RoomSummary[]) => {
        // "이미 이 상담사에게 신청한 활성 상담이 있는지"는 내가 client 쪽이고
        // 상대방이 바로 이 상담사인 방으로만 좁혀야 한다. viewerSide를 안 걸러내면
        // 상담사 계정이 이 페이지를 볼 때 자기 자신의 counselor-side 활성 방과 뒤섞인다.
        const active = rooms.find(
          (r) => r.status === "active" && r.viewerSide === "client" && r.otherPartyId === params.id,
        );
        setActiveRoomId(active ? active.id : null);
      })
      .catch(() => setActiveRoomId(null));
  }, [auth.phase, params.id]);

  async function apply() {
    if (auth.phase === "out") {
      router.push(loginHref(`/counselors/${params.id}`));
      return;
    }
    if (!counselor) return;
    setApplying(true);
    setError(null);
    try {
      const res = await apiFetch("/api/counseling/rooms", {
        method: "POST",
        body: JSON.stringify({ counselorId: counselor.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "상담 신청에 실패했어요");
        return;
      }
      router.push(`/chat/${data.id}`);
      refreshRoomList();
    } catch {
      setError("백엔드에 연결할 수 없어요");
    } finally {
      setApplying(false);
    }
  }

  if (counselor === undefined) {
    return <div className="py-16 text-center text-text-faint">불러오는 중이에요...</div>;
  }

  if (!counselor) {
    return (
      <div className="py-16 text-center text-sm text-text-faint">
        상담사를 찾을 수 없어요.
        <div className="mt-4">
          <Link href="/counselors" className="font-bold text-primary-dark">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <div className="flex gap-4">
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold"
            style={{ background: counselor.avatarBg, color: counselor.avatarColor }}
          >
            {counselor.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-text">{counselor.name}</h1>
              {counselor.online && (
                <span className="rounded-md bg-[#eafaf5] px-1.5 py-0.5 text-[10px] font-bold text-success">
                  지금 가능
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted">{counselor.major}</div>
            <div className="mt-1.5 flex items-center gap-3">
              {isNewCounselor(counselor) ? (
                <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary-dark">
                  이제 막 시작했어요
                </span>
              ) : (
                <Rating value={counselor.rating} count={counselor.reviewCount} size="md" />
              )}
              <span className="text-xs text-text-faint">상담 {counselor.sessionCount}회</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-2">{counselor.intro}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {counselor.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-primary-light px-2 py-1 text-[11px] font-bold text-primary-dark"
            >
              {t}
            </span>
          ))}
        </div>

        {activeRoomId ? (
          <Link
            href={`/chat/${activeRoomId}`}
            className="mt-5 block rounded-xl bg-primary-dark py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker"
          >
            채팅 상담으로 이동 →
          </Link>
        ) : (
          <button
            onClick={apply}
            disabled={applying}
            className="mt-5 block w-full rounded-xl bg-primary-dark py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-primary-darker disabled:opacity-50"
          >
            {applying ? "신청 중..." : counselor.online ? "지금 상담 시작하기 →" : "상담 신청하기 →"}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      </Card>
    </div>
  );
}

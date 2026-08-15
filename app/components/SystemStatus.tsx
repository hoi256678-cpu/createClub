"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type HealthState =
  | { phase: "loading" }
  | { phase: "ok"; mongoConnected: boolean }
  | { phase: "error" };

export default function SystemStatus() {
  const [state, setState] = useState<HealthState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    // apiFetch를 쓰면 프록시 경유 여부와 무관하게 같은 경로로 호출된다.
    apiFetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((data: { mongoConnected: boolean }) => {
        if (!cancelled) {
          setState({ phase: "ok", mongoConnected: data.mongoConnected });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state.phase === "loading"
      ? "연결 확인 중..."
      : state.phase === "error"
        ? "백엔드 연결 실패"
        : state.mongoConnected
          ? "백엔드 · DB 정상 연결"
          : "백엔드 연결됨 · DB 연결 안 됨";

  const dotColor =
    state.phase === "ok" && state.mongoConnected
      ? "bg-success"
      : state.phase === "loading"
        ? "bg-text-faint"
        : "bg-danger";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type HealthState =
  | { phase: "loading" }
  | { phase: "ok"; mongoConnected: boolean }
  | { phase: "error" };

export default function SystemStatus() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const [state, setState] = useState<HealthState>(
    apiUrl ? { phase: "loading" } : { phase: "error" }
  );

  useEffect(() => {
    if (!apiUrl) return;

    let cancelled = false;

    fetch(`${apiUrl}/api/health`)
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
  }, [apiUrl]);

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
      ? "bg-accent-2"
      : state.phase === "loading"
        ? "bg-muted"
        : "bg-accent";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-4 py-1.5 font-mono text-xs tracking-wide text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </div>
  );
}

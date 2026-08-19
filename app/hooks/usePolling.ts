"use client";

import { useEffect, useRef } from "react";

/**
 * intervalMs 간격으로 callback을 반복 호출한다.
 * 탭이 백그라운드로 가면 멈추고, 다시 보이면 즉시 1회 호출한 뒤 재개한다.
 * intervalMs가 null이면 폴링을 전혀 시작하지 않는다(예: 로그아웃 상태).
 */
export function usePolling(callback: () => void, intervalMs: number | null): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (intervalMs === null) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      callbackRef.current();
    }
    function start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs as number);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}

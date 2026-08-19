"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type TestRecord = {
  id: string;
  type: string;
  title: string;
  score: number;
  label: string;
  color: string;
  /** 상담 연결을 권할 만한 결과인지 */
  needsSupport: boolean;
  takenAt: string;
};

/**
 * 심리검사 결과 이력.
 *
 * 기존 구현은 결과를 화면에만 띄우고 버렸다. 그러면 사용자는
 * "그래서 나아지고 있나?"를 알 수 없고, 서비스는 재방문 이유를 잃는다.
 * 점수 추이가 보이면 검사가 일회성 콘텐츠에서 관리 도구로 바뀐다.
 */
export function useTestHistory() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/test/results")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TestRecord[]) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoaded(true));
  }, []);

  const add = useCallback(async (record: Omit<TestRecord, "id" | "takenAt">) => {
    const res = await apiFetch("/api/test/results", {
      method: "POST",
      body: JSON.stringify(record),
    });
    if (!res.ok) return;
    const saved: TestRecord = await res.json();
    setRecords((prev) => [saved, ...prev]);
  }, []);

  /** 같은 검사의 직전 점수 (추이 비교용) */
  const previousScore = useCallback(
    (type: string, excludeId?: string) => {
      const same = records.filter((r) => r.type === type && r.id !== excludeId);
      return same.length ? same[0].score : null;
    },
    [records],
  );

  return { records, loaded, add, previousScore };
}

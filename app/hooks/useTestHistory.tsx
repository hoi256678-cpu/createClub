"use client";

import { useCallback, useEffect, useState } from "react";
import { readJSON, writeJSON } from "@/lib/storage";

const KEY = "somit:test:history";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setRecords(readJSON<TestRecord[]>(KEY, []));
    setLoaded(true);
  }, []);

  const add = useCallback((record: Omit<TestRecord, "id" | "takenAt">) => {
    setRecords((prev) => {
      const next = [
        { ...record, id: `${record.type}-${Date.now()}`, takenAt: new Date().toISOString() },
        ...prev,
      ].slice(0, 50);
      writeJSON(KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecords([]);
    writeJSON(KEY, []);
  }, []);

  /** 같은 검사의 직전 점수 (추이 비교용) */
  const previousScore = useCallback(
    (type: string, excludeId?: string) => {
      const same = records.filter((r) => r.type === type && r.id !== excludeId);
      return same.length ? same[0].score : null;
    },
    [records],
  );

  return { records, loaded, add, clear, previousScore };
}

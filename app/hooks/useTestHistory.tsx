"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStatus } from "./useAuthStatus";

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

type TestHistoryContextValue = {
  records: TestRecord[];
  loaded: boolean;
  add: (record: Omit<TestRecord, "id" | "takenAt">) => Promise<void>;
  previousScore: (type: string, excludeId?: string) => number | null;
};

const TestHistoryContext = createContext<TestHistoryContextValue | null>(null);

/**
 * 심리검사 결과 이력.
 *
 * 기존 구현은 결과를 화면에만 띄우고 버렸다. 그러면 사용자는
 * "그래서 나아지고 있나?"를 알 수 없고, 서비스는 재방문 이유를 잃는다.
 * 점수 추이가 보이면 검사가 일회성 콘텐츠에서 관리 도구로 바뀐다.
 *
 * 마이페이지가 이동할 때마다 다시 마운트되므로, 기록을 페이지 로컬
 * state로 두면 매번 fetch가 끝날 때까지 "기록 없음"이 잠깐 보인다. 루트에서
 * 한 번만 마운트되는 Provider로 옮겨 페이지를 오가도 값이 유지되게 한다
 * (ChatRoomsProvider/PostCountsProvider와 동일한 패턴).
 */
export function TestHistoryProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";

  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그아웃 전환 시 이전 계정의 기록을 즉시 비운다
      setRecords([]);
      setLoaded(false);
      return;
    }
    apiFetch("/api/test/results")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TestRecord[]) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoaded(true));
  }, [isLoggedIn]);

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

  const value = useMemo(
    () => ({ records, loaded, add, previousScore }),
    [records, loaded, add, previousScore],
  );

  return <TestHistoryContext.Provider value={value}>{children}</TestHistoryContext.Provider>;
}

export function useTestHistory(): TestHistoryContextValue {
  const ctx = useContext(TestHistoryContext);
  if (!ctx) {
    throw new Error("useTestHistory must be used within a TestHistoryProvider");
  }
  return ctx;
}

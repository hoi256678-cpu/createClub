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

type PostCountsContextValue = {
  postCount: number;
  savedCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PostCountsContext = createContext<PostCountsContextValue | null>(null);

async function fetchCounts(
  setPostCount: (n: number) => void,
  setSavedCount: (n: number) => void,
  setLoading: (loading: boolean) => void,
) {
  try {
    const [postsRes, savedRes] = await Promise.all([
      apiFetch("/api/community/my-posts/count"),
      apiFetch("/api/community/my-saved-posts/count"),
    ]);
    if (postsRes.ok) setPostCount((await postsRes.json()).count);
    if (savedRes.ok) setSavedCount((await savedRes.json()).count);
  } finally {
    setLoading(false);
  }
}

/**
 * 마이페이지가 이동할 때마다 다시 마운트되므로, 개수를 페이지 로컬
 * state로 두면 매번 fetch가 끝날 때까지 0이 잠깐 보인다. 루트에서 한 번만
 * 마운트되는 Provider로 옮겨 페이지를 오가도 값이 유지되게 한다
 * (ChatRoomsProvider/NotificationsProvider와 동일한 패턴).
 */
export function PostCountsProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuthStatus();
  const isLoggedIn = auth.phase === "in";

  const [postCount, setPostCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => fetchCounts(setPostCount, setSavedCount, setLoading), []);

  useEffect(() => {
    if (!isLoggedIn) {
      // 로그아웃 상태거나 아직 인증 확인 중이면 조회하지 않는다. 로그아웃 직후엔
      // 이전 계정의 개수가 남아있지 않도록 비운다.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그아웃 전환 시 이전 개수를 즉시 비운다
      setPostCount(0);
      setSavedCount(0);
      setLoading(false);
      return;
    }
    refresh();
  }, [isLoggedIn, refresh]);

  const value = useMemo(
    () => ({ postCount, savedCount, loading, refresh }),
    [postCount, savedCount, loading, refresh],
  );

  return <PostCountsContext.Provider value={value}>{children}</PostCountsContext.Provider>;
}

export function usePostCounts(): PostCountsContextValue {
  const ctx = useContext(PostCountsContext);
  if (!ctx) {
    throw new Error("usePostCounts must be used within a PostCountsProvider");
  }
  return ctx;
}

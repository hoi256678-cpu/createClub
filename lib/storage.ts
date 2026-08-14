/**
 * localStorage 안전 래퍼.
 * SSR(서버 렌더링), 사파리 프라이빗 모드, 저장 공간 초과 등에서 예외가 나도
 * 화면 전체가 깨지지 않도록 항상 조용히 실패한다.
 *
 * 채팅/알림은 아직 목업 데이터라 서버에 읽음 상태를 저장할 곳이 없다.
 * 백엔드에 read API가 생기면 이 파일을 쓰는 곳만 교체하면 된다.
 */

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시한다 (읽음 표시는 부가 기능이므로 앱을 막으면 안 된다)
  }
}

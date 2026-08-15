/**
 * 백엔드 호출 래퍼.
 *
 * 기본값은 same-origin(빈 문자열)이다. next.config.ts의 rewrites가 /api/* 를
 * 백엔드로 중계하므로, 브라우저는 항상 프론트엔드 도메인으로만 요청을 보낸다.
 * 덕분에 인증 쿠키가 퍼스트파티 쿠키가 되어 iOS Safari의 서드파티 쿠키 차단을 피한다.
 *
 * NEXT_PUBLIC_API_URL을 설정하면 예전처럼 백엔드로 직접 요청한다(로컬 디버깅용).
 * 단, 그 경우 iOS Safari에서는 로그인이 유지되지 않는다.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

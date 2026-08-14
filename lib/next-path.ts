/**
 * ?next= 파라미터 정리.
 *
 * 로그인 후 이동할 경로는 사용자가 URL로 직접 조작할 수 있으므로 그대로 믿으면 안 된다.
 * - "//evil.com", "https://evil.com" → 외부 사이트로 튕기는 오픈 리다이렉트
 * - "javascript:..."                 → router.push에 넣으면 스크립트가 실행됨
 * 따라서 "/"로 시작하고 "//"로는 시작하지 않는 내부 경로만 허용한다.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  // 로그인 페이지로 되돌아가는 순환을 막는다.
  if (raw === "/login" || raw.startsWith("/login?")) return fallback;
  if (raw === "/signup" || raw.startsWith("/signup?")) return fallback;
  return raw;
}

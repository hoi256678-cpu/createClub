import type { NextConfig } from "next";

/**
 * 백엔드 주소. 브라우저에 노출되지 않는 서버 전용 값이므로 NEXT_PUBLIC_ 접두사를 쓰지 않는다.
 * (Vercel 환경변수에 BACKEND_URL=https://createclub-production.up.railway.app 설정)
 */
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!BACKEND_URL) return [];
    // /api/* 요청을 프론트엔드 도메인에서 받아 백엔드로 중계한다.
    //
    // 이렇게 하지 않으면 브라우저 입장에서 Vercel(create-club.vercel.app)과
    // Railway(...up.railway.app)는 서로 다른 사이트라 인증 쿠키가 서드파티 쿠키가 된다.
    // iOS Safari는 서드파티 쿠키를 기본 차단하므로 로그인이 유지되지 않는다.
    // 프록시를 거치면 쿠키가 프론트엔드 도메인의 퍼스트파티 쿠키가 되어 모든 브라우저에서 동작한다.
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;

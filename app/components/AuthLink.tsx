"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import { loginHref } from "@/app/components/RequireAuth";

/**
 * 로그인이 필요한 곳으로 가는 링크.
 * 비로그인 상태면 조용히 홈으로 튕기는 대신 /login?next=... 으로 보내고,
 * 로그인 후 원래 가려던 화면으로 되돌려준다.
 */
export default function AuthLink({
  href,
  requiresAuth = true,
  className,
  onClick,
  children,
  ...rest
}: {
  href: string;
  requiresAuth?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "onClick" | "children">) {
  const { state } = useAuthStatus();
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (requiresAuth && state.phase === "out") {
      e.preventDefault();
      router.push(loginHref(href));
    }
    // phase === "loading"이면 그대로 이동시킨다.
    // 목적지의 RequireAuth가 로딩 표시를 보여준 뒤 알아서 처리한다.
  }

  return (
    <Link href={href} onClick={handleClick} className={className} {...rest}>
      {children}
    </Link>
  );
}

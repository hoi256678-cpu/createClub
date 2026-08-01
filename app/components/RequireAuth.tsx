"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStatus, type AuthState } from "@/app/hooks/useAuthStatus";

type LoggedInState = Extract<AuthState, { phase: "in" }>;

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode | ((auth: LoggedInState) => React.ReactNode);
}) {
  const [state] = useAuthStatus();
  const router = useRouter();

  useEffect(() => {
    if (state.phase === "out") router.push("/login");
  }, [state, router]);

  if (state.phase !== "in") return null;
  return <>{typeof children === "function" ? children(state) : children}</>;
}

"use client";

import { useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { GUEST_UPGRADE_REASON } from "@/lib/access";
import { useAuthStatus } from "@/app/hooks/useAuthStatus";
import PostForm from "../PostForm";

export default function CommunityWritePage() {
  // 글을 다 쓴 뒤 제출 순간에 튕기지 않도록 진입 시점에 막는다.
  return (
    <RequireAuth reason={GUEST_UPGRADE_REASON.communityWrite}>
      <CommunityWriteContent />
    </RequireAuth>
  );
}

function CommunityWriteContent() {
  const router = useRouter();
  const { state: auth } = useAuthStatus();
  const isAdmin = auth.phase === "in" && auth.role === "admin";

  return <PostForm isAdmin={isAdmin} onSuccess={(id) => router.push(`/community/${id}`)} />;
}

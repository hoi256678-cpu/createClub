"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { pageTitle } from "./nav-items";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);
  // 채팅방 상세는 자체 입력창이 키보드 바로 위에 붙어야 해서(카카오톡 스타일),
  // 모바일 하단 탭바를 위한 고정 공간을 남겨두지 않는다 — 그 공간이 남아있으면
  // 키보드가 올라왔을 때 입력창과 키보드 사이에 탭바가 끼어 보인다.
  const isChatRoom = pathname.startsWith("/chat/");

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar pathname={pathname} />
      <div className="flex flex-1 flex-col shell:ml-[260px]">
        <TopBar title={title} />
        <main
          className={`flex-1 px-4 pt-6 shell:px-8 shell:pb-12 ${
            isChatRoom ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"
          }`}
        >
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
      {!isChatRoom && <BottomNav pathname={pathname} />}
    </div>
  );
}

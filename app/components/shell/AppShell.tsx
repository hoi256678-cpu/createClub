"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { pageTitle } from "./nav-items";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar pathname={pathname} />
      <div className="flex flex-1 flex-col shell:ml-[260px]">
        <TopBar title={title} />
        <main className="flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 shell:px-8 shell:pb-12">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
      <BottomNav pathname={pathname} />
    </div>
  );
}

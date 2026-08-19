import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/app/hooks/useAuthStatus";
import { NotificationsProvider } from "@/app/hooks/useNotifications";
import { ChatRoomsProvider } from "@/app/hooks/useChatRooms";
import { PostCountsProvider } from "@/app/hooks/usePostCounts";
import { TestHistoryProvider } from "@/app/hooks/useTestHistory";

const suit = localFont({
  src: [
    { path: "../public/fonts/SUIT-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/SUIT-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/SUIT-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/SUIT-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/SUIT-ExtraBold.woff2", weight: "800", style: "normal" },
    { path: "../public/fonts/SUIT-Heavy.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-suit",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iPhone 노치/홈 인디케이터 영역까지 그린 뒤, safe-area-inset으로 여백을 직접 준다.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "솜잇",
  description: "고민이 있는 청소년과 상담 전공 대학생을 연결하는 또래 상담 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${suit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-text-2">
        <AuthProvider>
          <ChatRoomsProvider>
            <NotificationsProvider>
              <PostCountsProvider>
                <TestHistoryProvider>{children}</TestHistoryProvider>
              </PostCountsProvider>
            </NotificationsProvider>
          </ChatRoomsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

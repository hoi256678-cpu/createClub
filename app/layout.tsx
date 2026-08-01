import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
      <body className="flex min-h-full flex-col bg-bg text-text-2">{children}</body>
    </html>
  );
}

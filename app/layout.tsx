import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "系规练习簿",
  description: "随时开始、边学边练的系统规划与管理师备考练习簿。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

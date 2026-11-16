import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "四级点词阅读器",
  description: "导入四级阅读，点击生词即可高亮、保存并同步给AI。",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}

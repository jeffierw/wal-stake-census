import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WAL 质押分布",
  description: "按地址统计 Walrus 主网 StakedWal 本金分布",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

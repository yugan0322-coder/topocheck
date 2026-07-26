import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TopoCheck — 3D 拓扑评测",
  description: "使用真实几何算法检测 3D 模型面数、顶点数与狭长坏面。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

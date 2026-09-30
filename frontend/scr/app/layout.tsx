import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "SINDARIS Terminal",
  description: "Sandalis-Web v2.0 — клановый инструмент Foxhole",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
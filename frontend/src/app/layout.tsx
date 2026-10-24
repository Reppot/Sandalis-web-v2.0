import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Russo_One } from "next/font/google";
import "@/app/globals.css";
import { AppProviders } from "@/app/providers";
import { THEME_INIT_SCRIPT } from "@/shared";

const display = Russo_One({ variable: "--font-russo", subsets: ["cyrillic", "latin"], display: "swap", weight: "400" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["cyrillic", "latin"], display: "swap", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "SINDARIS Терминал — Logistics Overwatch",
  description: "Тактический логистический терминал клана SINDARIS для Foxhole: заказы, склады, таймеры деспавна.",
  icons: { icon: "/api/v1/assets/brand/clan-logo.png" },
  authors: [{ name: "Reppot / SINDARIS" }],
  creator: "Reppot / SINDARIS",
  other: { copyright: "© 2026 Reppot / SINDARIS. All rights reserved." },
};

export const viewport: Viewport = {
  themeColor: "#090d0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${mono.variable}`}>
      <head>
        {/* тема до первой отрисовки — без мерцания */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SINDARIS Terminal",
  description: "Инструменты клана: заказы, склады, таймеры, коды.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

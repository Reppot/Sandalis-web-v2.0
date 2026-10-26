import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono, Russo_One } from "next/font/google";
import "@/app/globals.css";
import { AppProviders } from "@/app/providers";
import { THEME_INIT_SCRIPT } from "@/shared";

// Inter — текст интерфейса, Inter Tight — заголовки, Russo One — только логотип SINDARIS
const inter = Inter({ variable: "--font-inter", subsets: ["cyrillic", "latin"], display: "swap" });
const grotesk = Inter_Tight({ variable: "--font-grotesk", subsets: ["cyrillic", "latin"], display: "swap", weight: ["500", "600", "700"] });
const display = Russo_One({ variable: "--font-russo", subsets: ["cyrillic", "latin"], display: "swap", weight: "400", preload: false });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["cyrillic", "latin"], display: "swap", weight: ["400", "600"], preload: false });

// адрес сайта для canonical / sitemap / Open Graph (переопределяется SITE_URL при сборке)
const SITE_URL = (process.env.SITE_URL || "https://sandalis-web-v2-0.onrender.com").replace(/\/$/, "");
const TITLE = "SINDARIS Терминал — логистика клана в Foxhole";
const DESCRIPTION =
  "Логистический терминал клана SINDARIS для Foxhole: заказы и пирамида снабжения, склады и таймеры деспавна, база кодов, калькуляторы MPF, фабрик и производства.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — SINDARIS" },
  description: DESCRIPTION,
  applicationName: "SINDARIS Терминал",
  keywords: ["Foxhole", "SINDARIS", "Сандалис", "логистика Foxhole", "калькулятор Foxhole", "MPF", "склады Foxhole", "таймер деспавна", "Foxhole logistics", "Foxhole calculator", "клан Foxhole"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "SINDARIS Терминал",
    title: TITLE,
    description: DESCRIPTION,
    locale: "ru_RU",
    images: [{ url: "/api/v1/assets/brand/clan-logo.png", alt: "SINDARIS" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/api/v1/assets/brand/clan-logo.png"] },
  // коды подтверждения из Google Search Console и Яндекс.Вебмастера (переменные окружения при сборке)
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
  icons: { icon: "/api/v1/assets/brand/clan-logo.png" },
  authors: [{ name: "Reppot / SINDARIS" }],
  creator: "Reppot / SINDARIS",
  other: { copyright: "© 2026 Reppot / SINDARIS. All rights reserved." },
};

// структурированные данные для поисковиков (schema.org WebApplication)
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SINDARIS Терминал",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "GameApplication",
  operatingSystem: "Any",
  inLanguage: ["ru", "en", "cs"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "Reppot" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c0b" },
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${grotesk.variable} ${display.variable} ${mono.variable}`}>
      <head>
        {/* тема до первой отрисовки — без мерцания */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {/* терминал рисуется на клиенте — краткое описание в HTML для поисковиков и экранных читалок */}
        <header className="sr-only">
          <h1>SINDARIS Терминал — логистический терминал клана для Foxhole</h1>
          <p>{DESCRIPTION}</p>
        </header>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

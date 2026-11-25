import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { AppProviders } from "@/app/providers";
import { THEME_INIT_SCRIPT } from "@/shared";

// Шрифты лежат в npm-пакетах и попадают в сборку: без запросов к Google Fonts при сборке на Render.
// Inter — текст интерфейса, Inter Tight — заголовки, JetBrains Mono — коды и числа, Russo One — логотип.
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/russo-one/cyrillic-400.css";
import "@fontsource/russo-one/latin-400.css";

// адрес сайта для canonical / sitemap / Open Graph (переопределяется SITE_URL при сборке)
const SITE_URL = (process.env.SITE_URL || "https://sandalis-web-v2-0.onrender.com").replace(/\/$/, "");
const TITLE = "Chronomancer — Foxhole Logi";
const DESCRIPTION =
  "Инструменты логистики Foxhole: склады, заказы, база кодов и калькуляторы производства. Десктоп-компаньон Chronomancer локально сканирует MapData.sav на компьютере игрока.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — Chronomancer" },
  description: DESCRIPTION,
  applicationName: "Chronomancer — Foxhole Logi",
  keywords: ["Foxhole logistics", "Foxhole logi", "Foxhole stockpiles", "Foxhole stockpile scanner", "MapData.sav", "логистика Foxhole", "склады Foxhole", "калькулятор Foxhole", "MPF"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Chronomancer — Foxhole Logi",
    title: TITLE,
    description: DESCRIPTION,
    locale: "ru_RU",
    images: [{ url: "/chronomancer-icon.png", alt: "Chronomancer — Foxhole Logi" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/chronomancer-icon.png"] },
  // коды подтверждения из Google Search Console и Яндекс.Вебмастера (переменные окружения при сборке)
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
  icons: { icon: "/chronomancer-mark.svg" },
  manifest: "/manifest.webmanifest",
  authors: [{ name: "Reppot" }],
  creator: "Reppot",
  other: { copyright: "© 2026 Reppot. All rights reserved." },
};

// структурированные данные для поисковиков (schema.org WebApplication)
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Chronomancer — Foxhole Logi",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  featureList: ["Foxhole stockpile and clan logistics tools", "Local MapData.sav stockpile scanner for Windows"],
  operatingSystem: "Any",
  inLanguage: ["ru", "en", "uk", "de", "pl", "fr", "es", "pt-BR", "cs", "zh-CN"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "Reppot" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b090a" },
    { media: "(prefers-color-scheme: light)", color: "#f5f0f1" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* тема до первой отрисовки — без мерцания */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {/* терминал рисуется на клиенте — краткое описание в HTML для поисковиков и экранных читалок */}
        <header className="sr-only">
          <h1>Chronomancer — Foxhole Logi: инструменты логистики и локальный сканер складов</h1>
          <p>{DESCRIPTION}</p>
        </header>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

import type { NextConfig } from "next";
import path from "path";

// Бэкенд живёт за прокси того же origin: браузер видит только фронтовый домен,
// поэтому сессионная кука first-party (SameSite=Lax), а CORS не нужен.
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // значок Next в углу не нужен (и не должен попадать в скриншоты руководства)
  devIndicators: false,
  // самодостаточный server.js для Docker-образа (Dockerfile в корне репозитория)
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
  experimental: {
    // Render free-tier просыпается до ~60 с — дефолтных 30 с прокси не хватает
    proxyTimeout: 120_000,
  },
  // базовые заголовки безопасности для страниц и проксируемого API (CSP пока нет:
  // нужен отдельный проход по inline-стилям и внешним картинкам)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

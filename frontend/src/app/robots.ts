import type { MetadataRoute } from "next";

const SITE_URL = (process.env.SITE_URL || "https://sandalis-web-v2-0.onrender.com").replace(/\/$/, "");

/** /robots.txt: сайт открыт для индексации, API — нет (кроме картинок). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/v1/assets/"], disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

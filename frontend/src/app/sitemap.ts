import type { MetadataRoute } from "next";

const SITE_URL = (process.env.SITE_URL || "https://sandalis-web-v2-0.onrender.com").replace(/\/$/, "");

/** /sitemap.xml: терминал — одна страница с вкладками, поэтому в карте только главная. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}

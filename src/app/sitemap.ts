import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://yoinkify.com";

  return [
    { url: base, lastModified: new Date(), priority: 1.0 },
    { url: `${base}/app`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/search`, lastModified: new Date(), priority: 0.8 },
    { url: `${base}/how`, lastModified: new Date(), priority: 0.7 },
    { url: `${base}/players`, lastModified: new Date(), priority: 0.6 },
    { url: `${base}/extras`, lastModified: new Date(), priority: 0.5 },
    { url: `${base}/roadmap`, lastModified: new Date(), priority: 0.4 },
    { url: `${base}/feedback`, lastModified: new Date(), priority: 0.4 },
    { url: `${base}/status`, lastModified: new Date(), priority: 0.3 },
    { url: `${base}/legal`, lastModified: new Date(), priority: 0.2 },
    { url: `${base}/tldr`, lastModified: new Date(), priority: 0.2 },
    { url: `${base}/terms`, lastModified: new Date(), priority: 0.2 },
    { url: `${base}/privacy`, lastModified: new Date(), priority: 0.2 },
  ];
}

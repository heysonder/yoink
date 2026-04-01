import { NextRequest } from "next/server";

const SITE_HOSTS = [
  "yoink.fun",
  "www.yoink.fun",
  "localhost",
  "127.0.0.1",
];

/**
 * Determine if a request came from the site or an external API consumer.
 * Returns "site" or "api".
 */
export function getRequestSource(request: NextRequest): "site" | "api" {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    try {
      const host = new URL(origin).hostname;
      if (SITE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "site";
    } catch {}
  }

  if (referer) {
    try {
      const host = new URL(referer).hostname;
      if (SITE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "site";
    } catch {}
  }

  return "api";
}

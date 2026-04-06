import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("cf-connecting-ip")
    || "unknown";
}

export function anonymizeIp(ip: string): string {
  if (!ip || ip === "unknown") return "anon-unknown";

  const salt = process.env.LOG_ANONYMIZATION_SALT || "yoink-request-logs";
  return `anon-${createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 12)}`;
}

export function getRequestLogId(request: NextRequest): string {
  return anonymizeIp(getClientIp(request));
}

export function summarizeUrlForLogs(value: string): string {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 4)
      .join("/");
    return `${parsed.hostname}${path ? `/${path}` : ""}`;
  } catch {
    return "invalid-url";
  }
}

export function summarizeTextForLogs(value: string, maxLength = 80): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return "empty";
  return collapsed.length <= maxLength
    ? collapsed
    : `${collapsed.slice(0, maxLength - 3)}...`;
}

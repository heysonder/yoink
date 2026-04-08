import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRequestLogId(request: NextRequest): string {
  return `req-${randomBytes(4).toString("hex")}`;
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

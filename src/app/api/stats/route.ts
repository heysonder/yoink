import { NextResponse } from "next/server";
import { getDownloadCount } from "@/lib/counter";

export async function GET() {
  const count = await getDownloadCount();
  return NextResponse.json({ downloads: count }, {
    headers: { "Cache-Control": "no-cache" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { detectPlatform } from "@/lib/spotify";
import { rateLimit } from "@/lib/ratelimit";
import { resolveTrack, getCached } from "@/lib/resolve-track";
import { getRequestSource } from "@/lib/request-source";
import { buildEnvelopeMetadata, packEnvelope } from "@/lib/envelope";
import { getClientIp, getRequestLogId, summarizeUrlForLogs } from "@/lib/request-privacy";
import { verifyProofOfWork } from "@/lib/proof-of-work-verify";
import { prepareTrackAssets } from "@/lib/track-prep";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const logId = getRequestLogId(request);

  try {
    const ip = getClientIp(request);
    const source = getRequestSource(request);
    const { allowed, retryAfter } = rateLimit(`dl:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { pow } = body;
    if (pow && !verifyProofOfWork(pow)) {
      return NextResponse.json({ error: "verification failed — please try again" }, { status: 403 });
    }
    const url = body.url;
    const requestedFormat = body.format as string | undefined;
    const genreSource = body.genreSource as string | undefined;
    const syncedLyrics = body.syncedLyrics === true;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.log(
      `[prepare] [${source}] ${logId} → ${summarizeUrlForLogs(url)}${requestedFormat ? ` (${requestedFormat})` : ""}`
    );

    const platform = detectPlatform(url);
    if (!platform) {
      return NextResponse.json(
        { error: "paste a spotify, apple music, or youtube link" },
        { status: 400 }
      );
    }

    // Use cached metadata from /api/metadata if available (same art + info the card showed)
    const cached = getCached(url);
    let track;
    if (cached) {
      track = cached;
    } else {
      const resolved = await resolveTrack(url);
      if (!resolved) {
        return NextResponse.json(
          { error: "couldn't find this track — try a different link" },
          { status: 404 }
        );
      }
      track = resolved.track;
    }

    const { audio, artBuffer, catalogIds, embeddedLyrics } = await prepareTrackAssets(track, {
      requestedFormat,
      genreSource,
      syncedLyrics,
    });

    const metadata = buildEnvelopeMetadata(track, audio, embeddedLyrics, catalogIds);
    const envelope = packEnvelope(metadata, audio.buffer, artBuffer);

    return new NextResponse(new Uint8Array(envelope), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": envelope.length.toString(),
        "X-Audio-Source": audio.source,
        "X-Audio-Format": audio.format,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prepare failed";
    return NextResponse.json({ error: message, requestId: logId }, { status: 500 });
  }
}

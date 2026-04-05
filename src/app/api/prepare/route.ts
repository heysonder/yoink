import { NextRequest, NextResponse } from "next/server";
import { detectPlatform } from "@/lib/spotify";
import { lookupItunesGenre, lookupItunesCatalogIds } from "@/lib/itunes";
import { fetchBestAudio } from "@/lib/audio-sources";
import { fetchLyrics } from "@/lib/lyrics";
import { rateLimit } from "@/lib/ratelimit";
import { resolveTrack, getCached } from "@/lib/resolve-track";
import { getRequestSource } from "@/lib/request-source";
import { buildEnvelopeMetadata, packEnvelope } from "@/lib/envelope";

const ALLOWED_ART_HOSTS = [
  "i.scdn.co",
  "mosaic.scdn.co",
  "image-cdn-ak.spotifycdn.com",
  "image-cdn-fa.spotifycdn.com",
  "mzstatic.com",
  "resources.tidal.com",
  "e-cdns-images.dzcdn.net",
  "cdns-images.dzcdn.net",
];

function isAllowedUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    return allowedHosts.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const source = getRequestSource(request);
    const { allowed, retryAfter } = rateLimit(`dl:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const url = body.url;
    const requestedFormat = body.format as string | undefined;
    const genreSource = body.genreSource as string | undefined;
    const syncedLyrics = body.syncedLyrics === true;
    const preferLossless = requestedFormat === "flac" || requestedFormat === "alac";

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.log(`[prepare] [${source}] ${ip} → ${url}${requestedFormat ? ` (${requestedFormat})` : ""}`);

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

    if (genreSource === "itunes") {
      const itunesGenre = await lookupItunesGenre(track);
      if (itunesGenre) track.genre = itunesGenre;
    }

    const [audio, lyrics, catalogIds] = await Promise.all([
      fetchBestAudio(track, preferLossless),
      fetchLyrics(track.artist, track.name),
      lookupItunesCatalogIds(track),
    ]);

    let artBuffer: Buffer | null = null;
    if (track.albumArt && isAllowedUrl(track.albumArt, ALLOWED_ART_HOSTS)) {
      try {
        const artRes = await fetch(track.albumArt);
        if (artRes.ok) {
          artBuffer = Buffer.from(await artRes.arrayBuffer());
        }
      } catch {
        // Skip album art on failure
      }
    }

    const plainLyrics = lyrics
      ? (syncedLyrics ? lyrics : lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim())
      : null;

    const metadata = buildEnvelopeMetadata(track, audio, plainLyrics, catalogIds);
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

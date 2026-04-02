import { NextRequest, NextResponse } from "next/server";
import { getPlaylistInfo, getAlbumInfo, getArtistTopTracks, detectUrlType, type TrackInfo, type PlaylistInfo } from "@/lib/spotify";
import { lookupItunesCatalogIds } from "@/lib/itunes";
import { fetchBestAudio } from "@/lib/audio-sources";
import { fetchLyrics } from "@/lib/lyrics";
import { rateLimit } from "@/lib/ratelimit";
import { resolvePlaylist, resolveAlbum, resolveSpotifyTrack, searchDeezerStructured } from "@/lib/resolve-track";
import { getRequestSource } from "@/lib/request-source";
import { buildEnvelopeMetadata, packEnvelope } from "@/lib/envelope";

export const maxDuration = 300;

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

function stripTimestamps(lyrics: string): string {
  // Remove LRC-style timestamps like [00:12.34] or [00:12]
  return lyrics.replace(/\[\d{2}:\d{2}(?:\.\d+)?\]/g, "").trim();
}

async function prepareTrack(track: TrackInfo): Promise<Buffer> {
  const [audio, lyricsRaw, catalogIds] = await Promise.all([
    fetchBestAudio(track, false),
    fetchLyrics(track.artist, track.name),
    lookupItunesCatalogIds(track),
  ]);

  let artBuffer: Buffer | undefined;
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

  const lyrics = lyricsRaw ? stripTimestamps(lyricsRaw) : undefined;

  const metadata = buildEnvelopeMetadata(track, audio, catalogIds ?? undefined, lyrics);

  return packEnvelope(metadata, audio.buffer, artBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const source = getRequestSource(request);
    const { allowed, retryAfter } = rateLimit(`prepare-playlist:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { url } = body;

    console.log(`[prepare-playlist] [${source}] ${ip} → ${url}`);

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const MAX_TRACKS = 200;

    const urlType = detectUrlType(url);
    let playlist: PlaylistInfo | null = null;

    if (urlType === "album") {
      try { playlist = await getAlbumInfo(url); } catch (e) {
        console.log("[prepare-playlist] album API failed:", e instanceof Error ? e.message : e);
        playlist = await resolveAlbum(url);
      }
    } else if (urlType === "artist") {
      try { playlist = await getArtistTopTracks(url); } catch (e) {
        console.log("[prepare-playlist] artist API failed:", e instanceof Error ? e.message : e);
        // No embed fallback for artists
      }
    } else {
      try { playlist = await getPlaylistInfo(url); } catch (e) {
        console.log("[prepare-playlist] playlist API failed:", e instanceof Error ? e.message : e);
        playlist = await resolvePlaylist(url);
      }
    }

    if (!playlist) {
      return NextResponse.json({ error: "couldn't load this — Spotify API may require premium" }, { status: 503 });
    }

    // Enrich embed-scraped tracks (no ISRC/albumArt) with Deezer/iTunes metadata
    const needsEnrichment = playlist.tracks.some(t => !t.isrc && !t.albumArt);
    if (needsEnrichment) {
      console.log("[prepare-playlist] enriching", playlist.tracks.length, "scraped tracks with metadata");
      const enriched = await Promise.all(
        playlist.tracks.map(async (track) => {
          if (track.isrc && track.albumArt) return track;
          try {
            if (track.spotifyUrl) {
              const resolved = await resolveSpotifyTrack(track.spotifyUrl);
              if (resolved) return { ...resolved, spotifyUrl: track.spotifyUrl };
            }
            const dz = await searchDeezerStructured(track.name, track.artist);
            if (dz) return { ...dz, spotifyUrl: track.spotifyUrl };
          } catch { /* keep original */ }
          return track;
        })
      );
      playlist.tracks = enriched;
    }

    if (!playlist.tracks.length) {
      return NextResponse.json({ error: "Playlist has no tracks" }, { status: 400 });
    }
    if (playlist.tracks.length > MAX_TRACKS) {
      return NextResponse.json(
        { error: `playlist too large — max ${MAX_TRACKS} tracks on free tier` },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        send({ type: "start", total: playlist!.tracks.length });

        const CONCURRENCY = 2;
        const MAX_RETRIES = 2;

        const prepareWithRetry = async (track: typeof playlist!.tracks[0], index: number): Promise<Buffer> => {
          let lastError: unknown;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              return await prepareTrack(track);
            } catch (err) {
              lastError = err;
              if (attempt < MAX_RETRIES) {
                console.log(`[prepare-playlist] track ${index} attempt ${attempt + 1} failed, retrying...`);
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
          }
          throw lastError;
        };

        for (let i = 0; i < playlist!.tracks.length; i += CONCURRENCY) {
          const batch = playlist!.tracks.slice(i, i + CONCURRENCY);
          const batchIndices = batch.map((_, j) => i + j);

          send({ type: "batch", indices: batchIndices });

          const batchResults = await Promise.allSettled(
            batch.map((track, j) => prepareWithRetry(track, i + j))
          );

          for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const trackIndex = i + j;
            if (result.status === "fulfilled") {
              const envelope = result.value;
              send({ type: "track", index: trackIndex, size: envelope.length });
              controller.enqueue(envelope);
            } else {
              send({ type: "error", index: trackIndex });
              console.error(`[prepare-playlist] track ${trackIndex} failed after ${MAX_RETRIES + 1} attempts:`, result.reason);
            }
          }
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Content-Type": "playlist-envelope-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playlist preparation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

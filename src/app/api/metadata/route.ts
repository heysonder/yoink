import { NextRequest, NextResponse } from "next/server";
import { getPlaylistInfo, getAlbumInfo, getArtistTopTracks, detectUrlType, detectPlatform, type TrackInfo } from "@/lib/spotify";
import { lookupTidalVideoCover } from "@/lib/tidal";
import { resolveTrack, resolvePlaylist, resolveAlbum, getCached, setCache } from "@/lib/resolve-track";
import { rateLimit } from "@/lib/ratelimit";
import { getRequestSource } from "@/lib/request-source";
import { getClientIp, getRequestLogId, summarizeUrlForLogs } from "@/lib/request-privacy";
import { verifyProofOfWork } from "@/lib/proof-of-work-verify";

async function enrichWithVideoCover(track: TrackInfo): Promise<TrackInfo> {
  try {
    const videoCover = await lookupTidalVideoCover(track);
    if (videoCover) track.videoCover = videoCover;
  } catch {
    // Never block metadata response
  }
  return track;
}

export async function POST(request: NextRequest) {
  const logId = getRequestLogId(request);

  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(`meta:${ip}`, 10, 60_000);
    if (!allowed) {
      console.log("[ratelimit] metadata blocked:", logId);
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const source = getRequestSource(request);
    const body = await request.json();
    const { url, pow } = body;

    // Verify proof-of-work
    if (pow && !verifyProofOfWork(pow)) {
      return NextResponse.json({ error: "verification failed — please try again" }, { status: 403 });
    }

    console.log(
      `[metadata] [${source}] ${logId} → ${typeof url === "string" ? summarizeUrlForLogs(url) : "invalid"}`
    );

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Check cache
    const cached = getCached(url);
    if (cached) {
      console.log("[metadata] cache hit:", cached.artist, "-", cached.name);
      return NextResponse.json({ type: "track", ...cached });
    }

    const platform = detectPlatform(url);

    if (!platform) {
      return NextResponse.json(
        { error: "paste a spotify, apple music, or youtube link" },
        { status: 400 }
      );
    }

    // Playlists, albums, artists — Spotify API with embed scraping fallback
    if (platform === "spotify") {
      const urlType = detectUrlType(url);

      if (urlType === "playlist") {
        try {
          const playlist = await getPlaylistInfo(url);
          return NextResponse.json({ type: "playlist", ...playlist });
        } catch (e) {
          console.log("[metadata] Spotify playlist API failed:", e instanceof Error ? e.message : e);
          // Fallback: scrape the embed page
          const scraped = await resolvePlaylist(url);
          if (scraped) {
            return NextResponse.json({ type: "playlist", ...scraped });
          }
          return NextResponse.json({ error: "couldn't load playlist — try again later" }, { status: 503 });
        }
      }

      if (urlType === "album") {
        try {
          const album = await getAlbumInfo(url);
          return NextResponse.json({ type: "playlist", ...album });
        } catch (e) {
          console.log("[metadata] Spotify album API failed:", e instanceof Error ? e.message : e);
          const scraped = await resolveAlbum(url);
          if (scraped) {
            return NextResponse.json({ type: "playlist", ...scraped });
          }
          return NextResponse.json({ error: "couldn't load album — try again later" }, { status: 503 });
        }
      }

      if (urlType === "artist") {
        try {
          const artist = await getArtistTopTracks(url);
          return NextResponse.json({ type: "playlist", ...artist });
        } catch (e) {
          console.log("[metadata] Spotify artist API failed:", e instanceof Error ? e.message : e);
          // No embed scraping fallback for artist pages
          return NextResponse.json({ error: "couldn't load artist — Spotify API requires premium" }, { status: 503 });
        }
      }

      if (!urlType) {
        return NextResponse.json(
          { error: "paste a track, playlist, album, or artist link" },
          { status: 400 }
        );
      }
    }

    // Single track — all platforms (Spotify track, Apple Music, YouTube)
    const result = await resolveTrack(url);
    if (result) {
      const enriched = await enrichWithVideoCover(result.track);
      setCache(url, enriched);
      const extra: Record<string, string> = {};
      if (result.youtubeVideoId) {
        extra._youtubeId = result.youtubeVideoId;
        extra._originalPlatform = "youtube";
      }
      return NextResponse.json({ type: "track", ...enriched, ...extra });
    }

    return NextResponse.json(
      { error: "couldn't find this track — try a different link" },
      { status: 404 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch info";
    return NextResponse.json({ error: message, requestId: logId }, { status: 500 });
  }
}

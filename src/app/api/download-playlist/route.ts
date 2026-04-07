import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, unlink, mkdtemp, rmdir, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { zipSync } from "fflate";
import { getPlaylistInfo, getAlbumInfo, getArtistTopTracks, detectUrlType, type TrackInfo, type PlaylistInfo } from "@/lib/spotify";
import { lookupItunesGenre, lookupItunesCatalogIds } from "@/lib/itunes";
import { fetchBestAudio } from "@/lib/audio-sources";
import { fetchLyrics } from "@/lib/lyrics";
import { rateLimit } from "@/lib/ratelimit";
import { incrementDownloads } from "@/lib/counter";
import { setExplicitTag } from "@/lib/mp4-advisory";
import { ffmpegSemaphore } from "@/lib/semaphore";
import { setCatalogIds } from "@/lib/mp4-catalog";
import { resolvePlaylist, resolveAlbum, resolveArtist, resolveSpotifyTrack, searchDeezerStructured } from "@/lib/resolve-track";
import { getRequestSource } from "@/lib/request-source";
import { getClientIp, getRequestLogId, summarizeUrlForLogs } from "@/lib/request-privacy";

const execFileAsync = promisify(execFile);

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

async function processTrack(
  track: TrackInfo,
  requestedFormat: string | undefined,
  genreSource?: string,
  syncedLyrics?: boolean,
): Promise<{ filename: string; buffer: Buffer }> {
  const preferLossless = requestedFormat === "flac" || requestedFormat === "alac";

  // Override genre with iTunes if requested
  if (genreSource === "itunes") {
    const itunesGenre = await lookupItunesGenre(track);
    if (itunesGenre) track.genre = itunesGenre;
  }

  const [audio, lyrics, catalogIds] = await Promise.all([
    fetchBestAudio(track, preferLossless),
    fetchLyrics(track.artist, track.name),
    lookupItunesCatalogIds(track),
  ]);

  // Only allow lossless output if source audio is actually lossless (FLAC from Deezer or Tidal)
  const canLossless = preferLossless && (audio.source === "deezer" || audio.source === "tidal") && audio.format === "flac";
  const wantAlac = canLossless && requestedFormat === "alac";
  const wantFlac = canLossless && requestedFormat === "flac";

  const tempDir = await mkdtemp(join(tmpdir(), "dl-"));
  try {
    const inputExt = audio.format === "webm" ? "webm" : audio.format === "flac" ? "flac" : "mp3";
    const inputPath = join(tempDir, `input.${inputExt}`);
    const outputExt = wantAlac ? "m4a" : wantFlac ? "flac" : "mp3";
    const outputPath = join(tempDir, `output.${outputExt}`);
    const artPath = join(tempDir, "cover.jpg");

    await writeFile(inputPath, audio.buffer);

    let hasArt = false;
    if (track.albumArt && isAllowedUrl(track.albumArt, ALLOWED_ART_HOSTS)) {
      try {
        const artRes = await fetch(track.albumArt);
        if (artRes.ok) {
          const artBuffer = Buffer.from(await artRes.arrayBuffer());
          await writeFile(artPath, artBuffer);
          hasArt = true;
        }
      } catch {
        // Skip album art on failure
      }
    }

    const ffmpegArgs: string[] = [];
    ffmpegArgs.push("-i", inputPath);

    if (wantAlac) {
      if (hasArt) {
        ffmpegArgs.push("-i", artPath, "-map", "0:a", "-map", "1:0");
      }
      ffmpegArgs.push("-c:a", "alac");
      if (hasArt) {
        ffmpegArgs.push("-c:v", "copy", "-disposition:v", "attached_pic");
      }
    } else if (wantFlac) {
      if (hasArt) {
        ffmpegArgs.push("-i", artPath, "-map", "0:a", "-map", "1:0");
      }
      if (audio.format === "flac") {
        ffmpegArgs.push("-c:a", "copy");
      } else {
        ffmpegArgs.push("-c:a", "flac");
      }
      if (hasArt) {
        ffmpegArgs.push("-c:v", "copy", "-disposition:v", "attached_pic");
      }
    } else {
      if (hasArt) {
        ffmpegArgs.push("-i", artPath, "-map", "0:a", "-map", "1:0");
      }
      if (audio.source === "deezer" && audio.format === "mp3") {
        ffmpegArgs.push("-c:a", "copy");
      } else {
        ffmpegArgs.push("-c:a", "libmp3lame", "-b:a", "320k");
      }
      if (hasArt) {
        ffmpegArgs.push(
          "-c:v", "copy",
          "-id3v2_version", "3",
          "-metadata:s:v", "title=Album cover",
          "-metadata:s:v", "comment=Cover (front)",
          "-disposition:v", "attached_pic"
        );
      } else {
        ffmpegArgs.push("-id3v2_version", "3");
      }
    }

    ffmpegArgs.push(
      "-metadata", `title=${track.name}`,
      "-metadata", `artist=${track.artist}`,
      "-metadata", `album=${track.album}`,
    );
    if (track.albumArtist) {
      ffmpegArgs.push("-metadata", `album_artist=${track.albumArtist}`);
    }
    if (track.genre) {
      ffmpegArgs.push("-metadata", `genre=${track.genre}`);
    }
    if (track.releaseDate) {
      ffmpegArgs.push("-metadata", `date=${track.releaseDate}`);
    }
    if (track.trackNumber != null) {
      const trackTag = track.totalTracks ? `${track.trackNumber}/${track.totalTracks}` : `${track.trackNumber}`;
      ffmpegArgs.push("-metadata", `track=${trackTag}`);
    }
    if (track.discNumber != null) {
      ffmpegArgs.push("-metadata", `disc=${track.discNumber}`);
    }
    if (track.isrc) {
      if (wantAlac) {
        ffmpegArgs.push("-metadata", `ISRC=${track.isrc}`);
      } else if (wantFlac) {
        ffmpegArgs.push("-metadata", `ISRC=${track.isrc}`);
      } else {
        ffmpegArgs.push("-metadata", `TSRC=${track.isrc}`);
      }
    }
    if (track.label) {
      ffmpegArgs.push("-metadata", `label=${track.label}`);
    }
    if (track.copyright) {
      ffmpegArgs.push("-metadata", `copyright=${track.copyright}`);
    }
    if (lyrics) {
      const embeddedLyrics = syncedLyrics ? lyrics : lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim();
      ffmpegArgs.push("-metadata", `lyrics=${embeddedLyrics}`);
    }
    if (wantAlac || wantFlac) {
      const bitDepth = audio.qualityInfo?.bitDepth ?? 16;
      const sampleRate = audio.qualityInfo?.sampleRate ?? 44100;
      const codec = wantAlac ? "ALAC" : "FLAC";
      ffmpegArgs.push("-metadata", `comment=Lossless (${codec} ${bitDepth}-bit/${(sampleRate / 1000).toFixed(1)}kHz)`);
    }
    ffmpegArgs.push("-y", outputPath);

    try {
      await ffmpegSemaphore.run(() =>
        execFileAsync("ffmpeg", ffmpegArgs, {
          timeout: 120000,
          maxBuffer: 50 * 1024 * 1024,
        })
      );
    } catch {
      try {
        const fallbackArgs = wantAlac
          ? ["-y", "-i", inputPath, "-c:a", "alac", outputPath]
          : wantFlac
            ? ["-y", "-i", inputPath, "-c:a", "flac", outputPath]
            : ["-y", "-i", inputPath, "-c:a", "libmp3lame", "-b:a", "320k", outputPath];
        await ffmpegSemaphore.run(() =>
          execFileAsync("ffmpeg", fallbackArgs, {
            timeout: 120000,
            maxBuffer: 50 * 1024 * 1024,
          })
        );
      } catch {
        const filename = `${track.artist} - ${track.name} · yoink.${audio.format}`;
        return { filename, buffer: audio.buffer };
      }
    }

    const outputBuffer = await readFile(outputPath);
    let finalBuffer: Buffer = outputBuffer;
    if (outputExt === "m4a") {
      if (track.explicit) finalBuffer = setExplicitTag(finalBuffer);
      if (catalogIds) finalBuffer = setCatalogIds(finalBuffer, catalogIds);
    }
    const filename = `${track.artist} - ${track.name} · yoink.${outputExt}`;
    return { filename, buffer: finalBuffer as Buffer };
  } finally {
    try {
      const files = await readdir(tempDir);
      await Promise.all(files.map((f) => unlink(join(tempDir, f))));
      await rmdir(tempDir);
    } catch {
      // Best effort cleanup
    }
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_");
}

export async function POST(request: NextRequest) {
  const logId = getRequestLogId(request);

  try {
    const ip = getClientIp(request);
    const source = getRequestSource(request);
    const { allowed, retryAfter } = rateLimit(`dl-playlist:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { url, format: requestedFormat, genreSource, syncedLyrics } = body;

    console.log(
      `[playlist-dl] [${source}] ${logId} → ${summarizeUrlForLogs(url)}${requestedFormat ? ` (${requestedFormat})` : ""}`
    );

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const MAX_TRACKS = 200;

    const urlType = detectUrlType(url);
    let playlist: PlaylistInfo | null = null;

    // Try Spotify API first, fall back to embed scraping
    if (urlType === "album") {
      try { playlist = await getAlbumInfo(url); } catch (e) {
        console.log("[playlist-dl] album API failed:", e instanceof Error ? e.message : e);
        playlist = await resolveAlbum(url);
      }
    } else if (urlType === "artist") {
      try { playlist = await getArtistTopTracks(url); } catch (e) {
        console.log("[playlist-dl] artist API failed:", e instanceof Error ? e.message : e);
        playlist = await resolveArtist(url);
      }
    } else {
      try { playlist = await getPlaylistInfo(url); } catch (e) {
        console.log("[playlist-dl] playlist API failed:", e instanceof Error ? e.message : e);
        playlist = await resolvePlaylist(url);
      }
    }

    if (!playlist) {
      return NextResponse.json({ error: "couldn't load this right now" }, { status: 503 });
    }
    // Enrich embed-scraped tracks (no ISRC/albumArt) with Deezer/iTunes metadata
    // Only needed when tracks came from embed scraping (no ISRC = not from Spotify API)
    const needsEnrichment = playlist.tracks.some(t => !t.isrc && !t.albumArt);
    if (needsEnrichment) {
      console.log("[playlist-dl] enriching", playlist.tracks.length, "scraped tracks with metadata");
      const enriched = await Promise.all(
        playlist.tracks.map(async (track) => {
          if (track.isrc && track.albumArt) return track; // already has full metadata
          try {
            // Try resolving via the single-track resolver (Deezer search by artist+title)
            if (track.spotifyUrl) {
              const resolved = await resolveSpotifyTrack(track.spotifyUrl);
              if (resolved) return { ...resolved, spotifyUrl: track.spotifyUrl };
            }
            // Fallback: Deezer structured search (with album context for disambiguation)
            const dz = await searchDeezerStructured(track.name, track.artist, track.album || null);
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

    // Stream progress events, then the zip binary
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        send({ type: "start", total: playlist.tracks.length });

        const CONCURRENCY = 2;
        const MAX_RETRIES = 2;
        const results: { filename: string; buffer: Buffer }[] = new Array(playlist.tracks.length);
        const errors: number[] = [];

        const processWithRetry = async (track: typeof playlist.tracks[0], index: number) => {
          let lastError: unknown;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const result = await processTrack(track, requestedFormat, genreSource, syncedLyrics === true);
              send({ type: "done", index });
              return result;
            } catch (err) {
              lastError = err;
              if (attempt < MAX_RETRIES) {
                console.log(`[playlist] track ${index} attempt ${attempt + 1} failed, retrying...`);
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
          }
          throw lastError;
        };

        for (let i = 0; i < playlist.tracks.length; i += CONCURRENCY) {
          // Random delay between batches to avoid hammering sources
          if (i > 0) {
            const delay = 1000 + Math.random() * 2000; // 1-3s
            await new Promise((r) => setTimeout(r, delay));
          }

          const batch = playlist.tracks.slice(i, i + CONCURRENCY);
          const batchIndices = batch.map((_, j) => i + j);

          // Notify which tracks started
          send({ type: "batch", indices: batchIndices });

          const batchResults = await Promise.allSettled(
            batch.map(async (track, j) => {
              if (j > 0) await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000)); // stagger within batch
              return processWithRetry(track, i + j);
            })
          );

          for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            if (result.status === "fulfilled") {
              results[i + j] = result.value;
            } else {
              errors.push(i + j);
              const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
              const shortReason = reason.includes("any source")
                ? "not available on any audio source"
                : reason.includes("mismatch")
                ? "track verification failed"
                : reason.includes("timeout") || reason.includes("Timeout")
                ? "download timed out"
                : "download failed";
              send({ type: "error", index: i + j, reason: shortReason });
              console.error(`[playlist] track ${i + j} failed after ${MAX_RETRIES + 1} attempts:`, result.reason);
            }
          }
        }

        if (results.filter(Boolean).length === 0) {
          send({ type: "fatal", error: "All tracks failed to download" });
          controller.close();
          return;
        }

        // Build zip
        send({ type: "zipping" });

        const zipEntries: Record<string, Uint8Array> = {};
        const usedNames = new Set<string>();

        for (const result of results) {
          if (!result) continue;
          let name = sanitizeFilename(result.filename);
          if (usedNames.has(name)) {
            const ext = name.lastIndexOf(".");
            const base = name.slice(0, ext);
            const extStr = name.slice(ext);
            let counter = 2;
            while (usedNames.has(`${base} (${counter})${extStr}`)) counter++;
            name = `${base} (${counter})${extStr}`;
          }
          usedNames.add(name);
          zipEntries[name] = new Uint8Array(result.buffer);
        }

        const zipBuffer = zipSync(zipEntries, { level: 0 });
        const zipFilename = sanitizeFilename(`${playlist.name} · yoink`) + ".zip";

        incrementDownloads(usedNames.size).catch(() => {});

        // Send zip metadata then binary
        send({ type: "zip", filename: zipFilename, size: zipBuffer.length });
        controller.enqueue(zipBuffer);
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Content-Type": "playlist-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playlist download failed";
    return NextResponse.json({ error: message, requestId: logId }, { status: 500 });
  }
}

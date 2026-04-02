# Browser-Side ffmpeg.wasm Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move audio encoding from the server to the browser using ffmpeg.wasm, eliminating the CPU bottleneck on a 1-core/3.8GB server.

**Architecture:** Server sends raw audio + metadata in a binary envelope via new `/api/prepare` and `/api/prepare-playlist` endpoints. Browser unpacks the envelope, encodes with ffmpeg.wasm in a Web Worker, and produces the final tagged file. Auto-fallback to existing server-side `/api/download` if the browser can't run ffmpeg.wasm.

**Tech Stack:** Next.js 16, React 19, @ffmpeg/ffmpeg, @ffmpeg/util, fflate (already installed), Web Workers

**Branch:** All work on `feat/browser-ffmpeg` branch off `main`.

**Spec:** `docs/superpowers/specs/2026-04-02-browser-ffmpeg-migration-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/app/api/prepare/route.ts` | Single-track binary envelope endpoint (no ffmpeg) |
| `src/app/api/prepare-playlist/route.ts` | Playlist binary envelope streaming endpoint (no ffmpeg) |
| `src/lib/envelope.ts` | Shared binary envelope packing logic (server-side) |
| `src/lib/client/envelope.ts` | Binary envelope unpacking logic (client-side) |
| `src/lib/client/ffmpeg-worker.ts` | Web Worker: loads ffmpeg.wasm, encodes audio, embeds metadata |
| `src/lib/client/ffmpeg-bridge.ts` | Main-thread API for communicating with the ffmpeg worker |
| `src/lib/client/capability.ts` | Detect SharedArrayBuffer + Worker support |
| `public/ffmpeg/` | Self-hosted ffmpeg.wasm core files (copied from node_modules) |

### Modified files
| File | What changes |
|------|-------------|
| `src/app/app/page.tsx` | Use ffmpeg-bridge for downloads, granular progress states, fallback logic |
| `next.config.ts` | Add COOP/COEP headers for SharedArrayBuffer |
| `package.json` | Add @ffmpeg/ffmpeg, @ffmpeg/util |

### Unchanged files
| File | Why |
|------|-----|
| `src/app/api/download/route.ts` | Server-side fallback — untouched |
| `src/app/api/download-playlist/route.ts` | Server-side fallback — untouched |
| All of `src/lib/*.ts` (except new files) | Server logic stays the same |

---

## Task 1: Create feature branch and install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Create feature branch**

```bash
cd /root/services/yoink
git checkout -b feat/browser-ffmpeg
```

- [ ] **Step 2: Install @ffmpeg/ffmpeg and @ffmpeg/util**

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

- [ ] **Step 3: Copy ffmpeg.wasm core files to public/**

```bash
mkdir -p public/ffmpeg
cp node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js public/ffmpeg/
cp node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm public/ffmpeg/
cp node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.worker.js public/ffmpeg/
```

If `@ffmpeg/core` is not automatically installed as a dependency, install it:

```bash
npm install @ffmpeg/core
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/ffmpeg/
git commit -m "feat: add ffmpeg.wasm dependencies and self-hosted core files"
```

---

## Task 2: Add COOP/COEP headers in next.config.ts

**Files:**
- Modify: `next.config.ts`

SharedArrayBuffer (required by ffmpeg.wasm) needs these headers on pages (not API routes).

- [ ] **Step 1: Update next.config.ts**

Replace the full contents of `next.config.ts` with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply COOP/COEP to app pages (needed for SharedArrayBuffer)
        // Only match the app page, not API routes (which don't need these)
        source: "/app",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the dev server starts**

```bash
npm run dev
```

Expected: Server starts without errors. Visit `/app` and check response headers include `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

- [ ] **Step 3: Check for broken third-party resources**

COEP `require-corp` blocks cross-origin resources that don't have CORS headers. Check that album art images (`i.scdn.co`, `e-cdns-images.dzcdn.net`, etc.) still load on the `/app` page. If they break, switch to `credentialless`:

```typescript
{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
```

`credentialless` still enables SharedArrayBuffer but is more lenient with cross-origin images.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat: add COOP/COEP headers for SharedArrayBuffer support"
```

---

## Task 3: Build the server-side binary envelope packer

**Files:**
- Create: `src/lib/envelope.ts`

This module packs raw audio + metadata + album art into a single binary envelope.

- [ ] **Step 1: Create src/lib/envelope.ts**

```typescript
/**
 * Binary envelope format for client-side ffmpeg processing.
 *
 * Layout:
 *   [4 bytes] metadata JSON length (uint32 LE)
 *   [N bytes] metadata JSON (UTF-8)
 *   [4 bytes] album art length (uint32 LE, 0 if none)
 *   [N bytes] album art JPEG (if present)
 *   [remaining] raw audio bytes
 */

import type { TrackInfo } from "./spotify";
import type { AudioResult } from "./audio-sources";
import type { ItunesCatalogIds } from "./itunes";

export interface EnvelopeMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  genre: string | null;
  releaseDate: string | null;
  trackNumber: string | null;
  discNumber: string | null;
  isrc: string | null;
  label: string | null;
  copyright: string | null;
  lyrics: string | null;
  explicit: boolean;
  catalogIds: ItunesCatalogIds | null;
  sourceFormat: string;
  sourceCodec: string;
  sourceBitrate: number;
  sampleRate: number;
  bitDepth: number;
  totalTracks: number | null;
}

export function buildEnvelopeMetadata(
  track: TrackInfo,
  audio: AudioResult,
  lyrics: string | null,
  catalogIds: ItunesCatalogIds | null,
): EnvelopeMetadata {
  return {
    title: track.name,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    genre: track.genre,
    releaseDate: track.releaseDate,
    trackNumber: track.trackNumber != null
      ? (track.totalTracks ? `${track.trackNumber}/${track.totalTracks}` : `${track.trackNumber}`)
      : null,
    discNumber: track.discNumber != null ? `${track.discNumber}` : null,
    isrc: track.isrc,
    label: track.label,
    copyright: track.copyright,
    lyrics,
    explicit: track.explicit,
    catalogIds,
    sourceFormat: audio.format,
    sourceCodec: audio.qualityInfo?.codec ?? audio.format,
    sourceBitrate: audio.bitrate,
    sampleRate: audio.qualityInfo?.sampleRate ?? 44100,
    bitDepth: audio.qualityInfo?.bitDepth ?? 16,
    totalTracks: track.totalTracks,
  };
}

export function packEnvelope(
  metadata: EnvelopeMetadata,
  audioBuffer: Buffer,
  artBuffer: Buffer | null,
): Buffer {
  const metaJson = Buffer.from(JSON.stringify(metadata), "utf-8");
  const metaLen = Buffer.alloc(4);
  metaLen.writeUInt32LE(metaJson.length, 0);

  const artLen = Buffer.alloc(4);
  artLen.writeUInt32LE(artBuffer ? artBuffer.length : 0, 0);

  const parts: Buffer[] = [metaLen, metaJson, artLen];
  if (artBuffer) parts.push(artBuffer);
  parts.push(audioBuffer);

  return Buffer.concat(parts);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/envelope.ts
git commit -m "feat: add binary envelope packer for client-side ffmpeg"
```

---

## Task 4: Build the `/api/prepare` endpoint

**Files:**
- Create: `src/app/api/prepare/route.ts`

This is the single-track endpoint that does everything `/api/download` does except ffmpeg. It returns a binary envelope.

- [ ] **Step 1: Create src/app/api/prepare/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { detectPlatform } from "@/lib/spotify";
import { lookupItunesGenre, lookupItunesCatalogIds } from "@/lib/itunes";
import { fetchBestAudio } from "@/lib/audio-sources";
import { fetchLyrics } from "@/lib/lyrics";
import { rateLimit } from "@/lib/ratelimit";
import { resolveTrack } from "@/lib/resolve-track";
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

    const resolved = await resolveTrack(url);
    if (!resolved) {
      return NextResponse.json(
        { error: "couldn't find this track — try a different link" },
        { status: 404 }
      );
    }
    let track = resolved.track;

    if (genreSource === "itunes") {
      const itunesGenre = await lookupItunesGenre(track);
      if (itunesGenre) track.genre = itunesGenre;
    }

    const [audio, lyrics, catalogIds] = await Promise.all([
      fetchBestAudio(track, preferLossless),
      fetchLyrics(track.artist, track.name),
      lookupItunesCatalogIds(track),
    ]);

    // Download album art
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
      ? lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim()
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
```

- [ ] **Step 2: Test the endpoint manually**

```bash
curl -X POST http://localhost:3000/api/prepare \
  -H "Content-Type: application/json" \
  -d '{"url":"https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT","format":"mp3"}' \
  -o /tmp/test-envelope.bin -w "%{http_code}"
```

Expected: HTTP 200, binary file written. First 4 bytes are a uint32 LE metadata length.

Verify envelope structure:

```bash
python3 -c "
import struct
with open('/tmp/test-envelope.bin','rb') as f:
    meta_len = struct.unpack('<I', f.read(4))[0]
    meta = f.read(meta_len).decode('utf-8')
    print(f'Metadata length: {meta_len}')
    print(meta[:200])
"
```

Expected: JSON with title, artist, album, etc.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prepare/route.ts
git commit -m "feat: add /api/prepare endpoint for binary envelope"
```

---

## Task 5: Build the `/api/prepare-playlist` endpoint

**Files:**
- Create: `src/app/api/prepare-playlist/route.ts`

Streams individual binary envelopes per track as JSON-lines + binary.

- [ ] **Step 1: Create src/app/api/prepare-playlist/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getPlaylistInfo, getAlbumInfo, getArtistTopTracks,
  detectUrlType, type TrackInfo, type PlaylistInfo,
} from "@/lib/spotify";
import { lookupItunesGenre, lookupItunesCatalogIds } from "@/lib/itunes";
import { fetchBestAudio } from "@/lib/audio-sources";
import { fetchLyrics } from "@/lib/lyrics";
import { rateLimit } from "@/lib/ratelimit";
import { getRequestSource } from "@/lib/request-source";
import { resolvePlaylist, resolveAlbum, resolveSpotifyTrack, searchDeezerStructured } from "@/lib/resolve-track";
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

export const maxDuration = 300;

async function prepareTrack(
  track: TrackInfo,
  requestedFormat: string | undefined,
  genreSource?: string,
): Promise<Buffer> {
  const preferLossless = requestedFormat === "flac" || requestedFormat === "alac";

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
    } catch {}
  }

  const plainLyrics = lyrics
    ? lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim()
    : null;

  const metadata = buildEnvelopeMetadata(track, audio, plainLyrics, catalogIds);
  return packEnvelope(metadata, audio.buffer, artBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const source = getRequestSource(request);
    const { allowed, retryAfter } = rateLimit(`dl-playlist:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const { url, format: requestedFormat, genreSource } = body;

    console.log(`[prepare-playlist] [${source}] ${ip} → ${url}${requestedFormat ? ` (${requestedFormat})` : ""}`);

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

    const needsEnrichment = playlist.tracks.some(t => !t.isrc && !t.albumArt);
    if (needsEnrichment) {
      console.log("[prepare-playlist] enriching", playlist.tracks.length, "scraped tracks");
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
          } catch {}
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

        send({ type: "start", total: playlist.tracks.length });

        const CONCURRENCY = 2;
        const MAX_RETRIES = 2;

        const prepareWithRetry = async (track: TrackInfo, index: number): Promise<Buffer | null> => {
          let lastError: unknown;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              return await prepareTrack(track, requestedFormat, genreSource);
            } catch (err) {
              lastError = err;
              if (attempt < MAX_RETRIES) {
                console.log(`[prepare-playlist] track ${index} attempt ${attempt + 1} failed, retrying...`);
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
          }
          console.error(`[prepare-playlist] track ${index} failed after ${MAX_RETRIES + 1} attempts:`, lastError);
          return null;
        };

        for (let i = 0; i < playlist.tracks.length; i += CONCURRENCY) {
          const batch = playlist.tracks.slice(i, i + CONCURRENCY);
          const batchIndices = batch.map((_, j) => i + j);
          send({ type: "batch", indices: batchIndices });

          const batchResults = await Promise.allSettled(
            batch.map((track, j) => prepareWithRetry(track, i + j))
          );

          for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            if (result.status === "fulfilled" && result.value) {
              const envelope = result.value;
              send({ type: "track", index: i + j, size: envelope.length });
              controller.enqueue(new Uint8Array(envelope));
            } else {
              send({ type: "error", index: i + j });
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
        "X-Content-Type": "prepare-playlist-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playlist prepare failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/prepare-playlist/route.ts
git commit -m "feat: add /api/prepare-playlist endpoint for streaming binary envelopes"
```

---

## Task 6: Build the client-side envelope unpacker

**Files:**
- Create: `src/lib/client/envelope.ts`

- [ ] **Step 1: Create src/lib/client/envelope.ts**

```typescript
/**
 * Unpacks a binary envelope into metadata, album art, and raw audio.
 * Mirror of the server-side packEnvelope format.
 */

export interface EnvelopeMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  genre: string | null;
  releaseDate: string | null;
  trackNumber: string | null;
  discNumber: string | null;
  isrc: string | null;
  label: string | null;
  copyright: string | null;
  lyrics: string | null;
  explicit: boolean;
  catalogIds: { trackId: number; collectionId: number; artistId: number; genreId: number } | null;
  sourceFormat: string;
  sourceCodec: string;
  sourceBitrate: number;
  sampleRate: number;
  bitDepth: number;
  totalTracks: number | null;
}

export interface UnpackedEnvelope {
  metadata: EnvelopeMetadata;
  albumArt: Uint8Array | null;
  audio: Uint8Array;
}

export function unpackEnvelope(buffer: ArrayBuffer): UnpackedEnvelope {
  const view = new DataView(buffer);
  let offset = 0;

  // Read metadata JSON
  const metaLen = view.getUint32(offset, true); // little-endian
  offset += 4;
  const metaBytes = new Uint8Array(buffer, offset, metaLen);
  const metadata: EnvelopeMetadata = JSON.parse(new TextDecoder().decode(metaBytes));
  offset += metaLen;

  // Read album art
  const artLen = view.getUint32(offset, true);
  offset += 4;
  let albumArt: Uint8Array | null = null;
  if (artLen > 0) {
    albumArt = new Uint8Array(buffer, offset, artLen);
    offset += artLen;
  }

  // Remaining bytes are raw audio
  const audio = new Uint8Array(buffer, offset);

  return { metadata, albumArt, audio };
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/lib/client
git add src/lib/client/envelope.ts
git commit -m "feat: add client-side binary envelope unpacker"
```

---

## Task 7: Build the ffmpeg Web Worker

**Files:**
- Create: `src/lib/client/ffmpeg-worker.ts`

This is the Web Worker that loads ffmpeg.wasm and processes audio. It receives messages from the main thread with raw audio + metadata and returns encoded files.

- [ ] **Step 1: Create src/lib/client/ffmpeg-worker.ts**

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { EnvelopeMetadata } from "./envelope";

let ffmpeg: FFmpeg | null = null;

async function ensureLoaded(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    self.postMessage({ type: "progress", percent: Math.round(progress * 100) });
  });

  self.postMessage({ type: "loading" });

  // Load from self-hosted files in /ffmpeg/
  const baseURL = self.location.origin + "/ffmpeg";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
  });

  self.postMessage({ type: "ready" });
  return ffmpeg;
}

interface EncodeRequest {
  type: "encode";
  id: string;
  audio: Uint8Array;
  albumArt: Uint8Array | null;
  metadata: EnvelopeMetadata;
  outputFormat: "mp3" | "flac" | "alac";
}

function buildFfmpegArgs(
  metadata: EnvelopeMetadata,
  hasArt: boolean,
  outputFormat: "mp3" | "flac" | "alac",
): string[] {
  const args: string[] = ["-i", "input"];
  const canLossless = (outputFormat === "flac" || outputFormat === "alac")
    && (metadata.sourceFormat === "flac");
  const wantAlac = canLossless && outputFormat === "alac";
  const wantFlac = canLossless && outputFormat === "flac";

  const outputExt = wantAlac ? "m4a" : wantFlac ? "flac" : "mp3";

  if (wantAlac) {
    if (hasArt) args.push("-i", "cover.jpg", "-map", "0:a", "-map", "1:0");
    args.push("-c:a", "alac");
    if (hasArt) args.push("-c:v", "copy", "-disposition:v", "attached_pic");
  } else if (wantFlac) {
    if (hasArt) args.push("-i", "cover.jpg", "-map", "0:a", "-map", "1:0");
    if (metadata.sourceFormat === "flac") {
      args.push("-c:a", "copy");
    } else {
      args.push("-c:a", "flac");
    }
    if (hasArt) args.push("-c:v", "copy", "-disposition:v", "attached_pic");
  } else {
    // MP3 output
    if (hasArt) args.push("-i", "cover.jpg", "-map", "0:a", "-map", "1:0");
    if (metadata.sourceFormat === "mp3" && metadata.sourceBitrate >= 320) {
      args.push("-c:a", "copy");
    } else {
      args.push("-c:a", "libmp3lame", "-b:a", "320k");
    }
    if (hasArt) {
      args.push(
        "-c:v", "copy",
        "-id3v2_version", "3",
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)",
        "-disposition:v", "attached_pic",
      );
    } else {
      args.push("-id3v2_version", "3");
    }
  }

  // Metadata tags
  args.push("-metadata", `title=${metadata.title}`);
  args.push("-metadata", `artist=${metadata.artist}`);
  args.push("-metadata", `album=${metadata.album}`);
  if (metadata.albumArtist) args.push("-metadata", `album_artist=${metadata.albumArtist}`);
  if (metadata.genre) args.push("-metadata", `genre=${metadata.genre}`);
  if (metadata.releaseDate) args.push("-metadata", `date=${metadata.releaseDate}`);
  if (metadata.trackNumber) args.push("-metadata", `track=${metadata.trackNumber}`);
  if (metadata.discNumber) args.push("-metadata", `disc=${metadata.discNumber}`);
  if (metadata.isrc) {
    if (wantAlac || wantFlac) {
      args.push("-metadata", `ISRC=${metadata.isrc}`);
    } else {
      args.push("-metadata", `TSRC=${metadata.isrc}`);
    }
  }
  if (metadata.label) args.push("-metadata", `label=${metadata.label}`);
  if (metadata.copyright) args.push("-metadata", `copyright=${metadata.copyright}`);
  if (metadata.lyrics) args.push("-metadata", `lyrics=${metadata.lyrics}`);
  if (wantAlac || wantFlac) {
    const codec = wantAlac ? "ALAC" : "FLAC";
    args.push("-metadata", `comment=Lossless (${codec} ${metadata.bitDepth}-bit/${(metadata.sampleRate / 1000).toFixed(1)}kHz)`);
  }

  args.push("-y", `output.${outputExt}`);
  return args;
}

// --- M4A post-processing (client-side ports of mp4-advisory.ts and mp4-catalog.ts) ---

function findAtom(view: DataView, buf: Uint8Array, name: string, start: number, end: number): { offset: number; size: number } | null {
  let pos = start;
  while (pos + 8 <= end) {
    const size = view.getUint32(pos);
    if (size < 8) return null;
    const atomName = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    if (atomName === name) return { offset: pos, size };
    pos += size;
  }
  return null;
}

function findAtomPath(view: DataView, buf: Uint8Array, path: string[]): { offset: number; size: number } | null {
  let searchStart = 0;
  let searchEnd = buf.length;
  let result: { offset: number; size: number } | null = null;

  for (const name of path) {
    const found = findAtom(view, buf, name, searchStart, searchEnd);
    if (!found) return null;
    result = found;
    const headerSize = name === "meta" ? 12 : 8;
    searchStart = found.offset + headerSize;
    searchEnd = found.offset + found.size;
  }
  return result;
}

function updateAtomSizes(view: DataView, buf: Uint8Array, path: string[], growth: number): void {
  let searchStart = 0;
  let searchEnd = buf.length;
  for (const name of path) {
    const found = findAtom(view, buf, name, searchStart, searchEnd);
    if (!found) return;
    view.setUint32(found.offset, found.size + growth);
    const headerSize = name === "meta" ? 12 : 8;
    searchStart = found.offset + headerSize;
    searchEnd = found.offset + found.size + growth;
  }
}

function setExplicitTagClient(data: Uint8Array): Uint8Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ilst = findAtomPath(view, data, ["moov", "udta", "meta", "ilst"]);
  if (!ilst) return data;

  // Build rtng atom (25 bytes)
  const rtng = new Uint8Array(25);
  const rtngView = new DataView(rtng.buffer);
  rtngView.setUint32(0, 25); // rtng size
  rtng.set([0x72, 0x74, 0x6E, 0x67], 4); // "rtng"
  rtngView.setUint32(8, 17); // data atom size
  rtng.set([0x64, 0x61, 0x74, 0x61], 12); // "data"
  rtngView.setUint32(16, 21); // type: integer
  rtngView.setUint32(20, 0); // locale
  rtng[24] = 1; // explicit

  const ilstEnd = ilst.offset + ilst.size;
  const result = new Uint8Array(data.length + rtng.length);
  result.set(data.subarray(0, ilstEnd));
  result.set(rtng, ilstEnd);
  result.set(data.subarray(ilstEnd), ilstEnd + rtng.length);

  const resultView = new DataView(result.buffer);
  updateAtomSizes(resultView, result, ["moov", "udta", "meta", "ilst"], rtng.length);
  return result;
}

function setCatalogIdsClient(
  data: Uint8Array,
  ids: { trackId: number; collectionId: number; artistId: number; genreId: number },
): Uint8Array {
  const atoms: { name: string; value: number }[] = [];
  if (ids.trackId) atoms.push({ name: "cnID", value: ids.trackId });
  if (ids.collectionId) atoms.push({ name: "plID", value: ids.collectionId });
  if (ids.artistId) atoms.push({ name: "atID", value: ids.artistId });
  if (ids.genreId) atoms.push({ name: "geID", value: ids.genreId });
  if (atoms.length === 0) return data;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ilst = findAtomPath(view, data, ["moov", "udta", "meta", "ilst"]);
  if (!ilst) return data;

  const atomBuffers = atoms.map(({ name, value }) => {
    const buf = new Uint8Array(32); // 8 wrapper + 24 data
    const v = new DataView(buf.buffer);
    v.setUint32(0, 32); // wrapper size
    buf.set(new TextEncoder().encode(name), 4);
    v.setUint32(8, 24); // data atom size
    buf.set([0x64, 0x61, 0x74, 0x61], 12); // "data"
    v.setUint32(16, 21); // type: integer
    v.setUint32(20, 0); // locale
    v.setUint32(24, value);
    return buf;
  });

  const totalInsert = atomBuffers.reduce((sum, b) => sum + b.length, 0);
  const ilstEnd = ilst.offset + ilst.size;
  const result = new Uint8Array(data.length + totalInsert);
  result.set(data.subarray(0, ilstEnd));
  let offset = ilstEnd;
  for (const buf of atomBuffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  result.set(data.subarray(ilstEnd), offset);

  const resultView = new DataView(result.buffer);
  updateAtomSizes(resultView, result, ["moov", "udta", "meta", "ilst"], totalInsert);
  return result;
}

// --- Main message handler ---

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, audio, albumArt, metadata, outputFormat } = e.data;

  try {
    const ff = await ensureLoaded();

    // Write input files to ffmpeg's virtual filesystem
    await ff.writeFile("input", new Uint8Array(audio));
    if (albumArt) {
      await ff.writeFile("cover.jpg", new Uint8Array(albumArt));
    }

    const args = buildFfmpegArgs(metadata, !!albumArt, outputFormat);
    const outputFile = args[args.length - 1]; // last arg is the output filename

    await ff.exec(args);

    const outputData = await ff.readFile(outputFile);

    // Clean up virtual filesystem
    await ff.deleteFile("input");
    if (albumArt) await ff.deleteFile("cover.jpg");
    await ff.deleteFile(outputFile);

    // Apply M4A post-processing (explicit tag + catalog IDs) — same as server-side
    let finalData = outputData as Uint8Array;
    if (outputFormat === "alac") {
      if (metadata.explicit) {
        finalData = setExplicitTagClient(finalData);
      }
      if (metadata.catalogIds) {
        finalData = setCatalogIdsClient(finalData, metadata.catalogIds);
      }
    }

    // Transfer the buffer (zero-copy)
    const buffer = finalData.buffer;
    self.postMessage(
      { type: "complete", id, buffer: finalData },
      // @ts-expect-error -- transferable
      [buffer],
    );
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      message: err instanceof Error ? err.message : "ffmpeg encoding failed",
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/client/ffmpeg-worker.ts
git commit -m "feat: add ffmpeg.wasm Web Worker with M4A post-processing"
```

---

## Task 8: Build the main-thread ffmpeg bridge

**Files:**
- Create: `src/lib/client/ffmpeg-bridge.ts`
- Create: `src/lib/client/capability.ts`

The bridge provides a clean async API for the main thread to request encoding and handle fallback.

- [ ] **Step 1: Create src/lib/client/capability.ts**

```typescript
/**
 * Detect whether the browser can run ffmpeg.wasm.
 * Checks for SharedArrayBuffer (requires COOP/COEP headers) and Web Worker support.
 */

let _canUse: boolean | null = null;

export function canUseClientFFmpeg(): boolean {
  if (_canUse !== null) return _canUse;

  _canUse =
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Worker !== "undefined";

  return _canUse;
}
```

- [ ] **Step 2: Create src/lib/client/ffmpeg-bridge.ts**

```typescript
import type { EnvelopeMetadata } from "./envelope";
import { canUseClientFFmpeg } from "./capability";

export type FFmpegStatus =
  | { type: "loading" }
  | { type: "ready" }
  | { type: "progress"; percent: number }
  | { type: "complete"; buffer: Uint8Array }
  | { type: "error"; message: string };

type StatusCallback = (status: FFmpegStatus) => void;

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<string, StatusCallback>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("./ffmpeg-worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.id) {
      // Message targeted at a specific request
      const cb = pending.get(msg.id);
      if (cb) {
        cb(msg as FFmpegStatus);
        if (msg.type === "complete" || msg.type === "error") {
          pending.delete(msg.id);
        }
      }
    } else {
      // Broadcast message (loading/ready) — send to all pending
      for (const cb of pending.values()) {
        cb(msg as FFmpegStatus);
      }
    }
  };
  return worker;
}

/**
 * Encode audio using ffmpeg.wasm in a Web Worker.
 * Returns the encoded file as a Uint8Array.
 * Calls onStatus with progress updates.
 * Throws if encoding fails or times out.
 */
export async function encodeInBrowser(
  audio: Uint8Array,
  albumArt: Uint8Array | null,
  metadata: EnvelopeMetadata,
  outputFormat: "mp3" | "flac" | "alac",
  onStatus?: StatusCallback,
  timeoutMs = 60_000,
): Promise<Uint8Array> {
  if (!canUseClientFFmpeg()) {
    throw new Error("Browser does not support client-side ffmpeg");
  }

  const w = getWorker();
  const id = String(++requestId);

  return new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("ffmpeg encoding timed out"));
    }, timeoutMs);

    pending.set(id, (status) => {
      onStatus?.(status);
      if (status.type === "complete") {
        clearTimeout(timer);
        resolve(status.buffer);
      } else if (status.type === "error") {
        clearTimeout(timer);
        reject(new Error(status.message));
      }
    });

    // Transfer buffers to worker (zero-copy)
    const transferable: ArrayBuffer[] = [audio.buffer];
    if (albumArt) transferable.push(albumArt.buffer);

    w.postMessage(
      { type: "encode", id, audio, albumArt, metadata, outputFormat },
      transferable,
    );
  });
}

/** Check if browser supports client-side ffmpeg. */
export { canUseClientFFmpeg } from "./capability";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/client/capability.ts src/lib/client/ffmpeg-bridge.ts
git commit -m "feat: add ffmpeg bridge and capability detection for main thread"
```

---

## Task 9: Update the app page — single track with client-side encoding

**Files:**
- Modify: `src/app/app/page.tsx`

This is the core UI integration. Replace the `downloadTrack` function to use the prepare endpoint + client-side encoding, with fallback.

- [ ] **Step 1: Add imports at the top of `src/app/app/page.tsx`**

After the existing imports (line 8), add:

```typescript
import { unpackEnvelope } from "@/lib/client/envelope";
import { encodeInBrowser, canUseClientFFmpeg, type FFmpegStatus } from "@/lib/client/ffmpeg-bridge";
```

- [ ] **Step 2: Add a `downloadPhase` state**

After the `quality` state declaration (line 44), add:

```typescript
const [downloadPhase, setDownloadPhase] = useState<string>("");
```

- [ ] **Step 3: Replace the `downloadTrack` function**

Replace the existing `downloadTrack` callback (lines 105-139) with:

```typescript
  const downloadTrack = useCallback(async (trackInfo: TrackInfo): Promise<QualityInfo | false> => {
    const trackUrl = trackInfo.spotifyUrl || originalUrl;
    const useClient = canUseClientFFmpeg();

    if (useClient) {
      try {
        // Client-side path: fetch binary envelope, encode in browser
        setDownloadPhase("Fetching audio...");
        const res = await fetch("/api/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trackUrl, format, genreSource }),
        });

        if (!res.ok) {
          const data = await res.json();
          if (data.rateLimit) setIsRateLimited(true);
          throw new Error(data.error || "Download failed");
        }

        const audioSource = res.headers.get("X-Audio-Source") || "unknown";
        const envelope = await res.arrayBuffer();
        const { metadata, albumArt, audio } = unpackEnvelope(envelope);

        setDownloadPhase("Converting...");
        const encoded = await encodeInBrowser(
          audio,
          albumArt,
          metadata,
          format as "mp3" | "flac" | "alac",
          (status: FFmpegStatus) => {
            if (status.type === "progress") {
              setDownloadPhase(`Converting... ${status.percent}%`);
            } else if (status.type === "loading") {
              setDownloadPhase("Loading encoder...");
            }
          },
        );

        const extMap: Record<string, string> = { flac: "flac", alac: "m4a", mp3: "mp3" };
        const ext = extMap[format] || "mp3";
        const blob = new Blob([encoded], { type: "application/octet-stream" });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `${trackInfo.artist} - ${trackInfo.name}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        setDownloadPhase("");

        const qualityLabel = (format === "flac" || format === "alac") && metadata.sourceFormat === "flac"
          ? "lossless"
          : `${metadata.sourceBitrate}`;
        return { source: audioSource, bitrate: qualityLabel };
      } catch (err) {
        // Fallback to server-side
        console.warn("[client-ffmpeg] failed, falling back to server:", err);
        setDownloadPhase("Converting on server...");
      }
    }

    // Server-side fallback (or primary if !useClient)
    try {
      if (!useClient) setDownloadPhase("");
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trackUrl, format, genreSource }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.rateLimit) setIsRateLimited(true);
        throw new Error(data.error || "Download failed");
      }

      const audioSource = res.headers.get("X-Audio-Source") || "youtube";
      const audioBitrate = res.headers.get("X-Audio-Quality") || "~160";
      const audioFormat = res.headers.get("X-Audio-Format") || "mp3";

      const extMap: Record<string, string> = { flac: "flac", m4a: "m4a", alac: "m4a", mp3: "mp3" };
      const ext = extMap[audioFormat] || audioFormat;
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${trackInfo.artist} - ${trackInfo.name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      setDownloadPhase("");
      return { source: audioSource, bitrate: audioBitrate };
    } catch {
      setDownloadPhase("");
      return false;
    }
  }, [format, genreSource, originalUrl]);
```

- [ ] **Step 4: Show download phase in the UI**

In the single track card's download button (around line 466 of original), update the downloading state display. Replace:

```typescript
                      downloading
```

With:

```typescript
                      {downloadPhase || "downloading"}
```

This is inside the `{state === "downloading" && (...)}` block in the button.

- [ ] **Step 5: Test single track download in browser**

1. Run `npm run dev`
2. Open `http://localhost:3000/app`
3. Paste a Spotify track URL
4. Click download
5. Expected: See "Fetching audio..." then "Loading encoder..." then "Converting... X%" then file downloads
6. Check the downloaded file plays correctly and has metadata (artist, album, art)

- [ ] **Step 6: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: integrate client-side ffmpeg for single track downloads"
```

---

## Task 10: Update the app page — playlist with client-side encoding

**Files:**
- Modify: `src/app/app/page.tsx`

- [ ] **Step 1: Add fflate import**

At the top of the file, add:

```typescript
import { zipSync } from "fflate";
```

- [ ] **Step 2: Replace the `handleDownloadAll` function**

Replace the existing `handleDownloadAll` (starting at the function declaration) with the new version that tries client-side first, falls back to server. The new function:

1. Calls `/api/prepare-playlist` to get streaming binary envelopes
2. Unpacks each envelope and queues it for client-side ffmpeg encoding (sequential, one at a time)
3. Falls back per-track to `/api/download` if client-side encoding fails
4. Zips all encoded files client-side with fflate
5. If the entire client approach fails, falls through to the original server-side `/api/download-playlist` path

```typescript
  const handleDownloadAll = async () => {
    if (!playlist) return;
    setState("downloading");
    abortRef.current = false;
    setTrackStatuses(new Array(playlist.tracks.length).fill("pending"));

    const useClient = canUseClientFFmpeg();

    if (useClient) {
      try {
        const res = await fetch("/api/prepare-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: originalUrl, format, genreSource }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Playlist download failed");
        }

        const reader = res.body!.getReader();
        let byteBuffer = new Uint8Array(0);
        const encodedFiles: { name: string; data: Uint8Array }[] = [];
        let expectingBinary = 0;
        let currentTrackIndex = -1;

        const processEnvelope = async (envelopeBuffer: ArrayBuffer, index: number) => {
          const { metadata, albumArt, audio } = unpackEnvelope(envelopeBuffer);
          try {
            const encoded = await encodeInBrowser(
              audio, albumArt, metadata,
              format as "mp3" | "flac" | "alac",
              undefined,
              120_000,
            );

            const extMap: Record<string, string> = { flac: "flac", alac: "m4a", mp3: "mp3" };
            const ext = extMap[format] || "mp3";
            const name = `${metadata.artist} - ${metadata.title}.${ext}`.replace(/[/\\:*?"<>|]/g, "_");
            encodedFiles.push({ name, data: new Uint8Array(encoded) });

            setTrackStatuses((prev) => {
              const next = [...prev];
              next[index] = "done";
              return next;
            });
          } catch (err) {
            console.warn(`[client-ffmpeg] track ${index} failed, trying server fallback:`, err);
            try {
              const track = playlist.tracks[index];
              const trackUrl = track.spotifyUrl || originalUrl;
              const fallbackRes = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: trackUrl, format, genreSource }),
              });
              if (fallbackRes.ok) {
                const audioFormat = fallbackRes.headers.get("X-Audio-Format") || "mp3";
                const extMap: Record<string, string> = { flac: "flac", m4a: "m4a", alac: "m4a", mp3: "mp3" };
                const ext = extMap[audioFormat] || audioFormat;
                const blob = await fallbackRes.blob();
                const name = `${track.artist} - ${track.name}.${ext}`.replace(/[/\\:*?"<>|]/g, "_");
                encodedFiles.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
                setTrackStatuses((prev) => {
                  const next = [...prev];
                  next[index] = "done";
                  return next;
                });
                return;
              }
            } catch {}
            setTrackStatuses((prev) => {
              const next = [...prev];
              next[index] = "error";
              return next;
            });
          }
        };

        let encodeChain = Promise.resolve();

        const handleEvent = (event: Record<string, unknown>) => {
          if (event.type === "batch") {
            setTrackStatuses((prev) => {
              const next = [...prev];
              for (const idx of event.indices as number[]) next[idx] = "downloading";
              return next;
            });
          } else if (event.type === "track") {
            currentTrackIndex = event.index as number;
            expectingBinary = event.size as number;
          } else if (event.type === "error") {
            setTrackStatuses((prev) => {
              const next = [...prev];
              next[event.index as number] = "error";
              return next;
            });
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const combined = new Uint8Array(byteBuffer.length + value.length);
          combined.set(byteBuffer);
          combined.set(value, byteBuffer.length);
          byteBuffer = combined;

          while (expectingBinary > 0 && byteBuffer.length >= expectingBinary) {
            const envelopeBytes = byteBuffer.slice(0, expectingBinary).buffer;
            byteBuffer = byteBuffer.slice(expectingBinary);
            expectingBinary = 0;

            const idx = currentTrackIndex;
            encodeChain = encodeChain.then(() => processEnvelope(envelopeBytes, idx));
          }

          if (expectingBinary > 0) continue;

          while (true) {
            const newlineIdx = byteBuffer.indexOf(0x0A);
            if (newlineIdx === -1) break;

            const lineBytes = byteBuffer.slice(0, newlineIdx);
            byteBuffer = byteBuffer.slice(newlineIdx + 1);

            const line = new TextDecoder().decode(lineBytes).trim();
            if (!line) continue;

            try {
              const event = JSON.parse(line);
              handleEvent(event);
            } catch {}
          }
        }

        await encodeChain;

        if (encodedFiles.length === 0) {
          throw new Error("All tracks failed to download");
        }

        const zipEntries: Record<string, Uint8Array> = {};
        const usedNames = new Set<string>();
        for (const file of encodedFiles) {
          let name = file.name;
          if (usedNames.has(name)) {
            const ext = name.lastIndexOf(".");
            const base = name.slice(0, ext);
            const extStr = name.slice(ext);
            let counter = 2;
            while (usedNames.has(`${base} (${counter})${extStr}`)) counter++;
            name = `${base} (${counter})${extStr}`;
          }
          usedNames.add(name);
          zipEntries[name] = file.data;
        }

        const zipBuffer = zipSync(zipEntries, { level: 0 });
        const zipFilename = (playlist.name.replace(/[/\\:*?"<>|]/g, "_")) + ".zip";
        const zipBlob = new Blob([zipBuffer], { type: "application/zip" });
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        setState("done");
        setTimeout(() => setState("ready"), 3000);
        return;
      } catch (err) {
        console.warn("[client-ffmpeg] playlist failed entirely, falling back to server:", err);
        setTrackStatuses(new Array(playlist.tracks.length).fill("pending"));
      }
    }

    // Server-side fallback (existing logic, unchanged)
    try {
      const res = await fetch("/api/download-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl, format, genreSource }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Playlist download failed");
      }

      const reader = res.body!.getReader();
      const zipChunks: Uint8Array[] = [];
      let byteBuffer = new Uint8Array(0);
      let zipFilename = `${playlist.name}.zip`;
      let zipStarted = false;

      const handleEvent = (event: { type: string; indices?: number[]; index?: number; error?: string; filename?: string }) => {
        if (event.type === "batch") {
          setTrackStatuses((prev) => {
            const next = [...prev];
            for (const idx of event.indices!) next[idx] = "downloading";
            return next;
          });
        } else if (event.type === "done") {
          setTrackStatuses((prev) => {
            const next = [...prev];
            next[event.index!] = "done";
            return next;
          });
        } else if (event.type === "error") {
          setTrackStatuses((prev) => {
            const next = [...prev];
            next[event.index!] = "error";
            return next;
          });
        } else if (event.type === "fatal") {
          throw new Error(event.error);
        } else if (event.type === "zip") {
          zipFilename = event.filename || zipFilename;
          zipStarted = true;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (zipStarted) {
          zipChunks.push(value);
          continue;
        }

        const combined = new Uint8Array(byteBuffer.length + value.length);
        combined.set(byteBuffer);
        combined.set(value, byteBuffer.length);
        byteBuffer = combined;

        while (true) {
          const newlineIdx = byteBuffer.indexOf(0x0A);
          if (newlineIdx === -1) break;

          const lineBytes = byteBuffer.slice(0, newlineIdx);
          byteBuffer = byteBuffer.slice(newlineIdx + 1);

          const line = new TextDecoder().decode(lineBytes).trim();
          if (!line) continue;

          try {
            const event = JSON.parse(line);
            handleEvent(event);

            if (zipStarted && byteBuffer.length > 0) {
              zipChunks.push(byteBuffer);
              byteBuffer = new Uint8Array(0);
              break;
            }
          } catch {}
        }
      }

      const totalSize = zipChunks.reduce((sum, c) => sum + c.length, 0);
      const zipArray = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of zipChunks) {
        zipArray.set(chunk, offset);
        offset += chunk.length;
      }
      const zipBlob = new Blob([zipArray], { type: "application/zip" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setState("done");
      setTimeout(() => setState("ready"), 3000);
    } catch (err) {
      setTrackStatuses((prev) => prev.map((s) => s === "downloading" || s === "pending" ? "error" : s));
      setError(err instanceof Error ? err.message : "Playlist download failed");
      setState("error");
    }
  };
```

- [ ] **Step 3: Test playlist download in browser**

1. Run `npm run dev`
2. Open `http://localhost:3000/app`
3. Paste a Spotify playlist URL (pick a small one, 3-5 tracks)
4. Click "download all"
5. Expected: See per-track progress, each track encodes client-side, zip downloads at the end
6. Verify the zip contains properly tagged files

- [ ] **Step 4: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: integrate client-side ffmpeg for playlist downloads with fallback"
```

---

## Task 11: End-to-end testing and cleanup

**Files:**
- No new files

- [ ] **Step 1: Test all format combinations (single track)**

Test each format with a Spotify track URL:
1. MP3 — verify 320kbps, ID3v2 tags, album art embedded
2. FLAC — verify lossless metadata, album art, Vorbis comments
3. ALAC — verify M4A container, explicit flag, catalog IDs, album art

- [ ] **Step 2: Test playlist download (5-10 tracks)**

1. Download a playlist with format=mp3
2. Verify zip contains all tracks with correct filenames
3. Verify each track has full metadata
4. Check browser memory doesn't spike excessively (dev tools Memory tab)

- [ ] **Step 3: Test fallback scenarios**

1. Remove COOP/COEP headers from next.config.ts, restart dev server
2. Download a track — should use server-side `/api/download` path
3. Restore headers

- [ ] **Step 4: Test with different sources**

1. Apple Music link
2. YouTube link (WebM input to MP3 output)

- [ ] **Step 5: Verify server CPU usage is reduced**

With client-side encoding active, monitor the server during a download. No ffmpeg processes should be spawned when using the prepare endpoint.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

## Summary

| Task | Description | Key files |
|------|-------------|-----------|
| 1 | Branch + dependencies | `package.json`, `public/ffmpeg/` |
| 2 | COOP/COEP headers | `next.config.ts` |
| 3 | Envelope packer (server) | `src/lib/envelope.ts` |
| 4 | `/api/prepare` endpoint | `src/app/api/prepare/route.ts` |
| 5 | `/api/prepare-playlist` endpoint | `src/app/api/prepare-playlist/route.ts` |
| 6 | Envelope unpacker (client) | `src/lib/client/envelope.ts` |
| 7 | ffmpeg Web Worker + M4A post-processing | `src/lib/client/ffmpeg-worker.ts` |
| 8 | ffmpeg bridge + capability | `src/lib/client/ffmpeg-bridge.ts`, `src/lib/client/capability.ts` |
| 9 | Single track UI integration | `src/app/app/page.tsx` |
| 10 | Playlist UI integration | `src/app/app/page.tsx` |
| 11 | End-to-end testing | All files |

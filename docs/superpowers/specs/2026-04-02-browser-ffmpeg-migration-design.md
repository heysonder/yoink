# Browser-Side ffmpeg.wasm Migration

> Offload audio encoding from the server to the browser using ffmpeg.wasm to eliminate the CPU bottleneck on a 1-core/3.8GB server.

## Motivation

The server (1 vCPU, 3.8GB RAM) struggles with ffmpeg encoding. A semaphore limits concurrent processes to 2, which directly caps download throughput. By moving encoding to the browser, the server becomes I/O-only (fetch audio, proxy to client), and each user's device handles its own encoding.

## Approach: Binary Envelope + Client-Side ffmpeg.wasm

**Browser-first with automatic server fallback.** The server sends raw audio + metadata in a binary envelope. The browser unpacks it, encodes with ffmpeg.wasm, and produces the final file. If the browser can't run ffmpeg.wasm (no SharedArrayBuffer, worker failure, timeout), it falls back to the existing server-side `/api/download` endpoint transparently.

All work happens on a new branch for easy reversion.

---

## 1. Binary Envelope Format

The server returns a single `application/octet-stream` response:

```
[4 bytes] metadata JSON length (uint32 LE)
[N bytes] metadata JSON (UTF-8)
[4 bytes] album art length (uint32 LE, 0 if none)
[N bytes] album art JPEG (if present)
[remaining] raw audio bytes
```

### Metadata JSON

```json
{
  "title": "...",
  "artist": "...",
  "album": "...",
  "albumArtist": "...",
  "genre": "...",
  "releaseDate": "...",
  "trackNumber": "3/10",
  "discNumber": "1/1",
  "isrc": "...",
  "label": "...",
  "copyright": "...",
  "lyrics": "...",
  "explicit": false,
  "catalogIds": { "adam": "...", "itunes": "..." },
  "sourceFormat": "flac",
  "sourceCodec": "flac",
  "sourceBitrate": 1411,
  "sampleRate": 44100,
  "bitDepth": 16
}
```

The client reads the lengths, slices the ArrayBuffer, and has everything needed for ffmpeg.wasm.

---

## 2. API Changes

### New: `POST /api/prepare`

- Same request body as `/api/download`: `{ url, format, genreSource }`
- Does everything the current download route does **except ffmpeg** — fetches audio, metadata, lyrics, album art, catalog IDs
- Returns the binary envelope
- Same rate limiting (30/min) and `maxDuration: 120`

### New: `POST /api/prepare-playlist`

- Same streaming JSON-lines pattern as `/api/download-playlist`
- Streams individual binary envelopes per track instead of a final zip:

```
{"type":"start","total":12}
{"type":"track","index":0,"size":8542310}
[binary envelope for track 0]
{"type":"track","index":1,"size":7231044}
[binary envelope for track 1]
...
{"type":"done"}
```

- Client receives each envelope, queues for ffmpeg.wasm, zips with fflate client-side

### Unchanged

- `/api/download` — server-side fallback, no code changes
- `/api/download-playlist` — server-side fallback, no code changes
- `/api/metadata`, `/api/search`, `/api/trending`, `/api/health` — unchanged

---

## 3. Client-Side ffmpeg.wasm Worker

### Web Worker: `src/workers/ffmpeg-worker.ts`

Runs in a dedicated Web Worker to keep the UI thread free.

**Responsibilities:**
- Load and initialize ffmpeg.wasm (once, reused across tracks)
- Receive unpacked envelope data (raw audio + metadata + art) via `postMessage`
- Build ffmpeg args (same flags as server: codec, metadata tags, album art, disposition)
- Run ffmpeg, return the finished file buffer
- Report progress back to main thread

**Codec support (identical to server):**
- MP3: `-c:a libmp3lame -b:a 320k`
- FLAC: `-c:a flac` (or `-c:a copy` if source is already FLAC)
- ALAC: `-c:a alac`

**WASM loading strategy:**
- Self-host ffmpeg core + wasm files in `/public/ffmpeg/`
- Lazy-load on first download (not on page load)
- Cache in worker after first load — subsequent tracks skip initialization

**Worker messages (Worker -> Main):**

```typescript
{ type: "loading" }           // ffmpeg.wasm initializing
{ type: "ready" }             // wasm loaded
{ type: "progress", percent } // encoding progress
{ type: "complete", buffer }  // finished file
{ type: "error", message }    // encoding failed
```

---

## 4. Auto-Fallback Logic

### Capability detection (on page load, non-blocking)

1. Check `SharedArrayBuffer` support (required by ffmpeg.wasm multi-thread)
2. Check Web Worker support
3. Store result: `canUseClientFFmpeg = true | false`

### Per-download fallback chain

```
1. If canUseClientFFmpeg:
   a. Call /api/prepare (or /api/prepare-playlist)
   b. Unpack envelope, send to ffmpeg worker
   c. If worker errors OR times out (60s per track):
      -> Retry once via /api/download (server fallback)
2. If !canUseClientFFmpeg:
   -> Call /api/download directly (current behavior)
```

No user-facing toggle. For playlists, fallback is per-track — one track failing client-side doesn't send the whole playlist to the server.

---

## 5. UI Changes

Minimal visual changes. Same Catppuccin theme, animations, layout. Same state machine (`idle -> fetching -> ready -> downloading -> done -> error`). Use frontend-design skill when implementing.

### Single track

More granular progress during `downloading` state:
- "Fetching audio..." (while calling `/api/prepare`)
- "Converting..." (while ffmpeg.wasm runs, with percent)
- "Converting on server..." (if fallback triggers)
- "Done" (same as current)

### Playlist

- Same per-track status indicators (pending/downloading/done/error)
- Each track shows its phase (fetching/converting)
- Zip creation client-side with fflate after all tracks encoded
- Progress: "Downloading 3/12... Converting 1/12..."

---

## 6. Playlist Client-Side Flow

### Processing pipeline

1. Call `POST /api/prepare-playlist`
2. Parse streaming response:
   - On `{"type":"track", index, size}`: read next `size` bytes as binary envelope
   - Unpack envelope into raw audio + metadata + art
   - Queue for ffmpeg worker
3. Process tracks sequentially in the worker (one at a time to manage memory)
4. Store each finished file buffer in memory
5. After all tracks processed (or failed):
   - Zip with `fflate.zipSync()` (level 0, no compression)
   - Trigger download via blob URL
6. Per-track fallback: if ffmpeg.wasm fails on a track, re-request via `/api/download`

### Memory

Each track buffer lives in memory until zip creation. 50 tracks at ~10MB each = ~500MB. Fine for desktop, could be tight on mobile. Existing 200-track server limit stays.

---

## 7. What Stays Server-Side (No Changes)

- All of `src/lib/` — audio-sources, spotify, deezer, tidal, youtube, lyrics, itunes, resolve-track, etc.
- `/api/download` and `/api/download-playlist` — untouched fallback
- Rate limiting — same limits, applied to new endpoints too
- Semaphore — stays for fallback route
- Docker/ffmpeg install — stays for fallback
- Health check — stays

The new `/api/prepare` and `/api/prepare-playlist` routes share existing `resolve-track.ts` and audio-fetching code — they just stop before the ffmpeg step and bundle the raw output.

---

## 8. New Dependencies

- `@ffmpeg/ffmpeg` — ffmpeg.wasm core
- `@ffmpeg/util` — helper utilities for file I/O

Self-hosted WASM files in `/public/ffmpeg/` (~30MB, cached aggressively by the browser).

---

## 9. Required Headers

ffmpeg.wasm requires `SharedArrayBuffer`, which needs:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers must be set on the app pages (not the API routes). Verify no third-party embeds break.

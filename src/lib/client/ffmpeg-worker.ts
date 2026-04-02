/**
 * Web Worker: loads ffmpeg.wasm, encodes audio, embeds metadata,
 * and handles M4A post-processing (explicit tag + iTunes catalog IDs).
 *
 * Receives: { type: "encode", id, audio, albumArt, metadata, outputFormat }
 * Posts back: { type: "complete", id, buffer } | { type: "error", id, message }
 *             { type: "progress", id, phase, ratio } during loading/encoding
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { EnvelopeMetadata } from "./envelope";

// ─── FFmpeg singleton ────────────────────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    self.postMessage({ type: "progress", phase: "loading", ratio: 0 });

    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      const timeMatch = message.match(/time=(\d+):(\d+):([\d.]+)/);
      if (timeMatch) {
        self.postMessage({ type: "progress", phase: "encoding", ratio: -1 });
      }
    });

    // @ffmpeg/core v0.12.x: only coreURL + wasmURL (no workerURL)
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });

    self.postMessage({ type: "progress", phase: "ready", ratio: 1 });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

// ─── ffmpeg args builder ─────────────────────────────────────────────────────

export function buildFfmpegArgs(
  inputFile: string,
  outputFile: string,
  metadata: EnvelopeMetadata,
  outputFormat: "mp3" | "flac" | "alac",
  hasArt: boolean,
): string[] {
  const args: string[] = [];

  args.push("-i", inputFile);
  if (hasArt) {
    args.push("-i", "cover.jpg", "-map", "0:a", "-map", "1:0");
  }

  if (outputFormat === "alac") {
    args.push("-c:a", "alac");
    if (hasArt) {
      args.push("-c:v", "copy", "-disposition:v", "attached_pic");
    }
  } else if (outputFormat === "flac") {
    if (metadata.sourceCodec === "flac" || metadata.sourceFormat === "flac") {
      args.push("-c:a", "copy");
    } else {
      args.push("-c:a", "flac");
    }
    if (hasArt) {
      args.push("-c:v", "copy", "-disposition:v", "attached_pic");
    }
  } else {
    // MP3 output
    const isMp3Source =
      metadata.sourceFormat === "mp3" || metadata.sourceCodec === "mp3";
    const is320k = metadata.sourceBitrate >= 315;
    if (isMp3Source && is320k) {
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
  args.push(
    "-metadata", `title=${metadata.title}`,
    "-metadata", `artist=${metadata.artist}`,
    "-metadata", `album=${metadata.album}`,
  );
  if (metadata.albumArtist) {
    args.push("-metadata", `album_artist=${metadata.albumArtist}`);
  }
  if (metadata.genre) {
    args.push("-metadata", `genre=${metadata.genre}`);
  }
  if (metadata.releaseDate) {
    args.push("-metadata", `date=${metadata.releaseDate}`);
  }
  if (metadata.trackNumber != null) {
    args.push("-metadata", `track=${metadata.trackNumber}`);
  }
  if (metadata.discNumber != null) {
    args.push("-metadata", `disc=${metadata.discNumber}`);
  }
  if (metadata.isrc) {
    if (outputFormat === "alac" || outputFormat === "flac") {
      args.push("-metadata", `ISRC=${metadata.isrc}`);
    } else {
      args.push("-metadata", `TSRC=${metadata.isrc}`);
    }
  }
  if (metadata.label) {
    args.push("-metadata", `label=${metadata.label}`);
  }
  if (metadata.copyright) {
    args.push("-metadata", `copyright=${metadata.copyright}`);
  }
  if (metadata.lyrics) {
    const plainLyrics = metadata.lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim();
    args.push("-metadata", `lyrics=${plainLyrics}`);
  }
  if (outputFormat === "alac" || outputFormat === "flac") {
    const bitDepth = metadata.bitDepth ?? 16;
    const sampleRate = metadata.sampleRate ?? 44100;
    const codec = outputFormat === "alac" ? "ALAC" : "FLAC";
    args.push(
      "-metadata",
      `comment=Lossless (${codec} ${bitDepth}bit/${(sampleRate / 1000).toFixed(1)}kHz)`,
    );
  }

  args.push("-y", outputFile);
  return args;
}

// ─── MP4 atom helpers (client-side, DataView-based) ─────────────────────────

interface AtomInfo {
  offset: number;
  size: number;
}

function findAtom(
  view: DataView,
  name: string,
  start: number,
  end: number,
): AtomInfo | null {
  let pos = start;
  const n0 = name.charCodeAt(0);
  const n1 = name.charCodeAt(1);
  const n2 = name.charCodeAt(2);
  const n3 = name.charCodeAt(3);

  while (pos + 8 <= end) {
    const size = view.getUint32(pos, false);
    if (size < 8) return null;

    if (
      view.getUint8(pos + 4) === n0 &&
      view.getUint8(pos + 5) === n1 &&
      view.getUint8(pos + 6) === n2 &&
      view.getUint8(pos + 7) === n3
    ) {
      return { offset: pos, size };
    }
    pos += size;
  }
  return null;
}

function findAtomPath(view: DataView, path: string[]): AtomInfo | null {
  let searchStart = 0;
  let searchEnd = view.byteLength;
  let result: AtomInfo | null = null;

  for (const name of path) {
    const found = findAtom(view, name, searchStart, searchEnd);
    if (!found) return null;
    result = found;
    const headerSize = name === "meta" ? 12 : 8;
    searchStart = found.offset + headerSize;
    searchEnd = found.offset + found.size;
  }

  return result;
}

function updateAtomSizes(
  buf: Uint8Array,
  path: string[],
  growth: number,
): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let searchStart = 0;
  let searchEnd = buf.byteLength;

  for (const name of path) {
    const found = findAtom(view, name, searchStart, searchEnd);
    if (!found) return;

    view.setUint32(found.offset, found.size + growth, false);
    const headerSize = name === "meta" ? 12 : 8;
    searchStart = found.offset + headerSize;
    searchEnd = found.offset + found.size + growth;
  }
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.byteLength;
  }
  return out;
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function writeAscii(buf: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i) & 0xff;
  }
}

// ─── setExplicitTagClient ─────────────────────────────────────────────────────

/**
 * Inserts an rtng (advisory) atom into the ilst of an M4A buffer.
 * Client-side port of server mp4-advisory.ts using Uint8Array + DataView.
 * rtng atom is 25 bytes total.
 */
export function setExplicitTagClient(input: Uint8Array): Uint8Array {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const ilstInfo = findAtomPath(view, ["moov", "udta", "meta", "ilst"]);
  if (!ilstInfo) return input;

  // data atom: 4 size + 4 "data" + 4 type (21=integer) + 4 locale + 1 value = 17 bytes
  const dataAtom = new Uint8Array(17);
  writeUint32BE(dataAtom, 0, 17);
  writeAscii(dataAtom, 4, "data");
  writeUint32BE(dataAtom, 8, 21); // type: integer
  writeUint32BE(dataAtom, 12, 0); // locale
  dataAtom[16] = 1; // 1 = explicit

  // rtng wrapper: 4 size + 4 "rtng" + data atom = 25 bytes
  const rtngAtom = new Uint8Array(8 + dataAtom.byteLength);
  writeUint32BE(rtngAtom, 0, rtngAtom.byteLength);
  writeAscii(rtngAtom, 4, "rtng");
  rtngAtom.set(dataAtom, 8);

  const ilstEnd = ilstInfo.offset + ilstInfo.size;
  const before = input.subarray(0, ilstEnd);
  const after = input.subarray(ilstEnd);
  const result = concatUint8Arrays(before, rtngAtom, after);

  updateAtomSizes(result, ["moov", "udta", "meta", "ilst"], rtngAtom.byteLength);
  return result;
}

// ─── setCatalogIdsClient ──────────────────────────────────────────────────────

interface CatalogIds {
  trackId: number;
  collectionId: number;
  artistId: number;
  genreId: number;
}

/**
 * Inserts cnID, plID, atID, geID atoms into the ilst of an M4A buffer.
 * Client-side port of server mp4-catalog.ts. Each wrapper atom is 32 bytes.
 */
export function setCatalogIdsClient(
  input: Uint8Array,
  ids: CatalogIds,
): Uint8Array {
  const entries: { name: string; value: number }[] = [];
  if (ids.trackId) entries.push({ name: "cnID", value: ids.trackId });
  if (ids.collectionId) entries.push({ name: "plID", value: ids.collectionId });
  if (ids.artistId) entries.push({ name: "atID", value: ids.artistId });
  if (ids.genreId) entries.push({ name: "geID", value: ids.genreId });

  if (entries.length === 0) return input;

  const atomBuffers = entries.map(({ name, value }) => {
    // data atom: 4 size + 4 "data" + 4 type (21) + 4 locale + 4 value (BE) = 20 bytes
    // server allocates 24 bytes (extra 4 at end, zero-padded), wrapper = 32 bytes total
    const dataAtom = new Uint8Array(24);
    writeUint32BE(dataAtom, 0, 24);
    writeAscii(dataAtom, 4, "data");
    writeUint32BE(dataAtom, 8, 21);  // type: integer
    writeUint32BE(dataAtom, 12, 0);  // locale
    writeUint32BE(dataAtom, 16, value); // 32-bit catalog ID

    const wrapper = new Uint8Array(8 + dataAtom.byteLength);
    writeUint32BE(wrapper, 0, wrapper.byteLength);
    writeAscii(wrapper, 4, name);
    wrapper.set(dataAtom, 8);
    return wrapper;
  });

  const insertBlock = concatUint8Arrays(...atomBuffers);

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const ilstInfo = findAtomPath(view, ["moov", "udta", "meta", "ilst"]);
  if (!ilstInfo) return input;

  const ilstEnd = ilstInfo.offset + ilstInfo.size;
  const before = input.subarray(0, ilstEnd);
  const after = input.subarray(ilstEnd);
  const result = concatUint8Arrays(before, insertBlock, after);

  updateAtomSizes(result, ["moov", "udta", "meta", "ilst"], insertBlock.byteLength);
  return result;
}

// ─── Message handler ─────────────────────────────────────────────────────────

interface EncodeMessage {
  type: "encode";
  id: string;
  audio: Uint8Array;
  albumArt: Uint8Array | null;
  metadata: EnvelopeMetadata;
  outputFormat: "mp3" | "flac" | "alac";
}

self.onmessage = async (event: MessageEvent<EncodeMessage>) => {
  const msg = event.data;
  if (msg.type !== "encode") return;

  const { id, audio, albumArt, metadata, outputFormat } = msg;

  try {
    const ffmpeg = await getFFmpeg();

    // Determine input/output extensions
    const srcFmt = metadata.sourceFormat?.toLowerCase() ?? "mp3";
    const inputExt =
      srcFmt === "webm" ? "webm" : srcFmt === "flac" ? "flac" : "mp3";
    const inputFile = `input.${inputExt}`;
    const outputExt =
      outputFormat === "alac" ? "m4a" : outputFormat === "flac" ? "flac" : "mp3";
    const outputFile = `output.${outputExt}`;

    // Write audio to virtual FS
    await ffmpeg.writeFile(inputFile, audio);

    let hasArt = false;
    if (albumArt && albumArt.byteLength > 0) {
      await ffmpeg.writeFile("cover.jpg", albumArt);
      hasArt = true;
    }

    // Build and run ffmpeg
    const args = buildFfmpegArgs(inputFile, outputFile, metadata, outputFormat, hasArt);
    await ffmpeg.exec(args);

    // Read output from virtual FS
    const outputData = await ffmpeg.readFile(outputFile);
    let result: Uint8Array =
      outputData instanceof Uint8Array
        ? outputData
        : new TextEncoder().encode(outputData as string);

    // Cleanup virtual FS
    try { await ffmpeg.deleteFile(inputFile); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputFile); } catch { /* ignore */ }
    if (hasArt) {
      try { await ffmpeg.deleteFile("cover.jpg"); } catch { /* ignore */ }
    }

    // M4A post-processing: explicit advisory tag + iTunes catalog IDs
    if (outputExt === "m4a") {
      if (metadata.explicit) {
        result = setExplicitTagClient(result);
      }
      if (metadata.catalogIds) {
        result = setCatalogIdsClient(result, metadata.catalogIds);
      }
    }

    // Transfer buffer to main thread (zero-copy)
    const transferable = result.buffer;
    (self as unknown as Worker).postMessage(
      { type: "complete", id, buffer: transferable },
      [transferable],
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ffmpeg encoding failed";
    self.postMessage({ type: "error", id, message });
  }
};

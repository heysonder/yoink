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

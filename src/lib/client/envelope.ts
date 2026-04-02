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

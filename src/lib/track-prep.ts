import { lookupItunesGenre, lookupItunesCatalogIds } from "./itunes";
import { fetchBestAudio } from "./audio-sources";
import { fetchLyrics } from "./lyrics";
import type { TrackInfo } from "./spotify";

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

export function isAllowedExternalUrl(url: string, allowedHosts: string[] = ALLOWED_ART_HOSTS): boolean {
  try {
    const parsed = new URL(url);
    return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function stripTimedLyrics(lyrics: string): string {
  return lyrics.replace(/^\[[\d:.]+\]\s*/gm, "").trim();
}

export async function fetchAlbumArtBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !isAllowedExternalUrl(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

interface TrackPrepOptions {
  requestedFormat?: string;
  genreSource?: string;
  syncedLyrics?: boolean;
}

export async function prepareTrackAssets(track: TrackInfo, options: TrackPrepOptions = {}) {
  const { requestedFormat, genreSource, syncedLyrics = false } = options;
  const preferLossless = requestedFormat === "flac" || requestedFormat === "alac";

  if (genreSource === "itunes") {
    const itunesGenre = await lookupItunesGenre(track);
    if (itunesGenre) track.genre = itunesGenre;
  }

  const [audio, lyrics, catalogIds, artBuffer] = await Promise.all([
    fetchBestAudio(track, preferLossless),
    fetchLyrics(track.artist, track.name),
    lookupItunesCatalogIds(track),
    fetchAlbumArtBuffer(track.albumArt),
  ]);

  return {
    audio,
    catalogIds,
    artBuffer,
    embeddedLyrics: lyrics ? (syncedLyrics ? lyrics : stripTimedLyrics(lyrics)) : null,
  };
}

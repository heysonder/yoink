/**
 * Shared track resolution logic used by both /api/metadata and /api/download.
 *
 * Resolution chains:
 *   Spotify:     Spotify API → Song.link/Deezer → oEmbed parse → Deezer search → iTunes search
 *   Apple Music: iTunes lookup by ID → Song.link/Deezer → Spotify API
 *   YouTube:     Song.link cross-ref → Deezer/iTunes search by parsed title+artist → Piped fallback
 */

import { getTrackInfo, detectPlatform, extractYouTubeId, extractPlaylistId, extractAlbumId, extractTrackId, type TrackInfo, type PlaylistInfo } from "./spotify";
import { getYouTubeTrackInfo } from "./youtube";
import { resolveToSpotify } from "./songlink";
import { fetchDeezerTrackMetadata, lookupDeezerByIsrc } from "./deezer";
import { searchItunesTrack, extractAppleMusicTrackId, lookupByItunesId } from "./itunes";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const cache = new Map<string, { track: TrackInfo; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

export function getCached(key: string): TrackInfo | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.track;
  return null;
}

export function setCache(key: string, track: TrackInfo) {
  cache.set(key, { track, ts: Date.now() });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL) cache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Concurrency limiter for Spotify requests
// ---------------------------------------------------------------------------
let inFlight = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 15;

async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function findSpotifyImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const isSpotifyImage = value.includes("spotifycdn.com/image/") || value.includes("i.scdn.co/image/");
    if (value.startsWith("https://") && isSpotifyImage) return value;
    return null;
  }

  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSpotifyImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findSpotifyImageUrl(nested);
    if (found) return found;
  }

  return null;
}

/**
 * Scrape album name from the regular Spotify track page's og:description.
 * Format: "Artist · Album · Song · Year"
 */
async function scrapeSpotifyAlbumName(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/track/${trackId}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // og:description format: "Artist · Album · Song · Year"
    const ogMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
      || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
    if (ogMatch) {
      const parts = ogMatch[1].split(" · ");
      // Format is: Artist · Album · Song/Type · Year
      if (parts.length >= 3) {
        const albumName = parts[1].trim();
        if (albumName) {
          console.log("[resolve] scraped album name from og:description:", albumName);
          return albumName;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function scrapeSpotifyTrack(url: string): Promise<TrackInfo | null> {
  const trackId = extractTrackId(url);
  if (!trackId) return null;

  try {
    // Fetch embed page (for track metadata) and regular page (for album name) in parallel
    const [embedRes, albumName] = await Promise.all([
      fetch(`https://open.spotify.com/embed/track/${trackId}`, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
      }),
      scrapeSpotifyAlbumName(trackId),
    ]);
    if (!embedRes.ok) return null;

    const html = await embedRes.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    const nextData = JSON.parse(nextDataMatch[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity;
    if (!entity || entity.type !== "track") return null;

    const name = typeof entity.title === "string" && entity.title.trim()
      ? entity.title.trim()
      : (typeof entity.name === "string" ? entity.name.trim() : "");

    const artist = Array.isArray(entity.artists)
      ? entity.artists
          .map((a: { name?: unknown }) => (typeof a?.name === "string" ? a.name.trim() : ""))
          .filter(Boolean)
          .join(", ")
      : "";

    if (!name || !artist) return null;

    const durationMs = typeof entity.duration === "number" ? entity.duration : 0;
    const releaseDate = typeof entity.releaseDate?.isoString === "string"
      ? entity.releaseDate.isoString.split("T")[0]
      : null;
    const albumArt = findSpotifyImageUrl(entity) || "";

    console.log("[resolve] fallback scrape from Spotify embed:", artist, "-", name, albumName ? `(album: ${albumName})` : "(no album)");

    return {
      name,
      artist,
      albumArtist: artist,
      album: albumName || name,
      albumArt,
      duration: formatDuration(durationMs),
      durationMs,
      isrc: null,
      genre: null,
      releaseDate,
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
      explicit: Boolean(entity.isExplicit),
      trackNumber: null,
      discNumber: null,
      label: null,
      copyright: null,
      totalTracks: null,
    };
  } catch (e) {
    console.log("[resolve] Spotify embed scrape failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Parse "Artist - Title", "Title by Artist", or just "Title" */
function parseOembedTitle(raw: string): { artist: string | null; title: string } {
  const dashMatch = raw.match(/^(.+?)\s*[-–—]\s*(.+?)(?:\s*[\[(].*)?$/);
  if (dashMatch) return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
  const byMatch = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { artist: byMatch[2].trim(), title: byMatch[1].trim() };
  return { artist: null, title: raw.trim() };
}

/** Score-based Deezer result picker */
function pickBestDeezerMatch(
  results: { id: number; title: string; artist: { name: string }; album?: { title: string } }[] | undefined,
  title: string,
  artist: string | null,
  album?: string | null,
): { id: number } | null {
  if (!results?.length) return null;
  const nt = normalize(title);
  const na = artist ? normalize(artist) : null;
  const nAlbum = album ? normalize(album) : null;
  let best = results[0];
  let bestScore = -1;
  for (const r of results) {
    let s = 0;
    const rt = normalize(r.title);
    const ra = normalize(r.artist.name);
    if (rt === nt) s += 3; else if (rt.includes(nt) || nt.includes(rt)) s += 1;
    if (na) { if (ra === na) s += 3; else if (ra.includes(na) || na.includes(ra)) s += 1; }
    // Album match is a strong disambiguator for same-name tracks
    if (nAlbum && r.album?.title) {
      const rAlbum = normalize(r.album.title);
      if (rAlbum === nAlbum) s += 4;
      else if (rAlbum.includes(nAlbum) || nAlbum.includes(rAlbum)) s += 2;
    }
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Try Spotify Web API (client credentials).
 * NOTE: Spotify now requires premium for track lookups.
 * We cache the 403 status to avoid wasting time on every request.
 */
let spotifyApiBroken = false;
let spotifyApiLastCheck = 0;
const SPOTIFY_API_RECHECK_MS = 30 * 60 * 1000; // re-check every 30 min

async function trySpotifyApi(url: string): Promise<TrackInfo | null> {
  // Skip entirely if we know Spotify API is 403
  if (spotifyApiBroken && Date.now() - spotifyApiLastCheck < SPOTIFY_API_RECHECK_MS) {
    return null;
  }

  try {
    const result = await withLimit(() => getTrackInfo(url));
    spotifyApiBroken = false; // it worked!
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("403")) {
      spotifyApiBroken = true;
      spotifyApiLastCheck = Date.now();
      console.log("[resolve] Spotify API requires premium — skipping for 30min");
    } else {
      console.log("[resolve] Spotify API failed:", msg);
    }
    return null;
  }
}

/** oEmbed → parsed artist + title. If no artist from oEmbed, scrape embed page. */
async function resolveOembed(url: string): Promise<{ artist: string | null; title: string } | null> {
  let result: { artist: string | null; title: string } | null = null;

  // Step 1: Try oEmbed API
  result = await withLimit(async () => {
    for (const base of ["https://embed.spotify.com/oembed/", "https://open.spotify.com/oembed"]) {
      try {
        const res = await fetch(`${base}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const o = await res.json();
          const raw = o.title || o.html?.match(/title="Spotify Embed: ([^"]+)"/)?.[1];
          if (raw) {
            const parsed = parseOembedTitle(raw);
            console.log("[oembed] parsed:", JSON.stringify(parsed));
            return parsed;
          }
        }
      } catch { /* next */ }
    }
    return null;
  });

  // Step 2: If we got a title but no artist, scrape the embed page for artist info
  // The embed page contains inline JSON with full track metadata including artists array
  if (result && !result.artist) {
    const trackId = extractTrackId(url);
    if (trackId) {
      try {
        const embedRes = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
        });
        if (embedRes.ok) {
          const html = await embedRes.text();

          // Primary: parse __NEXT_DATA__ JSON payload from embed page
          const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
          if (nextDataMatch) {
            try {
              const nextData = JSON.parse(nextDataMatch[1]);
              const entity = nextData?.props?.pageProps?.state?.data?.entity;
              if (entity) {
                const names = Array.isArray(entity.artists)
                  ? entity.artists
                      .map((a: { name?: unknown }) => (typeof a?.name === "string" ? a.name.trim() : ""))
                      .filter(Boolean)
                  : [];

                if (names.length > 0) {
                  result.artist = names.join(", ");
                  console.log("[oembed] scraped artist from NEXT_DATA:", result.artist);
                }

                const entityTitle = typeof entity.title === "string" && entity.title.trim()
                  ? entity.title.trim()
                  : (typeof entity.name === "string" ? entity.name.trim() : "");

                if (entityTitle) {
                  result.title = entityTitle;
                }
              }
            } catch {
              // Continue to regex fallback
            }
          }

          // Fallback: parse inline JSON with "artists":[{"name":"..."}]
          const jsonMatch = html.match(/"artists"\s*:\s*\[(\{[^\]]+)\]/);
          if (!result.artist && jsonMatch) {
            try {
              const artists = JSON.parse(`[${jsonMatch[1]}]`);
              const names = artists
                .map((a: { name?: string }) => a.name)
                .filter(Boolean);
              if (names.length > 0) {
                result.artist = names.join(", ");
                console.log("[oembed] scraped artist from embed JSON:", result.artist);
              }
            } catch { /* JSON parse failed */ }
          }

          // Fallback: og:title "TITLE - song and lyrics by ARTIST | Spotify"
          if (!result.artist) {
            const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
              || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);
            if (titleMatch) {
              const byMatch = titleMatch[1].match(/(?:song and lyrics by|by)\s+(.+?)(?:\s*\||\s*$)/i);
              if (byMatch) {
                result.artist = byMatch[1].trim();
                console.log("[oembed] scraped artist from og:title:", result.artist);
              }
            }
          }
        }
      } catch {
        // scraping failed, continue without artist
      }
    }
  }

  return result;
}

/**
 * Search MusicBrainz by title + artist → get ISRC → look up Deezer by ISRC.
 * MusicBrainz is free, no auth, excellent metadata. Rate limit: 1 req/s with User-Agent.
 */
async function searchMusicBrainz(title: string, artist: string | null): Promise<TrackInfo | null> {
  try {
    const q = artist
      ? `recording:"${title}" AND artist:"${artist}"`
      : `recording:"${title}"`;
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=3`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Yoink/1.0 (music downloader)" },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const recordings = data.recordings;
    if (!recordings?.length) return null;

    // Find best match with an ISRC
    for (const rec of recordings) {
      const isrcs: string[] = rec.isrcs || [];
      if (isrcs.length === 0) continue;

      // Try each ISRC on Deezer (fast, free, no auth)
      for (const isrc of isrcs) {
        const deezerId = await lookupDeezerByIsrc(isrc);
        if (deezerId) {
          const meta = await fetchDeezerTrackMetadata(deezerId);
          if (meta) {
            console.log("[resolve] MusicBrainz ISRC→Deezer:", meta.artist, "-", meta.name, `(ISRC: ${isrc})`);
            return { ...meta, spotifyUrl: "", label: null, copyright: null } as TrackInfo;
          }
        }
      }

      // If no Deezer match via ISRC, build TrackInfo from MusicBrainz data + iTunes
      const mbArtist = rec["artist-credit"]?.[0]?.name || artist || "Unknown";
      const mbTitle = rec.title || title;
      const itunesResult = await searchItunesTrack(mbArtist, mbTitle);
      if (itunesResult) {
        // Attach ISRC from MusicBrainz if iTunes didn't have one
        if (!itunesResult.isrc && isrcs[0]) itunesResult.isrc = isrcs[0];
        console.log("[resolve] MusicBrainz→iTunes:", itunesResult.artist, "-", itunesResult.name);
        return itunesResult;
      }
    }
  } catch (e) {
    console.log("[resolve] MusicBrainz failed:", e instanceof Error ? e.message : e);
  }
  return null;
}

/** Search Deezer with structured artist/title query + scoring. */
export async function searchDeezerStructured(title: string, artist: string | null, album?: string | null): Promise<TrackInfo | null> {
  try {
    let q = artist ? `artist:"${artist}" track:"${title}"` : title;
    // Include album in query when available to help Deezer return the right version
    if (album) q += ` album:"${album}"`;
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let match = pickBestDeezerMatch(data.data, title, artist, album);

    // If album query returned no results, retry without album constraint
    if (!match && album) {
      const fallbackQ = artist ? `artist:"${artist}" track:"${title}"` : title;
      const fallbackRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(fallbackQ)}&limit=10`, {
        signal: AbortSignal.timeout(8000),
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        match = pickBestDeezerMatch(fallbackData.data, title, artist, album);
      }
    }

    if (match) {
      const meta = await fetchDeezerTrackMetadata(String(match.id));
      if (meta) {
        console.log("[resolve] Deezer search:", meta.artist, "-", meta.name, meta.album ? `(album: ${meta.album})` : "");
        return { ...meta, spotifyUrl: "", label: null, copyright: null } as TrackInfo;
      }
    }
  } catch { /* continue */ }
  return null;
}

// ---------------------------------------------------------------------------
// Public resolvers
// ---------------------------------------------------------------------------

/** Resolve a Spotify track URL → full TrackInfo. */
export async function resolveSpotifyTrack(url: string): Promise<TrackInfo | null> {
  // 1. Spotify API (client credentials) — best source, gives ISRC
  const spotify = await trySpotifyApi(url);
  if (spotify) return spotify;

  // 2. Song.link → Deezer ID (ID-based, no name confusion)
  try {
    const resolved = await resolveToSpotify(url);
    if (resolved?.deezerId) {
      const dz = await fetchDeezerTrackMetadata(resolved.deezerId);
      if (dz) {
        console.log("[resolve] Deezer via song.link:", dz.artist, "-", dz.name);
        return { ...dz, spotifyUrl: url, label: null, copyright: null } as TrackInfo;
      }
    }
  } catch { /* continue */ }

  // 3. Scrape Spotify embed + regular page to get album context for disambiguation.
  //    The embed has title/artist/duration, the regular page's og:description has album name.
  const scraped = await scrapeSpotifyTrack(url);

  // Use scraped album context for disambiguation in name-based searches
  const albumContext = scraped?.album && scraped.album !== scraped.name ? scraped.album : null;

  // 4. oEmbed → structured search (with album context from scrape)
  const oembed = await resolveOembed(url);
  if (oembed) {
    const { artist, title } = oembed;
    // Prefer album from scrape, which is more reliable
    const album = albumContext;

    if (artist) {
      const dz = await searchDeezerStructured(title, artist, album);
      if (dz) { dz.spotifyUrl = url; return dz; }

      const mb = await searchMusicBrainz(title, artist);
      if (mb) { mb.spotifyUrl = url; return mb; }
    } else {
      const dz = await searchDeezerStructured(title, null, album);
      if (dz) { dz.spotifyUrl = url; return dz; }
    }

    try {
      const itunes = await searchItunesTrack(artist || "", title, album);
      if (itunes) {
        console.log("[resolve] iTunes search:", itunes.artist, "-", itunes.name);
        return { ...itunes, spotifyUrl: url };
      }
    } catch { /* continue */ }
  }

  // 5. Return scraped embed data if we have it (better than nothing)
  if (scraped) {
    console.log("[resolve] using scraped embed data as final fallback");
    return scraped;
  }

  console.log("[resolve] all sources exhausted for Spotify URL:", url);
  return null;
}

/** Resolve an Apple Music URL → full TrackInfo. */
export async function resolveAppleMusicTrack(url: string): Promise<TrackInfo | null> {
  // 1. Direct iTunes lookup by ID (fast, reliable, no rate limit)
  const itunesId = extractAppleMusicTrackId(url);
  if (itunesId) {
    console.log("[resolve] iTunes lookup ID:", itunesId);
    const track = await lookupByItunesId(itunesId);
    if (track) {
      console.log("[resolve] iTunes lookup:", track.artist, "-", track.name);
      return track;
    }
  }

  // 2. Song.link → Deezer or Spotify
  const resolved = await resolveToSpotify(url);
  if (resolved?.deezerId) {
    const dz = await fetchDeezerTrackMetadata(resolved.deezerId);
    if (dz) {
      console.log("[resolve] Apple Music → Deezer via song.link:", dz.artist, "-", dz.name);
      return { ...dz, spotifyUrl: resolved.spotifyUrl || "", label: null, copyright: null } as TrackInfo;
    }
  }
  if (resolved?.spotifyUrl) {
    const spotify = await trySpotifyApi(resolved.spotifyUrl);
    if (spotify) return spotify;
  }

  return null;
}

/** Resolve a YouTube URL → full TrackInfo (always returns something). */
export async function resolveYouTubeTrack(videoId: string, url: string): Promise<TrackInfo> {
  const ytInfo = await getYouTubeTrackInfo(videoId);

  // Try cross-platform enrichment via Song.link
  const resolved = await resolveToSpotify(url);
  if (resolved?.deezerId) {
    const dz = await fetchDeezerTrackMetadata(resolved.deezerId);
    if (dz) {
      console.log("[resolve] YouTube enriched via Deezer:", dz.artist, "-", dz.name);
      return { ...dz, spotifyUrl: resolved.spotifyUrl || "", label: null, copyright: null } as TrackInfo;
    }
  }
  if (resolved?.spotifyUrl) {
    const spotify = await trySpotifyApi(resolved.spotifyUrl);
    if (spotify) return spotify;
  }

  // Enrich via Deezer/MusicBrainz/iTunes search using parsed YouTube title + artist
  if (ytInfo.artist && ytInfo.artist !== "Unknown Artist") {
    const dz = await searchDeezerStructured(ytInfo.name, ytInfo.artist);
    if (dz) return dz;

    const mb = await searchMusicBrainz(ytInfo.name, ytInfo.artist);
    if (mb) return mb;

    try {
      const itunes = await searchItunesTrack(ytInfo.artist, ytInfo.name);
      if (itunes) {
        console.log("[resolve] YouTube enriched via iTunes:", itunes.artist, "-", itunes.name);
        return itunes;
      }
    } catch { /* continue */ }
  }

  return ytInfo;
}

// ---------------------------------------------------------------------------
// Playlist/Album scraping from Spotify embed pages (no API key needed)
// ---------------------------------------------------------------------------

/**
 * Scrape track list from a Spotify embed page (playlist or album).
 * The embed page contains inline JSON with title, subtitle (artist),
 * duration, uri, and explicit flag for each track.
 */
async function scrapeSpotifyEmbed(type: "playlist" | "album", id: string): Promise<PlaylistInfo | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const tracks: TrackInfo[] = [];
    let name = "Unknown";
    let image = "";

    // Primary: parse __NEXT_DATA__ JSON payload (reliable, structured)
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const entity = nextData?.props?.pageProps?.state?.data?.entity;
        if (entity) {
          name = entity.name || name;
          image = findSpotifyImageUrl(entity) || "";

          const trackList = entity.trackList || entity.tracks || [];
          for (const t of trackList) {
            const trackIdMatch = typeof t.uri === "string" ? t.uri.match(/spotify:track:(.+)/) : null;
            const trackId = trackIdMatch ? trackIdMatch[1] : null;
            if (!trackId) continue;

            const title = typeof t.title === "string" ? t.title : "";
            const artist = typeof t.subtitle === "string" ? t.subtitle : "";
            const durationMs = typeof t.duration === "number" ? t.duration : 0;

            tracks.push({
              name: title,
              artist,
              albumArtist: null,
              album: type === "album" ? name : "",
              albumArt: "",
              duration: formatDuration(durationMs),
              durationMs,
              isrc: null,
              genre: null,
              releaseDate: null,
              spotifyUrl: `https://open.spotify.com/track/${trackId}`,
              explicit: Boolean(t.isExplicit),
              trackNumber: tracks.length + 1,
              discNumber: 1,
              label: null,
              copyright: null,
              totalTracks: null,
            });
          }
        }
      } catch { /* fall through to regex */ }
    }

    // Fallback: regex extraction for older embed formats
    if (tracks.length === 0) {
      const nameMatch = html.match(/"name":"([^"]+?)","uri":"spotify:(?:playlist|album):/);
      name = nameMatch ? nameMatch[1] : name;

      const trackPattern = /"uri":"spotify:track:([^"]+)","uid":"[^"]*","title":"([^"]*)","subtitle":"([^"]*)","isExplicit":(true|false),"isNineteenPlus":[^,]*,"duration":(\d+)/g;
      let m;
      while ((m = trackPattern.exec(html)) !== null) {
        const [, trackId, title, artist, explicit, durationStr] = m;
        const durationMs = parseInt(durationStr, 10);
        tracks.push({
          name: title,
          artist,
          albumArtist: null,
          album: type === "album" ? name : "",
          albumArt: "",
          duration: formatDuration(durationMs),
          durationMs,
          isrc: null,
          genre: null,
          releaseDate: null,
          spotifyUrl: `https://open.spotify.com/track/${trackId}`,
          explicit: explicit === "true",
          trackNumber: tracks.length + 1,
          discNumber: 1,
          label: null,
          copyright: null,
          totalTracks: null,
        });
      }
    }

    if (tracks.length === 0) return null;

    // Try to get album art from the page if not found in __NEXT_DATA__
    if (!image) {
      const artMatch = html.match(/"coverArt":\{"extractedColors"[^}]*\},"sources":\[\{"url":"([^"]+)"/);
      image = artMatch ? artMatch[1] : "";
    }

    console.log(`[resolve] scraped ${tracks.length} tracks from embed ${type}/${id}`);
    return { name, image, tracks };
  } catch (e) {
    console.log(`[resolve] embed scrape failed for ${type}/${id}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Resolve a Spotify playlist URL via embed scraping. */
export async function resolvePlaylist(url: string): Promise<PlaylistInfo | null> {
  const id = extractPlaylistId(url);
  if (!id) return null;
  return scrapeSpotifyEmbed("playlist", id);
}

/** Resolve a Spotify album URL via embed scraping. */
export async function resolveAlbum(url: string): Promise<PlaylistInfo | null> {
  const id = extractAlbumId(url);
  if (!id) return null;
  return scrapeSpotifyEmbed("album", id);
}

// ---------------------------------------------------------------------------
// Main resolvers
// ---------------------------------------------------------------------------

/** Main resolver — detects platform and dispatches to the right chain. */
export async function resolveTrack(url: string): Promise<{ track: TrackInfo; platform: string; youtubeVideoId?: string } | null> {
  const platform = detectPlatform(url);
  if (!platform) return null;

  let track: TrackInfo | null = null;
  let youtubeVideoId: string | undefined;

  if (platform === "apple-music") {
    track = await resolveAppleMusicTrack(url);
  } else if (platform === "youtube") {
    const vid = extractYouTubeId(url);
    if (!vid) return null;
    youtubeVideoId = vid;
    track = await resolveYouTubeTrack(vid, url);
  } else {
    track = await resolveSpotifyTrack(url);
  }

  if (!track) return null;
  return { track, platform, youtubeVideoId };
}

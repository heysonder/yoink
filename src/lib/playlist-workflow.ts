import {
  detectUrlType,
  getAlbumInfo,
  getArtistTopTracks,
  getPlaylistInfo,
  type PlaylistInfo,
  type TrackInfo,
} from "./spotify";
import {
  resolveAlbum,
  resolveArtist,
  resolvePlaylist,
  resolveSpotifyTrack,
  searchDeezerStructured,
} from "./resolve-track";

export async function loadPlaylistWithFallback(url: string, logPrefix: string): Promise<PlaylistInfo | null> {
  const urlType = detectUrlType(url);

  if (urlType === "album") {
    try {
      return await getAlbumInfo(url);
    } catch (error) {
      console.log(`${logPrefix} album API failed:`, error instanceof Error ? error.message : error);
      return resolveAlbum(url);
    }
  }

  if (urlType === "artist") {
    try {
      return await getArtistTopTracks(url);
    } catch (error) {
      console.log(`${logPrefix} artist API failed:`, error instanceof Error ? error.message : error);
      return resolveArtist(url);
    }
  }

  try {
    return await getPlaylistInfo(url);
  } catch (error) {
    console.log(`${logPrefix} playlist API failed:`, error instanceof Error ? error.message : error);
    return resolvePlaylist(url);
  }
}

export async function enrichPlaylistTracks(tracks: TrackInfo[], logPrefix: string): Promise<TrackInfo[]> {
  const needsEnrichment = tracks.some((track) => !track.isrc && !track.albumArt);
  if (!needsEnrichment) return tracks;

  console.log(`${logPrefix} enriching`, tracks.length, "scraped tracks with metadata");

  return Promise.all(
    tracks.map(async (track) => {
      if (track.isrc && track.albumArt) return track;

      try {
        if (track.spotifyUrl) {
          const resolved = await resolveSpotifyTrack(track.spotifyUrl);
          if (resolved) return { ...resolved, spotifyUrl: track.spotifyUrl };
        }

        const deezerTrack = await searchDeezerStructured(track.name, track.artist, track.album || null);
        if (deezerTrack) return { ...deezerTrack, spotifyUrl: track.spotifyUrl };
      } catch {
        // Keep the original scraped track when enrichment fails.
      }

      return track;
    })
  );
}

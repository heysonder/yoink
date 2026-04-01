# yoink

paste a spotify link. get the file.

**[yoinkify.com](https://yoinkify.com)**

## features

- **tracks, playlists, albums, artists** — paste a link, download everything
- **lossless** — flac, alac, or 320kbps mp3
- **full metadata** — id3v2/vorbis tags, album art, synced lyrics, genre, track numbers, explicit flags
- **apple music catalog matching** — ISRC codes, album artist, and itunes catalog ids embedded into m4a files so apple music recognizes your library
- **cross-platform links** — apple music and youtube links resolved automatically via song.link
- **search** — type a song name instead of pasting a link
- **multi-source audio** — waterfall pipeline across deezer, tidal, and youtube with automatic fallback
- **metadata fallback chain** — spotify, deezer, and itunes as metadata sources with automatic failover
- **no accounts** — no sign-up, no cookies, no data stored

## how it works

1. you paste a spotify (or apple music / youtube) link
2. yoink pulls metadata from spotify, with fallbacks to deezer and itunes
3. audio is sourced from the best available provider (deezer > tidal > youtube)
4. the file is tagged with full metadata, album art, and lyrics, then delivered to your browser

nothing is stored on the server after your request completes.

## stack

- [Next.js](https://nextjs.org) 16 (app router, turbopack)
- [Tailwind CSS](https://tailwindcss.com) 4
- [ffmpeg](https://ffmpeg.org) for conversion and metadata embedding
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) for metadata
- [Deezer](https://developers.deezer.com) for lossless audio and metadata fallback
- [Tidal](https://developer.tidal.com) for hi-res audio
- [Piped API](https://github.com/TeamPiped/Piped) for youtube audio
- [lrclib](https://lrclib.net) + [Musixmatch](https://www.musixmatch.com) for lyrics
- [Song.link](https://song.link) for cross-platform link resolution
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI) for genre data and catalog matching

## self-hosting

### docker (recommended)

```bash
git clone https://github.com/chasemarshall/yoink.git
cd yoink
cp .env.example .env
# fill in your env vars (see below)
docker compose up -d
```

yoink will be running on `http://localhost:3000`.

### local dev

```bash
git clone https://github.com/chasemarshall/yoink.git
cd yoink
npm install
cp .env.example .env.local
# fill in your env vars (see below)
npm run dev
```

requires [ffmpeg](https://ffmpeg.org/download.html) installed locally.

### env vars

| variable | required | description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | yes | spotify app client id ([create one](https://developer.spotify.com/dashboard)) |
| `SPOTIFY_CLIENT_SECRET` | yes | spotify app client secret |
| `PIPED_API_URL` | no | piped instance url (default: `pipedapi.kavin.rocks`) |
| `DEEZER_ARL` | no | deezer session cookie — enables lossless audio from deezer |
| `TIDAL_CLIENT_ID` | no | tidal app client id |
| `TIDAL_CLIENT_SECRET` | no | tidal app client secret |
| `TIDAL_ACCESS_TOKEN` | no | tidal access token — enables hi-res audio from tidal |
| `TIDAL_REFRESH_TOKEN` | no | tidal refresh token |
| `SONGLINK_ENABLED` | no | enable cross-platform link resolution (`true`/`false`) |
| `ACOUSTID_API_KEY` | no | audio fingerprinting for better source matching |
| `MUSIXMATCH_TOKEN` | no | musixmatch lyrics as fallback when lrclib misses |
| `LRCLIB_PROXY_URL` | no | cloudflare worker proxy for lrclib if direct access is blocked |

without the optional vars, yoink still works — it just uses youtube as the audio source and lrclib for lyrics.

## rate limits

default limits (per IP, in-memory):

- 30 downloads / minute
- 5 playlist downloads / minute (max 200 tracks per playlist)
- 15 searches / minute
- 10 metadata lookups / minute

self-hosted instances have no rate limits by default — adjust in `src/lib/ratelimit.ts`.

## attribution

if you fork or self-host yoink, a "powered by [yoink](https://yoinkify.com)" mention is appreciated but not required.

## license

[AGPL-3.0](LICENSE)

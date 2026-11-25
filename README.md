# Saad's BDIX — Nuvio Plugin

On-device Nuvio scrapers for mainstream BDIX movie and series providers. No backend, no proxy, no tunnel.

## Requirements

- **Full/sideloaded Nuvio build** (Play Store builds disable plugins).
- Internet access for public sites and TMDB metadata.
- For **DhakaFlix** (`172.16.50.7`, `.10`, `.12`, `.14`) and **WoW Movie Zone** (`172.27.27.84` / `172.27.27.239`), the device must be on the same LAN/VPN.

## Install

1. In Nuvio: **Settings → Content & Discovery → Plugins → Add Repository**.
2. Enter the repository URL (where this `manifest.json` is hosted, e.g. a `raw.githubusercontent.com` URL).
3. Enable the individual providers you want under the repository entry.
4. Search any movie/series in Nuvio and open its stream list.

If testing locally, run `node test/serve.js` and add `http://<your-pc-ip>:8787/manifest.json` as the repository URL. The device must be on the same LAN.

## Providers

| ID | Name | Types | Notes |
|----|------|-------|-------|
| `dhakaflix` | DhakaFlix | movie, tv | Multi-server h5ai library; all video folders; LAN/VPN required |
| `flixhub` | FlixHub | movie, tv | High-speed direct streams |
| `cineplex` | CinePlex | movie, tv | Freshly resolved signed links on every play |
| `cinemax24` | Cinemax24 | movie, tv | Strict TMDB-ID/title+year matching |
| `moviehaat` | MovieHaat | movie, tv | Direct CDN streams for movies and series |
| `ctghall` | CTGHall | movie, tv | Exact-TMDB movie and episode links |
| `wow-movie-zone` | WoW Movie Zone | movie, tv | Local-network direct files; LAN/VPN required |

CTGHall is a separate source from CTGMovies. DhakaFlix is a dedicated multi-server scraper covering `.7`, `.10`, `.12` and `.14`; `.4` is only the portal and `.8` is games/software, so both are excluded.

## Stream information

Every stream keeps the resolution in Nuvio's `quality` badge and shows the same key details in the visible stream `name`, for example:

- `Cinemax24 • 1080p • Hindi/English • Dual Audio • 2.8 GB` — title: `Vibe • ...`
- `MovieHaat • 4K • Korean/English/Hindi • Dual Audio • 3.8 GB` — title: `Seoul Vibe • ...`
- `WoW Movie Zone • 1080p • English • Dual Audio • WEB-DL` — title: `Possible Love • ...`

The full metadata string remains appended to `title`: language, audio type, file size, subtitles, source format, and codec tags are extracted from provider metadata or release filenames.

Each provider returns up to **5 unique streams** with accuracy enforced:

1. Exact TMDB ID or exact normalized title+year matches, regardless of language.
2. Same-title variants from the exact title (other qualities/languages/links).
3. Among exact matches: native/English first, then Hindi/dubbed, then other/dual-audio, using resolution and file size as tie-breakers.
4–5. Closest-title fallbacks only when at least two exact/same-title streams exist.

If a source has only one exact file and no same-title variants, the provider returns only that exact result. It never puts a closest/wrong title in row 2. Slots 4–5 may show a nearby/wrong title only after two accurate rows exist.

## How it works

Each provider implements `getStreams(tmdbId, mediaType, season, episode)`:

1. Nuvio injects `TMDB_API_KEY`; the plugin fetches the title, year, original language and IMDb ID (`external_ids`) from TMDB.
2. The provider searches with full titles, punctuation-stripped forms, dotted/underscored/escaped-space variants, short prefixes and (where useful) the IMDb ID.
3. All candidates are grouped by normalized title + year before detail pages are hydrated in parallel. Exact TMDB/IMDb/title+year matches are collected first; close-title fallbacks are considered only afterwards.
4. Broken links are skipped. Streams are ranked by exactness, language, resolution, dual-audio, file size and match score, with a cap per quality/host so five near-duplicates cannot crowd out variants.
5. Direct video URLs are returned as Nuvio stream objects with required headers, visible metadata-rich names, populated `size` metadata, and metadata-rich titles.

All scraper logic is bundled into standalone CommonJS files in `providers/`. The shared core (`src/core.js`) is concatenated into each generated provider by `build.js` so every provider is self-contained. An invisible sort prefix is included as a safeguard if Nuvio re-sorts stream rows visually; array order is still authoritative.

## Development

```bash
# Rebuild all provider bundles from src/
node build.js

# Syntax check (PowerShell)
foreach ($f in Get-ChildItem providers *.js) { node --check $f.FullName }

# Test public providers (uses live sites + mocked TMDB)
node test/test.js

# Test WoW Movie Zone too (only on its LAN)
$env:TEST_LOCAL=1; node test/test.js

# Serve manifest locally for Nuvio
node test/serve.js
```

### Source layout

```
manifest.json          # Nuvio repository manifest
src/core.js            # Shared helpers (fetch, matching, metadata, streams)
src/providers/*.js     # Per-provider source
build.js               # Bundles core + provider into providers/*.js
providers/*.js         # Generated bundles loaded by Nuvio
test/test.js           # Node test harness
test/serve.js          # Local static server for manifest
```

### Runtime constraints

The generated providers are QuickJS/Hermes-safe:

- Uses `fetch`, no Node-only APIs.
- No Node-only APIs (`Buffer`, Node timers, Cheerio); only `fetch`, `AbortController`, regex and JSON parsing.
- No Cheerio dependency — regex/JSON parsing only.
- Uses `globalThis.TMDB_API_KEY` for TMDB metadata.

## Notes

- Plugins provide streams only — no catalogs, favorites UI, or offline downloads.
- If a source is down, its provider simply returns no streams; other providers still work.
- CinePlex signed URLs expire, so they are resolved fresh on every search/play.
- WoW Movie Zone's built-in search endpoint is unreliable, so it crawls the gallery pages and matches titles locally.
- DhakaFlix queries all four h5ai roots in parallel, dedupes by file URL and accepts all video folders; it does not scrape the `.4` portal.
- Search terms include dotted, underscored and escaped-space forms to catch FTP-style filenames used by h5ai libraries.
- Private IP sources only work when the device shares the same LAN/VPN.

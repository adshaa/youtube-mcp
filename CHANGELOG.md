# Changelog

## 1.0.9 (2025-05-13)

- **New `get_video_frame` tool**: Capture screenshots from YouTube videos by timestamp.
  - Primary method: yt-dlp + ffmpeg-static for full-quality frames (up to 4K)
  - Automatic fallback: YouTube storyboards via sharp (max 320×180) when yt-dlp is not installed
  - Response includes method, resolution, and quality guidance
- **`plainText` option on `get_transcript`**: Returns full transcript as a single plain text string (no timestamps). Reduces context usage by ~70% compared to the default timestamped format.
- **Transcript caching**: Raw transcripts are cached in-memory for 10 minutes. Subsequent fetches with different options (plainText, chunking, timestamps) reuse the cached data — takes 0ms.
- **SponsorBlock integration**: Added `skipSponsor` parameter to `get_transcript` tool.
  - Fetches sponsor segment timestamps from SponsorBlock API (no auth needed)
  - Filters sponsored content from transcripts when enabled
  - Runs in parallel with transcript fetch (negligible latency)
- **Refactored transcript fetching**: Now uses yt-dlp instead of youtubei.js for reliable transcript extraction (youtubei.js `getTranscript()` API broke upstream). yt-dlp handles all YouTube API changes automatically.
- Updated `youtubei.js` to v17.0.1
- Added `ffmpeg-static` for bundled ffmpeg binary (no system ffmpeg required)
- Added `sharp` for storyboard image processing
- Added `scripts/e2e-test.mjs` for end-to-end MCP testing via stdio transport
- `prepublishOnly` now runs e2e tests before publish
- Updated test suite to 31 tests

## 1.0.8 (2025-01-XX)

- Added vitest test suite (30 tests covering services, tools, resources)
- Fixed fastmcp dependency to `^4.0.1` for compatibility with `@modelcontextprotocol/sdk@1.29.0`
- Updated dev tooling: switched from `ts-node` to `tsx` with `watch` mode for hot reload
- Removed unused dependencies (`cors`, `effect`, `ts-node`, `@types/cors`)
- Added `opencode.json` for local MCP server configuration
- Added `CHANGELOG.md`

## 1.0.7 (2025-01-XX)

- Added repository, homepage, bugs, and license metadata to `package.json`

## 1.0.5 (2025-01-XX)

- Added video search, channel search, and channel video listing tools
- Added `.cursor` to `.npmignore` for cleaner distribution

## 0.1.0 (2025-01-XX)

- Initial release: transcript retrieval tool via `get_transcript`

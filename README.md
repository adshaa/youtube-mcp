# @inlustris/youtube-mcp

**No-fuss YouTube MCP server — no API keys required!**

![NPM Version](https://img.shields.io/npm/v/@inlustris/youtube-mcp)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

A Model Context Protocol (MCP) server for YouTube transcripts, search, channels, screenshots, and sponsor-blocked transcripts. Built with [FastMCP](https://github.com/anomalyco/fastmcp) and [youtubei.js](https://github.com/LuanRT/YouTube.js).

## Features

- **Get transcripts** — fetch YouTube video transcripts with timestamps
- **Search videos** — search YouTube by keyword with sort options
- **Search channels** — find YouTube channels by name
- **Channel videos** — list all videos from a channel
- **Transcript chunking** — split by character size or silence gaps
- **SponsorBlock integration** — optionally remove sponsored segments from transcripts (`skipSponsor`)
- **Video screenshots** — capture frames from any YouTube video by timestamp
- **No API keys** — works without Google API credentials

## Install

```bash
npm install -g @inlustris/youtube-mcp
```

### Optional: Full-quality screenshots

The `get_video_frame` tool works out of the box for low-resolution captures. For **full-quality screenshots** (up to 4K), install:

```bash
brew install yt-dlp ffmpeg
```

On Linux: `apt install yt-dlp ffmpeg` or `pip install yt-dlp`.

The tool auto-detects yt-dlp and falls back gracefully if it's not installed.

## Usage

### MCP Client (Cursor, Claude Desktop, etc.)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "@inlustris/youtube-mcp@latest"]
    }
  }
}
```

For [opencode](https://opencode.ai), add to `opencode.json`:

```json
{
  "mcp": {
    "youtube-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@inlustris/youtube-mcp@latest"],
      "enabled": true
    }
  }
}
```

### CLI

```bash
youtube-mcp
```

Starts the MCP server on stdio. Connect your MCP client to it.

## Tools

| Tool | Description | Key Params |
|---|---|---|
| `get_transcript` | Get video transcript | `videoUrl` (req), `chunkSize`, `chunkBySilence`, `silenceThreshold`, `skipSponsor` |
| `search_videos` | Search videos | `query` (req), `sortBy` |
| `search_channels` | Search channels | `query` (req), `sortBy` |
| `get_channel_videos` | Channel video list | `channelId` (req), `maxResults` |
| `get_video_frame` | Capture video frame | `videoUrl` (req), `timestamp` (req), `quality` |

### Tool details

**`get_transcript`** — `skipSponsor: boolean`
When enabled, fetches sponsor segment timestamps from the [SponsorBlock API](https://sponsor.ajay.app) (no auth needed) and filters them out of the transcript.

**`get_video_frame`** — Capture a screenshot from any YouTube video at a given timestamp.
- **With yt-dlp**: Full-resolution frame (up to 4K) using fast keyframe-seeking via ffmpeg.
- **Without yt-dlp**: Falls back to YouTube storyboards (max 320×180, 2-second intervals).
- The response includes the method used (`yt-dlp` or `storyboard`) and quality guidance.

## Development

```bash
# Install dependencies
npm install

# Dev server with hot reload
npm run dev

# Tests
npm test              # single run
npm run test:watch    # watch mode

# Build for production
npm run build

# Run the built server
node build/index.js
```

### Project Structure

```
src/
├── index.ts                  # Entry point
├── server/
│   └── server.ts             # FastMCP server setup
├── core/
│   ├── tools.ts              # Tool definitions
│   ├── resources.ts          # Resource templates
│   ├── prompts.ts            # Prompt templates
│   └── services/
│       ├── youtube-service.ts # YouTube API calls (via youtubei.js)
│       ├── sponsorblock-service.ts  # SponsorBlock API client
│       └── screenshot-service.ts    # Screenshot capture (yt-dlp + storyboard fallback)
└── __tests__/
    ├── youtube-service.test.ts
    ├── tools.test.ts
    └── resources.test.ts
```

## Dependencies

| Dependency | Type | Purpose |
|---|---|---|
| `youtubei.js` | npm | YouTube data API (transcripts, search, channels) |
| `fastmcp` | npm | MCP server framework |
| `zod` | npm | Parameter validation |
| `ffmpeg-static` | npm | Bundled ffmpeg binary for frame extraction |
| `sharp` | npm | Image processing for storyboard thumbnails |
| `yt-dlp` | **system** *(optional)* | Full-quality YouTube video URL extraction |

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT

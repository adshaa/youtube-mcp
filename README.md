# @inlustris/youtube-mcp

**Ground your AI agents in YouTube's best content — no API keys, zero config.**

![NPM Version](https://img.shields.io/npm/v/@inlustris/youtube-mcp)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

YouTube is the world's largest library of expert knowledge — tutorials, talks, reviews, deep dives. But AI agents can't watch videos.

This MCP server bridges that gap. It gives your agent access to YouTube transcripts, search, channel data, and video screenshots through simple tools. No Google API keys. No OAuth. No setup.

Built with [FastMCP](https://github.com/anomalyco/fastmcp) and [youtubei.js](https://github.com/LuanRT/YouTube.js).

## Why YouTube for AI grounding?

Web search is noisy. YouTube content is **ranked, reviewed, and curated** — videos with high view counts, reputable creators, and timestamped transcripts that make it ideal for LLM context. Instead of scraping forums or blogs, your agent can pull the exact transcript from a relevant video, search across channels, or capture a screenshot of a specific moment.

This isn't another "AI skill" you have to maintain. It's a single npm package that works immediately.

## What you get

| Tool | Purpose |
|---|---|
| `get_transcript` | Video transcript with timestamps, or plain text via `plainText`. Optionally strip sponsor segments via `skipSponsor`. Transcripts are cached in-memory — subsequent fetches are instant. |
| `get_video_frame` | Screenshot at any timestamp. Full quality when yt-dlp is available; falls back gracefully. |
| `search_videos` | Search YouTube with sort by relevance, date, rating, view count. |
| `search_channels` | Find channels by query. |
| `get_channel_videos` | List every video from a channel. |

## Install

```bash
npm install -g @inlustris/youtube-mcp
```

Add to any MCP client:

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

Works with Claude Desktop, Cursor, opencode, VS Code Copilot, and any MCP-compatible agent.

## Full-quality screenshots (optional)

`get_video_frame` works out of the box using YouTube storyboards (320×180). For **full-resolution captures** (720p, 1080p, 4K), install the system tools:

```bash
brew install yt-dlp ffmpeg
```

The tool detects yt-dlp automatically and upgrades itself — no config changes needed.

## SponsorBlock

Pass `skipSponsor: true` to `get_transcript`. It fetches sponsor timestamps from the SponsorBlock API (no auth, free) and removes sponsored content from the transcript. Great for getting clean, ad-free video context.

## Use cases

- **Research agents**: Pull transcripts from expert talks, conference presentations, or technical deep-dives instead of skimming blog posts.
- **Content analysis**: Search for relevant YouTube content by topic, then extract transcripts at scale.
- **Visual grounding**: Capture screenshots at key moments alongside transcripts for multimodal understanding.
- **Learning tools**: Let users ask questions about specific video timestamps and get grounded answers.

## Development

```bash
npm install
npm run dev        # hot-reload
npm test           # 31 tests
npm run build      # production bundle
```

```
src/
├── index.ts
├── server/server.ts
├── core/
│   ├── tools.ts
│   ├── resources.ts
│   └── services/
│       ├── youtube-service.ts
│       ├── sponsorblock-service.ts
│       └── screenshot-service.ts
└── __tests__/
```

## License

MIT

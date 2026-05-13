import { Innertube } from "youtubei.js";
import { execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SponsorBlockService } from "./sponsorblock-service.js";

type TranscriptSegment = {
  text: string;
  start_ms: number;
  end_ms: number;
};

type TranscriptChunk = {
  text: string;
  start_ms: number;
  end_ms: number;
};

type GetTranscriptOptions = {
  chunkSize?: number;
  chunkBySilence?: boolean;
  silenceThreshold?: number;
  skipSponsor?: boolean;
  plainText?: boolean;
};

type CacheEntry = {
  segments: TranscriptSegment[];
  cachedAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const transcriptCache = new Map<string, CacheEntry>();

export function clearTranscriptCache() {
  transcriptCache.clear();
}

export type VideoSearchResult = {
  title: string;
  videoId: string;
  channelName: string;
};

export type ChannelSearchResult = {
  channelName: string;
  channelId: string;
};

export type SearchSortBy =
  | "relevance"
  | "date"
  | "rating"
  | "viewCount"
  | "title"
  | "videoCount";

export type ChannelVideoResult = {
  title: string;
  videoId: string;
  publishedAt: string;
  description: string;
  thumbnailUrl: string;
};

function parseTimestamp(ts: string): number {
  const parts = ts.split(":");
  if (parts.length === 3) {
    return (parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])) * 1000;
  }
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
  }
  return parseFloat(parts[0]) * 1000;
}

function parseTtml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pRegex = /<p\s[^>]*begin="([^"]+)"[^>]*end="([^"]*)"[^>]*>(.*?)<\/p>/gs;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const begin = match[1];
    const end = match[2];
    const inner = match[3];
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text) {
      segments.push({
        text,
        start_ms: parseTimestamp(begin),
        end_ms: end ? parseTimestamp(end) : parseTimestamp(begin) + 1000,
      });
    }
  }
  return segments;
}

function parseSrv3(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>(.*?)<\/p>/gs;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const t = parseInt(match[1]);
    const d = parseInt(match[2]);
    const inner = match[3];
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text) {
      segments.push({ text, start_ms: t, end_ms: t + d });
    }
  }
  return segments;
}

export class YoutubeService {
  private static getVideoId(url: string): string | null {
    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
    match = url.match(/youtu.be\/([^?]+)/);
    if (match) return match[1];
    return null;
  }

  public static async getTranscript(
    videoUrl: string,
    options: GetTranscriptOptions = {}
  ): Promise<TranscriptChunk[]> {
    const videoId = this.getVideoId(videoUrl);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const [skipSegments, rawSegments] = await Promise.all([
      options.skipSponsor
        ? SponsorBlockService.getSkipSegments(videoId).catch(() => [])
        : Promise.resolve([] as Awaited<ReturnType<typeof SponsorBlockService.getSkipSegments>>),
      this.getRawSegments(videoId),
    ]);

    let segments = rawSegments;
    if (skipSegments.length > 0) {
      segments = this.filterSponsorSegments(segments, skipSegments);
    }

    if (options.plainText) {
      const fullText = segments.map((s) => s.text).join(" ");
      return [
        {
          text: fullText,
          start_ms: segments[0]?.start_ms || 0,
          end_ms: segments[segments.length - 1]?.end_ms || 0,
        },
      ];
    }

    if (options.chunkBySilence) {
      return this.chunkSegmentsBySilence(segments, options.silenceThreshold);
    }

    if (options.chunkSize) {
      return this.chunkSegments(segments, options.chunkSize);
    }

    return segments.map(({ text, start_ms, end_ms }) => ({ text, start_ms, end_ms }));
  }

  private static async getRawSegments(videoId: string): Promise<TranscriptSegment[]> {
    const cached = transcriptCache.get(videoId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.segments;
    }

    const segments =
      (await this.fetchViaYoutubei(videoId)) ||
      (await this.fetchViaYtdlp(videoId));

    transcriptCache.set(videoId, { segments, cachedAt: Date.now() });
    return segments;
  }

  private static async fetchViaYoutubei(
    videoId: string
  ): Promise<TranscriptSegment[] | null> {
    try {
      const youtube = await Innertube.create();
      const info = await youtube.getInfo(videoId);

      if (!info.captions || info.captions.caption_tracks?.length === 0) {
        return null;
      }

      const _transcript = await info.getTranscript();
      const segments: TranscriptSegment[] =
        _transcript.transcript.content?.body?.initial_segments?.map(
          ({ snippet, start_ms, end_ms }: any) => ({
            text: snippet?.text || "",
            start_ms: Number(start_ms),
            end_ms: Number(end_ms),
          })
        ) || [];

      return segments.length > 0 ? segments : null;
    } catch {
      return null;
    }
  }

  private static async fetchViaYtdlp(videoId: string): Promise<TranscriptSegment[]> {
    const tmpDir = mkdtempSync(join(tmpdir(), "yt-mcp-"));
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      execSync(
        `yt-dlp --write-auto-subs --sub-lang en --sub-format ttml --skip-download -o "${tmpDir}/sub" ${JSON.stringify(videoUrl)}`,
        { timeout: 30000, encoding: "utf-8", stdio: "pipe" }
      );

      const file = join(tmpDir, `sub.en.ttml`);
      const xml = readFileSync(file, "utf-8");
      return parseTtml(xml);
    } catch {
      try {
        execSync(
          `yt-dlp --write-auto-subs --sub-lang en --sub-format srv3 --skip-download -o "${tmpDir}/sub" ${JSON.stringify(videoUrl)}`,
          { timeout: 30000, encoding: "utf-8", stdio: "pipe" }
        );

        const file = join(tmpDir, `sub.en.srv3`);
        const xml = readFileSync(file, "utf-8");
        return parseSrv3(xml);
      } catch {
        throw new Error(
          "Failed to fetch transcript. Ensure yt-dlp is installed (brew install yt-dlp)."
        );
      }
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  private static filterSponsorSegments(
    segments: TranscriptSegment[],
    skipSegments: { startTime: number; endTime: number }[]
  ): TranscriptSegment[] {
    return segments.filter((seg) => {
      const segStart = seg.start_ms / 1000;
      const segEnd = seg.end_ms / 1000;
      return !skipSegments.some(
        (skip) => segStart < skip.endTime && segEnd > skip.startTime
      );
    });
  }

  private static chunkSegments(
    segments: TranscriptSegment[],
    chunkSize: number
  ): TranscriptChunk[] {
    const chunks: TranscriptChunk[] = [];
    let currentChunk: TranscriptChunk = { text: "", start_ms: 0, end_ms: 0 };
    for (const segment of segments) {
      if (currentChunk.text.length + segment.text.length > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = { text: "", start_ms: segment.start_ms, end_ms: 0 };
      }
      if (currentChunk.text.length === 0) currentChunk.start_ms = segment.start_ms;
      currentChunk.text += segment.text + " ";
      currentChunk.end_ms = segment.end_ms;
    }
    if (currentChunk.text.length > 0) chunks.push(currentChunk);
    return chunks;
  }

  private static chunkSegmentsBySilence(
    segments: TranscriptSegment[],
    silenceThreshold: number = 200
  ): TranscriptChunk[] {
    const chunks: TranscriptChunk[] = [];
    let currentChunk: TranscriptChunk = { text: "", start_ms: 0, end_ms: 0 };
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (currentChunk.text.length === 0) currentChunk.start_ms = segment.start_ms;
      currentChunk.text += segment.text + " ";
      currentChunk.end_ms = segment.end_ms;
      const next = segments[i + 1];
      if (next && next.start_ms - segment.end_ms > silenceThreshold) {
        chunks.push(currentChunk);
        currentChunk = { text: "", start_ms: 0, end_ms: 0 };
      }
    }
    if (currentChunk.text.length > 0) chunks.push(currentChunk);
    return chunks;
  }

  public static async searchVideos(
    query: string,
    sortBy: SearchSortBy = "rating"
  ): Promise<VideoSearchResult[]> {
    const youtube = await Innertube.create();
    const searchOptions: any = { type: "video" };
    switch (sortBy) {
      case "date": searchOptions.sort_by = "upload_date"; break;
      case "viewCount": searchOptions.sort_by = "view_count"; break;
      case "rating": searchOptions.sort_by = "rating"; break;
      case "relevance": searchOptions.sort_by = "relevance"; break;
      default: searchOptions.sort_by = "rating";
    }
    const search = await youtube.search(query, searchOptions);
    return search.videos.map((video) => ({
      title: ("title" in video && video.title) ? video.title.toString() : "No title",
      videoId: ("id" in video && video.id) ? video.id : "No ID",
      channelName:
        "author" in video && video.author
          ? typeof video.author === "object" && "name" in video.author
            ? video.author.name
            : String(video.author)
          : "No channel name",
    }));
  }

  public static async searchChannels(
    query: string,
    sortBy: SearchSortBy = "rating"
  ): Promise<ChannelSearchResult[]> {
    const youtube = await Innertube.create();
    const searchOptions: any = { type: "channel" };
    switch (sortBy) {
      case "date": searchOptions.sort_by = "upload_date"; break;
      case "videoCount": searchOptions.sort_by = "video_count"; break;
      case "viewCount": searchOptions.sort_by = "view_count"; break;
      case "rating": searchOptions.sort_by = "rating"; break;
      case "relevance": searchOptions.sort_by = "relevance"; break;
      default: searchOptions.sort_by = "rating";
    }
    const search = await youtube.search(query, searchOptions);
    return search.channels.map((channel) => {
      let channelName = "No channel name", channelId = "No channel ID";
      if ("author" in channel && channel.author) {
        if (typeof channel.author === "object") {
          if ("name" in channel.author) channelName = channel.author.name;
          if ("id" in channel.author) channelId = channel.author.id;
        } else channelName = String(channel.author);
      }
      return { channelName, channelId };
    });
  }

  public static async getChannelVideos(
    channelId: string,
    maxResults: number = 50
  ): Promise<ChannelVideoResult[]> {
    const youtube = await Innertube.create();
    const channel = await youtube.getChannel(channelId);
    if (!channel || !channel.header) throw new Error(`Channel not found: ${channelId}`);
    const videos = await channel.getVideos();
    return videos.videos.slice(0, maxResults).map((video) => ({
      title: ("title" in video && video.title) ? video.title.toString() : "No title",
      videoId: ("id" in video && video.id) ? video.id : "No ID",
      publishedAt: ("published" in video && video.published) ? video.published.toString() : "Unknown date",
      description: ("description" in video && video.description) ? video.description.toString() : "No description",
      thumbnailUrl:
        "thumbnails" in video && Array.isArray(video.thumbnails) && video.thumbnails.length > 0
          ? video.thumbnails[0].url || ""
          : "",
    }));
  }
}

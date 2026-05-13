import { Innertube } from "youtubei.js";
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
};

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
    try {
      const videoId = this.getVideoId(videoUrl);
      if (!videoId) {
        throw new Error("Invalid YouTube URL");
      }

      const skipSponsorPromise = options.skipSponsor
        ? SponsorBlockService.getSkipSegments(videoId).catch(() => [] as Awaited<ReturnType<typeof SponsorBlockService.getSkipSegments>>)
        : Promise.resolve([] as Awaited<ReturnType<typeof SponsorBlockService.getSkipSegments>>);

      const [youtube, skipSegments] = await Promise.all([
        Innertube.create(),
        skipSponsorPromise,
      ]);

      const info = await youtube.getInfo(videoId);

      if (!info.captions || info.captions.caption_tracks?.length === 0) {
        throw new Error("No caption tracks found for this video.");
      }

      const _transcript = await info.getTranscript();
      let segments: TranscriptSegment[] =
        _transcript.transcript.content?.body?.initial_segments?.map(
          ({ snippet, start_ms, end_ms }) => ({
            text: snippet?.text || "",
            start_ms: Number(start_ms),
            end_ms: Number(end_ms),
          })
        ) || [];

      if (skipSegments.length > 0) {
        segments = this.filterSponsorSegments(segments, skipSegments);
      }

      if (options.chunkBySilence) {
        return this.chunkSegmentsBySilence(segments, options.silenceThreshold);
      }

      if (options.chunkSize) {
        return this.chunkSegments(segments, options.chunkSize);
      }

      return segments.map(({ text, start_ms, end_ms }) => ({
        text,
        start_ms,
        end_ms,
      }));
    } catch (error) {
      console.log("YouTubeService ~ getTranscript error => ", error);
      console.error("Failed to fetch transcript:", error);
      throw new Error("Failed to fetch transcript");
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
    let currentChunk: TranscriptChunk = {
      text: "",
      start_ms: 0,
      end_ms: 0,
    };

    for (const segment of segments) {
      if (currentChunk.text.length + segment.text.length > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = {
          text: "",
          start_ms: segment.start_ms,
          end_ms: 0,
        };
      }

      if (currentChunk.text.length === 0) {
        currentChunk.start_ms = segment.start_ms;
      }

      currentChunk.text += segment.text + " ";
      currentChunk.end_ms = segment.end_ms;
    }

    if (currentChunk.text.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private static chunkSegmentsBySilence(
    segments: TranscriptSegment[],
    silenceThreshold: number = 200
  ): TranscriptChunk[] {
    const chunks: TranscriptChunk[] = [];
    let currentChunk: TranscriptChunk = {
      text: "",
      start_ms: 0,
      end_ms: 0,
    };

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (currentChunk.text.length === 0) {
        currentChunk.start_ms = segment.start_ms;
      }

      currentChunk.text += segment.text + " ";
      currentChunk.end_ms = segment.end_ms;

      const nextSegment = segments[i + 1];
      if (nextSegment) {
        const silenceDuration = nextSegment.start_ms - segment.end_ms;
        if (silenceDuration > silenceThreshold) {
          chunks.push(currentChunk);
          currentChunk = {
            text: "",
            start_ms: 0,
            end_ms: 0,
          };
        }
      }
    }

    if (currentChunk.text.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  public static async searchVideos(
    query: string,
    sortBy: SearchSortBy = "rating"
  ): Promise<VideoSearchResult[]> {
    const youtube = await Innertube.create();
    const searchOptions: any = { type: "video" };

    switch (sortBy) {
      case "date":
        searchOptions.sort_by = "upload_date";
        break;
      case "viewCount":
        searchOptions.sort_by = "view_count";
        break;
      case "rating":
        searchOptions.sort_by = "rating";
        break;
      case "relevance":
        searchOptions.sort_by = "relevance";
        break;
      default:
        searchOptions.sort_by = "rating";
    }

    const search = await youtube.search(query, searchOptions);
    return search.videos.map((video) => {
      const title =
        "title" in video && video.title ? video.title.toString() : "No title";
      const videoId =
        "id" in video && video.id ? video.id : "No ID";
      let channelName = "No channel name";
      if ("author" in video && video.author) {
        if (typeof video.author === "object" && "name" in video.author) {
          channelName = video.author.name;
        } else if (typeof video.author === "string") {
          channelName = video.author;
        }
      }
      return { title, videoId, channelName };
    });
  }

  public static async searchChannels(
    query: string,
    sortBy: SearchSortBy = "rating"
  ): Promise<ChannelSearchResult[]> {
    const youtube = await Innertube.create();
    const searchOptions: any = { type: "channel" };

    switch (sortBy) {
      case "date":
        searchOptions.sort_by = "upload_date";
        break;
      case "videoCount":
        searchOptions.sort_by = "video_count";
        break;
      case "viewCount":
        searchOptions.sort_by = "view_count";
        break;
      case "rating":
        searchOptions.sort_by = "rating";
        break;
      case "relevance":
        searchOptions.sort_by = "relevance";
        break;
      default:
        searchOptions.sort_by = "rating";
    }

    const search = await youtube.search(query, searchOptions);
    return search.channels.map((channel) => {
      let channelName = "No channel name";
      let channelId = "No channel ID";

      if ("author" in channel && channel.author) {
        if (typeof channel.author === "object") {
          if ("name" in channel.author) {
            channelName = channel.author.name;
          }
          if ("id" in channel.author) {
            channelId = channel.author.id;
          }
        } else if (typeof channel.author === "string") {
          channelName = channel.author;
        }
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

    if (!channel || !channel.header) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const videos = await channel.getVideos();

    return videos.videos.slice(0, maxResults).map((video) => {
      const title =
        "title" in video && video.title ? video.title.toString() : "No title";
      const videoId =
        "id" in video && video.id ? video.id : "No ID";

      let publishedAt = "Unknown date";
      if ("published" in video && video.published) {
        publishedAt = video.published.toString();
      }

      let description = "No description";
      if ("description" in video && video.description) {
        description = video.description.toString();
      }

      let thumbnailUrl = "";
      if (
        "thumbnails" in video &&
        video.thumbnails &&
        Array.isArray(video.thumbnails) &&
        video.thumbnails.length > 0
      ) {
        thumbnailUrl = video.thumbnails[0].url || "";
      }

      return {
        title,
        videoId,
        publishedAt,
        description,
        thumbnailUrl,
      };
    });
  }
}

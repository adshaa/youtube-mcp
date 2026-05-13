import { FastMCP } from "fastmcp";
import { z } from "zod";
import * as services from "./services/index.js";

export function registerTools(server: FastMCP) {
  server.addTool({
    name: "get_transcript",
    description:
      "Retrieves the full transcript of a specified YouTube video. This tool is useful for understanding video content without watching it, or for extracting textual information from videos. FORMATTING GUIDANCE (optional - user instructions override): When creating summaries, consider using: **Key Points with Timestamps:** Use [MM:SS] or [HH:MM:SS] inline references. **Structure:** Break into logical sections. **Context:** Include video title and channel. Example: 'The speaker explains TypeScript generics [05:30] and shows practical examples [08:15].' This formatting is optional - always follow any specific user instructions instead.",
    parameters: z.object({
      videoUrl: z
        .string()
        .describe(
          "The full URL of the YouTube video from which to retrieve the transcript. This is the standard URL you would use to watch the video in a browser (e.g., 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')."
        ),
      chunkSize: z
        .number()
        .optional()
        .describe(
          "Optional: The maximum number of characters for each transcript chunk. If provided, the transcript will be split into chunks of this size. Useful for processing very long transcripts in smaller, manageable parts."
        ),
      chunkBySilence: z
        .boolean()
        .optional()
        .describe(
          "Optional: If true, the transcript will be chunked based on periods of silence in the audio. This can help in segmenting the transcript into more natural conversational or thematic breaks."
        ),
      silenceThreshold: z
        .number()
        .optional()
        .describe(
          "Optional: When chunkBySilence is true, this specifies the minimum duration of silence (in milliseconds) to consider as a chunk break. A higher value means longer pauses are required to create a new chunk."
        ),
      skipSponsor: z
        .boolean()
        .optional()
        .describe(
          "Optional: If true, removes sponsor/ad segments from the transcript using the SponsorBlock API. Fetches sponsor timestamps and filters out transcript text that falls within sponsored sections."
        ),
    }),
    execute: async (params) => {
      const transcript = await services.YoutubeService.getTranscript(
        params.videoUrl,
        {
          chunkSize: params.chunkSize,
          chunkBySilence: params.chunkBySilence,
          silenceThreshold: params.silenceThreshold,
          skipSponsor: params.skipSponsor,
        }
      );
      return { type: "text", text: JSON.stringify(transcript) };
    },
  });

  server.addTool({
    name: "search_videos",
    description:
      "Searches YouTube for videos matching the specified query. Returns a list of video results with title, video ID, and channel information. Results are sorted by rating by default for better quality content.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "The search query to find YouTube videos. Can include keywords, phrases, or specific terms related to the content you're looking for."
        ),
      sortBy: z
        .enum(["relevance", "date", "rating", "viewCount", "title"])
        .default("rating")
        .describe(
          "Optional: How to sort the search results. Options are: 'relevance' (most relevant), 'date' (newest first), 'rating' (highest rated first - default), 'viewCount' (most viewed), 'title' (alphabetical)."
        ),
    }),
    execute: async (params) => {
      const videos = await services.YoutubeService.searchVideos(
        params.query,
        params.sortBy
      );
      return { type: "text", text: JSON.stringify(videos) };
    },
  });

  server.addTool({
    name: "search_channels",
    description:
      "Searches YouTube for channels matching the specified query. You can specify a sort order for the results (default: rating).",
    parameters: z.object({
      query: z.string().describe("The search query to find YouTube channels."),
      sortBy: z
        .enum([
          "relevance",
          "date",
          "rating",
          "viewCount",
          "title",
          "videoCount",
        ])
        .default("rating")
        .describe(
          "Sort order for search results: relevance, date, rating (default), viewCount, title, or videoCount."
        ),
    }),
    async execute(params) {
      const channels = await services.YoutubeService.searchChannels(
        params.query,
        params.sortBy
      );
      return {
        type: "text",
        text: JSON.stringify(channels, null, 2),
      };
    },
  });

  server.addTool({
    name: "get_channel_videos",
    description:
      "Retrieves a list of videos from a specified YouTube channel. This tool is useful for getting all videos uploaded by a specific channel.",
    parameters: z.object({
      channelId: z
        .string()
        .describe(
          "The YouTube channel ID from which to retrieve videos. You can get this from search_channels results or from a channel URL."
        ),
      maxResults: z
        .number()
        .default(50)
        .describe("Maximum number of videos to retrieve (default: 50, max: 200)."),
    }),
    async execute(params) {
      const videos = await services.YoutubeService.getChannelVideos(
        params.channelId,
        Math.min(params.maxResults, 200)
      );
      return {
        type: "text",
        text: JSON.stringify(videos, null, 2),
      };
    },
  });

  server.addTool({
    name: "get_video_frame",
    description:
      "Captures a screenshot from a YouTube video at a specified timestamp. Requires yt-dlp for full-quality captures; falls back to lower-resolution YouTube storyboards (320x180 max) if yt-dlp is not installed.",
    parameters: z.object({
      videoUrl: z
        .string()
        .describe(
          "The full URL of the YouTube video from which to capture a frame (e.g., 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')."
        ),
      timestamp: z
        .number()
        .describe(
          "The time in seconds from which to capture the frame. Accepts both integer and decimal values (e.g., 30, 92.5)."
        ),
      quality: z
        .string()
        .default("bestvideo[height<=720]")
        .optional()
        .describe(
          "Optional: yt-dlp format selector. Default is 'bestvideo[height<=720]'. Use 'bestvideo' for the best available quality. Only used when yt-dlp is available."
        ),
    }),
    async execute(params) {
      const result = await services.ScreenshotService.getVideoFrame(
        params.videoUrl,
        params.timestamp,
        { quality: params.quality }
      );

      const base64 = result.buffer.toString("base64");
      let note = result.message || "";
      if (result.method === "yt-dlp") {
        note =
          "Full-quality capture via yt-dlp + ffmpeg. " +
          "If quality or performance issues arise, ensure: brew install yt-dlp ffmpeg";
      }

      return {
        type: "text",
        text: JSON.stringify({
          mimeType: "image/jpeg",
          data: base64,
          width: result.width,
          height: result.height,
          size: result.buffer.length,
          method: result.method,
          timestamp: params.timestamp,
          note,
        }),
      };
    },
  });
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { YoutubeService, clearTranscriptCache } from "../core/services/youtube-service.js";

const mockInnertube = vi.hoisted(() => ({
  getInfo: vi.fn(),
  search: vi.fn(),
  getChannel: vi.fn(),
}));

vi.mock("youtubei.js", () => ({
  Innertube: {
    create: vi.fn().mockResolvedValue(mockInnertube),
  },
}));

const mockTtmlXml = vi.hoisted(() => `<?xml version="1.0" encoding="utf-8" ?>
<tt xmlns="http://www.w3.org/ns/ttml">
<body>
<div>
<p begin="00:00:00.000" end="00:00:02.000">Hello world</p>
<p begin="00:00:02.000" end="00:00:04.000">This is a test</p>
<p begin="00:00:04.000" end="00:00:06.000">Goodbye</p>
</div>
</body>
</tt>`);

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("fs", () => ({
  mkdtempSync: vi.fn().mockReturnValue("/tmp/yt-mcp-test"),
  readFileSync: vi.fn().mockReturnValue(mockTtmlXml),
  rmSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

function makeCaptionTrack() {
  return { caption_tracks: [{ name: { text: "English" } }] };
}

function makeSegment(text: string, start_ms: number, end_ms: number) {
  return {
    snippet: { text },
    start_ms: BigInt(start_ms),
    end_ms: BigInt(end_ms),
  };
}

function makeTranscript(segments: ReturnType<typeof makeSegment>[]) {
  return {
    transcript: {
      content: {
        body: {
          initial_segments: segments,
        },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTranscriptCache();
});

describe("YoutubeService", () => {
  describe("getVideoId (private method)", () => {
    it("extracts video ID from standard watch URL", () => {
      const result = (YoutubeService as any)["getVideoId"](
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );
      expect(result).toBe("dQw4w9WgXcQ");
    });

    it("extracts video ID from short youtu.be URL", () => {
      const result = (YoutubeService as any)["getVideoId"](
        "https://youtu.be/dQw4w9WgXcQ"
      );
      expect(result).toBe("dQw4w9WgXcQ");
    });

    it("extracts video ID from URL with additional params", () => {
      const result = (YoutubeService as any)["getVideoId"](
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s"
      );
      expect(result).toBe("dQw4w9WgXcQ");
    });

    it("extracts video ID from youtu.be with params", () => {
      const result = (YoutubeService as any)["getVideoId"](
        "https://youtu.be/dQw4w9WgXcQ?si=abc123"
      );
      expect(result).toBe("dQw4w9WgXcQ");
    });

    it("returns null for invalid URL", () => {
      const result = (YoutubeService as any)["getVideoId"]("not-a-url");
      expect(result).toBeNull();
    });
  });

  describe("getTranscript", () => {
    const segments = [
      makeSegment("Hello world", 0, 2000),
      makeSegment("This is a test", 2000, 4000),
      makeSegment("Goodbye", 4000, 6000),
    ];

    it("returns transcript segments for a valid video", async () => {
      const result = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123"
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        text: "Hello world",
        start_ms: 0,
        end_ms: 2000,
      });
      expect(result[1]).toEqual({
        text: "This is a test",
        start_ms: 2000,
        end_ms: 4000,
      });
    });

    it("returns plain text when plainText option is set", async () => {
      const result = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123",
        { plainText: true }
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Hello world This is a test Goodbye");
      expect(result[0].start_ms).toBe(0);
      expect(result[0].end_ms).toBe(6000);
    });

    it("throws error for invalid URL", async () => {
      await expect(
        YoutubeService.getTranscript("not-a-url")
      ).rejects.toThrow("Invalid YouTube URL");
    });

    it("chunks transcript by character size when chunkSize is set", async () => {
      const result = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123",
        { chunkSize: 15 }
      );

      expect(result.length).toBeGreaterThan(1);
      expect(result[0].text.length).toBeLessThanOrEqual(15);
    });

    it("chunks transcript by silence when chunkBySilence is true", async () => {
      const result = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123",
        { chunkBySilence: true, silenceThreshold: 2000 }
      );

      expect(result).toHaveLength(1);
      expect(result[0].text).toContain("Hello");
    });

    it("caches and reuses transcript", async () => {
      const result1 = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123"
      );
      const result2 = await YoutubeService.getTranscript(
        "https://www.youtube.com/watch?v=test123"
      );

      expect(result1).toEqual(result2);
    });
  });

  describe("searchVideos", () => {
    it("returns formatted video search results", async () => {
      mockInnertube.search.mockResolvedValue({
        videos: [
          {
            title: "Test Video",
            id: "abc123",
            author: { name: "Test Channel" },
          },
          {
            title: "Another Video",
            id: "def456",
            author: { name: "Another Channel" },
          },
        ],
      });

      const result = await YoutubeService.searchVideos("test query");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: "Test Video",
        videoId: "abc123",
        channelName: "Test Channel",
      });
      expect(result[1]).toEqual({
        title: "Another Video",
        videoId: "def456",
        channelName: "Another Channel",
      });
    });

    it("handles missing author gracefully", async () => {
      mockInnertube.search.mockResolvedValue({
        videos: [
          {
            title: "Test Video",
            id: "abc123",
          },
        ],
      });

      const result = await YoutubeService.searchVideos("test query");
      expect(result[0].channelName).toBe("No channel name");
    });

    it("passes sortBy option correctly", async () => {
      mockInnertube.search.mockResolvedValue({
        videos: [],
      });

      await YoutubeService.searchVideos("test", "date");
      expect(mockInnertube.search).toHaveBeenCalledWith("test", {
        type: "video",
        sort_by: "upload_date",
      });
    });
  });

  describe("searchChannels", () => {
    it("returns formatted channel search results", async () => {
      mockInnertube.search.mockResolvedValue({
        channels: [
          {
            author: { name: "Test Channel", id: "UC123" },
          },
          {
            author: { name: "Another Channel", id: "UC456" },
          },
        ],
      });

      const result = await YoutubeService.searchChannels("test");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        channelName: "Test Channel",
        channelId: "UC123",
      });
    });

    it("handles missing author gracefully", async () => {
      mockInnertube.search.mockResolvedValue({
        channels: [{}],
      });

      const result = await YoutubeService.searchChannels("test");
      expect(result[0]).toEqual({
        channelName: "No channel name",
        channelId: "No channel ID",
      });
    });
  });

  describe("getChannelVideos", () => {
    const mockVideos = [
      {
        title: "Video 1",
        id: "vid1",
        published: "2024-01-01",
        description: "Description 1",
        thumbnails: [{ url: "https://img.youtube.com/vi/vid1/hqdefault.jpg" }],
      },
      {
        title: "Video 2",
        id: "vid2",
        published: "2024-01-02",
        description: "Description 2",
        thumbnails: [{ url: "https://img.youtube.com/vi/vid2/hqdefault.jpg" }],
      },
    ];

    it("returns formatted channel videos", async () => {
      mockInnertube.getChannel.mockResolvedValue({
        header: {},
        getVideos: vi.fn().mockResolvedValue({
          videos: mockVideos,
        }),
      });

      const result = await YoutubeService.getChannelVideos("UC123", 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: "Video 1",
        videoId: "vid1",
        publishedAt: "2024-01-01",
        description: "Description 1",
        thumbnailUrl: "https://img.youtube.com/vi/vid1/hqdefault.jpg",
      });
    });

    it("throws error when channel is not found", async () => {
      mockInnertube.getChannel.mockResolvedValue(null);

      await expect(
        YoutubeService.getChannelVideos("invalid")
      ).rejects.toThrow("Channel not found: invalid");
    });

    it("handles missing video properties gracefully", async () => {
      mockInnertube.getChannel.mockResolvedValue({
        header: {},
        getVideos: vi.fn().mockResolvedValue({
          videos: [{}],
        }),
      });

      const result = await YoutubeService.getChannelVideos("UC123", 10);
      expect(result[0]).toEqual({
        title: "No title",
        videoId: "No ID",
        publishedAt: "Unknown date",
        description: "No description",
        thumbnailUrl: "",
      });
    });

    it("limits results to maxResults", async () => {
      const manyVideos = Array.from({ length: 300 }, (_, i) => ({
        title: `Video ${i}`,
        id: `vid${i}`,
        published: "2024-01-01",
        description: "desc",
        thumbnails: [{ url: "" }],
      }));

      mockInnertube.getChannel.mockResolvedValue({
        header: {},
        getVideos: vi.fn().mockResolvedValue({
          videos: manyVideos,
        }),
      });

      const result = await YoutubeService.getChannelVideos("UC123", 10);
      expect(result).toHaveLength(10);
    });
  });
});

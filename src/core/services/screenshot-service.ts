import { execSync, spawn } from "child_process";
import { Innertube } from "youtubei.js";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

export type ScreenshotResult = {
  buffer: Buffer;
  method: "yt-dlp" | "storyboard";
  width: number;
  height: number;
  message?: string;
};

export type ScreenshotOptions = {
  quality?: string;
  timeout?: number;
};

export class ScreenshotService {
  static async getVideoFrame(
    videoUrl: string,
    timestamp: number,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    const videoId = this.getVideoId(videoUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    const ytdlpResult = await this.tryYtdlp(videoUrl, timestamp, options);
    if (ytdlpResult) return ytdlpResult;

    return this.tryStoryboard(videoId, timestamp);
  }

  private static getVideoId(url: string): string | null {
    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
    match = url.match(/youtu.be\/([^?]+)/);
    if (match) return match[1];
    return null;
  }

  private static async tryYtdlp(
    videoUrl: string,
    timestamp: number,
    options: ScreenshotOptions
  ): Promise<ScreenshotResult | null> {
    const quality = options.quality || "bestvideo[height<=720]";
    const timeout = options.timeout || 30000;

    let streamUrl: string;
    try {
      const stdout = execSync(
        `yt-dlp -g -f "${quality}" ${JSON.stringify(videoUrl)}`,
        { timeout: 15000, encoding: "utf-8" }
      );
      streamUrl = stdout.trim().split("\n")[0];
    } catch {
      return null;
    }

    if (!streamUrl) return null;
    const ffmpeg = ffmpegPath || "ffmpeg";

    try {
      const buffer = await this.extractFrame(streamUrl, timestamp, timeout, ffmpeg);
      if (buffer.length === 0) return null;

      const meta = await sharp(buffer).metadata();
      return {
        buffer,
        method: "yt-dlp",
        width: meta.width || 0,
        height: meta.height || 0,
      };
    } catch {
      return null;
    }
  }

  private static extractFrame(
    streamUrl: string,
    timestamp: number,
    timeout: number,
    ffmpegBin: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        ffmpegBin,
        [
          "-ss",
          String(timestamp),
          "-i",
          streamUrl,
          "-vframes",
          "1",
          "-c:v",
          "mjpeg",
          "-q:v",
          "2",
          "-f",
          "image2pipe",
          "-",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      const chunks: Buffer[] = [];
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Timed out"));
      }, timeout);

      proc.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          const msg =
            stderr
              .slice(-300)
              .split("\n")
              .find((l) => l.includes("Error") || l.includes("403")) ||
            `ffmpeg exited with code ${code}`;
          reject(new Error(msg));
        }
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private static async tryStoryboard(
    videoId: string,
    timestamp: number
  ): Promise<ScreenshotResult> {
    const youtube = await Innertube.create({ retrieve_player: false });
    const info = await youtube.getInfo(videoId);

    if (!info.storyboards || !("boards" in info.storyboards)) {
      throw new Error(
        "No storyboards available. Install yt-dlp (brew install yt-dlp) for full-quality screenshots."
      );
    }

    const boards = info.storyboards.boards as any[];
    const board = boards
      .filter((b: any) => b.interval > 0)
      .sort((a: any, b: any) => b.thumbnail_width - a.thumbnail_width)[0];

    if (!board) {
      throw new Error(
        "No usable storyboards. Install yt-dlp (brew install yt-dlp) for full-quality screenshots."
      );
    }

    const { interval, thumbnail_width, thumbnail_height, columns, rows, thumbnail_count, template_url, storyboard_count } = board;
    const thumbIndex = Math.min(
      Math.floor(timestamp / interval),
      thumbnail_count - 1
    );
    const boardIndex = Math.floor(thumbIndex / (columns * rows));
    const localIndex = thumbIndex % (columns * rows);
    const tileX = localIndex % columns;
    const tileY = Math.floor(localIndex / columns);

    const boardUrl = template_url.replace("$M", String(boardIndex));
    const resp = await fetch(boardUrl);
    if (!resp.ok) {
      throw new Error(
        "Failed to fetch storyboard. Install yt-dlp (brew install yt-dlp) for full-quality screenshots."
      );
    }

    const sprite = Buffer.from(await resp.arrayBuffer());
    const frame = await sharp(sprite)
      .extract({
        left: tileX * thumbnail_width,
        top: tileY * thumbnail_height,
        width: thumbnail_width,
        height: thumbnail_height,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    return {
      buffer: frame,
      method: "storyboard",
      width: thumbnail_width,
      height: thumbnail_height,
      message:
        "Low-resolution storyboard frame (" +
        `${thumbnail_width}×${thumbnail_height}). ` +
        "Install yt-dlp (brew install yt-dlp) for full-quality screenshots.",
    };
  }
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FastMCP } from "fastmcp";
import { registerTools } from "../core/tools.js";

vi.mock("fastmcp", () => {
  const mockServer = {
    addTool: vi.fn(),
  };
  return {
    FastMCP: vi.fn(function () {
      return mockServer;
    }),
  };
});

describe("registerTools", () => {
  let server: FastMCP;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new FastMCP({ name: "test", version: "1.0.0" });
  });

  it("registers all 4 tools", () => {
    registerTools(server);
    expect(server.addTool).toHaveBeenCalledTimes(4);
  });

  it("registers get_transcript tool with correct schema", () => {
    registerTools(server);

    const calls = (server.addTool as ReturnType<typeof vi.fn>).mock.calls;
    const tool = calls.find(
      ([t]: any[]) => t.name === "get_transcript"
    )?.[0];

    expect(tool).toBeDefined();
    expect(tool.description).toContain("transcript");
    expect(tool.parameters).toBeDefined();
  });

  it("registers search_videos tool with correct schema", () => {
    registerTools(server);

    const calls = (server.addTool as ReturnType<typeof vi.fn>).mock.calls;
    const tool = calls.find(
      ([t]: any[]) => t.name === "search_videos"
    )?.[0];

    expect(tool).toBeDefined();
    expect(tool.description).toContain("Searches YouTube");
    expect(tool.parameters).toBeDefined();
  });

  it("registers search_channels tool with correct schema", () => {
    registerTools(server);

    const calls = (server.addTool as ReturnType<typeof vi.fn>).mock.calls;
    const tool = calls.find(
      ([t]: any[]) => t.name === "search_channels"
    )?.[0];

    expect(tool).toBeDefined();
    expect(tool.description).toContain("Searches YouTube");
    expect(tool.parameters).toBeDefined();
  });

  it("registers get_channel_videos tool with correct schema", () => {
    registerTools(server);

    const calls = (server.addTool as ReturnType<typeof vi.fn>).mock.calls;
    const tool = calls.find(
      ([t]: any[]) => t.name === "get_channel_videos"
    )?.[0];

    expect(tool).toBeDefined();
    expect(tool.description).toContain("channel");
    expect(tool.parameters).toBeDefined();
  });
});

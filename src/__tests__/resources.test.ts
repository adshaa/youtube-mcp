import { describe, it, expect, vi, beforeEach } from "vitest";
import { FastMCP } from "fastmcp";
import { registerResources } from "../core/resources.js";

vi.mock("fastmcp", () => {
  const mockServer = {
    addResourceTemplate: vi.fn(),
  };
  return {
    FastMCP: vi.fn(function () {
      return mockServer;
    }),
  };
});

vi.mock("../core/services/youtube-service.js", () => ({
  YoutubeService: {
    getTranscript: vi.fn(),
    searchVideos: vi.fn(),
    searchChannels: vi.fn(),
    getChannelVideos: vi.fn(),
  },
}));

describe("registerResources", () => {
  let server: FastMCP;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new FastMCP({ name: "test", version: "1.0.0" });
  });

  it("registers all 4 resource templates", () => {
    registerResources(server);
    expect(server.addResourceTemplate).toHaveBeenCalledTimes(4);
  });

  it("registers transcript resource template", () => {
    registerResources(server);

    const calls = (
      server.addResourceTemplate as ReturnType<typeof vi.fn>
    ).mock.calls;
    const resource = calls.find(
      ([r]: any[]) => r.uriTemplate === "youtube:transcript:{videoId}"
    )?.[0];

    expect(resource).toBeDefined();
    expect(resource.name).toBe("getTranscript");
    expect(resource.arguments).toHaveLength(1);
    expect(resource.arguments[0].name).toBe("videoId");
    expect(resource.arguments[0].required).toBe(true);
  });

  it("registers search videos resource template", () => {
    registerResources(server);

    const calls = (
      server.addResourceTemplate as ReturnType<typeof vi.fn>
    ).mock.calls;
    const resource = calls.find(
      ([r]: any[]) =>
        r.uriTemplate === "youtube:search:videos:{query}:{sortBy?}"
    )?.[0];

    expect(resource).toBeDefined();
    expect(resource.name).toBe("searchVideos");
    expect(resource.mimeType).toBe("application/json");
  });

  it("registers search channels resource template", () => {
    registerResources(server);

    const calls = (
      server.addResourceTemplate as ReturnType<typeof vi.fn>
    ).mock.calls;
    const resource = calls.find(
      ([r]: any[]) => r.uriTemplate === "youtube:search:channels:{query}"
    )?.[0];

    expect(resource).toBeDefined();
    expect(resource.name).toBe("searchChannels");
  });

  it("registers channel videos resource template", () => {
    registerResources(server);

    const calls = (
      server.addResourceTemplate as ReturnType<typeof vi.fn>
    ).mock.calls;
    const resource = calls.find(
      ([r]: any[]) =>
        r.uriTemplate === "youtube:channel:{channelId}:videos"
    )?.[0];

    expect(resource).toBeDefined();
    expect(resource.name).toBe("getChannelVideos");
  });
});

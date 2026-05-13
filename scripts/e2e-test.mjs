#!/usr/bin/env node

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const YT_VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_CHANNEL = "UCuAXFkgsw1L7xaCfnd5JJOw";

let requestId = 0;
let server;
let stdoutBuf = "";
let pending = new Map();
let ready = false;

function send(method, params = {}) {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  server.stdin.write(msg + "\n");
  return new Promise((resolve) => {
    pending.set(id, (resp) => {
      if (resp.error) resolve({ error: resp.error });
      else resolve(resp.result || {});
    });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ _timeout: true });
      }
    }, 60000);
  });
}

function waitForServer(timeout = 25000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timed out")), timeout);
    server.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("Server is ready") || text.includes("initialized")) {
        clearTimeout(timer);
        setTimeout(resolve, 1000);
      }
    });
    server.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function startServer() {
  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: process.env.PATH },
  });

  server.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  server.stderr.on("data", () => {});
  await waitForServer();
}

function fail(step, detail) {
  console.error(`  ❌ ${step}: ${detail}`);
  process.exitCode = 1;
}

function pass(step) {
  console.log(`  ✅ ${step}`);
}

async function callTool(name, args, timeout = 60000) {
  const resp = await send("tools/call", { name, arguments: args });
  if (resp._timeout) throw new Error("Timed out");
  if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));
  const text = resp.content?.[0]?.text;
  if (!text) throw new Error("Empty response");
  try {
    return JSON.parse(text);
  } catch {
    // If it's not JSON, it might be an error message from fastmcp
    throw new Error(text.slice(0, 200));
  }
}

async function callToolWithRetry(name, args, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await callTool(name, args);
    } catch (e) {
      if (i === retries) throw e;
      console.log(`  ⏳ Retry ${i + 1}/${retries}...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  console.log("\n🧪 YouTube MCP — End-to-End Test\n");

  let tests = 0;
  let passed = 0;

  // ── Startup ──────────────────────────────────────────────
  console.log("Starting server...");
  await startServer();
  pass("Server started");
  tests++;

  // ── tools/list ───────────────────────────────────────────
  console.log("\n📋 Listing tools...");
  const listResp = await send("tools/list", {});
  const toolNames = (listResp.tools || []).map((t) => t.name);
  const expectedTools = [
    "get_transcript", "search_videos", "search_channels",
    "get_channel_videos", "get_video_frame",
  ];

  for (const name of expectedTools) {
    tests++;
    if (toolNames.includes(name)) { pass(`Tool '${name}'`); passed++; }
    else { fail(`Tool '${name}'`, "not found"); }
  }

  // ── resources/templates/list ─────────────────────────────
  console.log("\n📋 Listing resource templates...");
  const resResp = await send("resources/templates/list", {});
  const uriTemplates = (resResp.resourceTemplates || []).map((r) => r.uriTemplate);
  const expectedResources = [
    "youtube:transcript:{videoId}",
    "youtube:search:videos:{query}:{sortBy?}",
    "youtube:search:channels:{query}",
    "youtube:channel:{channelId}:videos",
  ];

  for (const uri of expectedResources) {
    tests++;
    if (uriTemplates.includes(uri)) { pass(`Template '${uri}'`); passed++; }
    else { fail(`Template '${uri}'`, "not found"); }
  }

  // ── get_transcript (plainText, with retry) ──────────────
  console.log("\n📝 Testing get_transcript (plainText)...");
  tests++;
  try {
    const data = await callToolWithRetry("get_transcript", { videoUrl: YT_VIDEO, plainText: true });
    if (Array.isArray(data) && data.length === 1 && typeof data[0].text === "string" && data[0].text.length > 50) {
      pass(`plainText (${data[0].text.length} chars)`);
      passed++;
    } else {
      fail("plainText", "unexpected shape: " + JSON.stringify(data).slice(0, 100));
    }
  } catch (e) {
    fail("plainText", e.message);
  }

  // ── get_transcript (timestamped, cached) ────────────────
  console.log("📝 Testing get_transcript (timestamped, cached)...");
  tests++;
  try {
    const data = await callTool("get_transcript", { videoUrl: YT_VIDEO });
    if (Array.isArray(data) && data.length > 1 && typeof data[0].start_ms === "number") {
      pass(`timestamped (${data.length} segments)`);
      passed++;
    } else {
      fail("timestamped", "unexpected shape: " + JSON.stringify(data).slice(0, 100));
    }
  } catch (e) {
    fail("timestamped", e.message);
  }

  // ── search_videos ────────────────────────────────────────
  console.log("🔍 Testing search_videos...");
  tests++;
  try {
    const data = await callTool("search_videos", { query: "typescript tutorial", sortBy: "rating" });
    if (Array.isArray(data) && data.length > 0 && data[0].videoId) {
      pass(`search_videos (${data.length} results)`);
      passed++;
    } else {
      fail("search_videos", "unexpected shape");
    }
  } catch (e) {
    fail("search_videos", e.message);
  }

  // ── search_channels ──────────────────────────────────────
  console.log("🔍 Testing search_channels...");
  tests++;
  try {
    const data = await callTool("search_channels", { query: "Fireship" });
    if (Array.isArray(data) && data.length > 0) {
      pass(`search_channels (${data.length} results)`);
      passed++;
    } else {
      fail("search_channels", "unexpected shape");
    }
  } catch (e) {
    fail("search_channels", e.message);
  }

  // ── get_channel_videos ──────────────────────────────────
  console.log("📺 Testing get_channel_videos...");
  tests++;
  try {
    const data = await callToolWithRetry("get_channel_videos", { channelId: YT_CHANNEL, maxResults: 5 });
    if (Array.isArray(data)) {
      pass(`get_channel_videos (${data.length} results)`);
      passed++;
    } else {
      fail("get_channel_videos", "not an array");
    }
  } catch (e) {
    fail("get_channel_videos", e.message);
  }

  // ── get_video_frame ─────────────────────────────────────
  console.log("🖼️  Testing get_video_frame...");
  tests++;
  try {
    const data = await callTool("get_video_frame", { videoUrl: YT_VIDEO, timestamp: 5 });
    if (data.data && typeof data.data === "string" && data.size > 1000) {
      pass(`get_video_frame (${data.width}x${data.height}, ${data.size}b via ${data.method})`);
      passed++;
    } else {
      fail("get_video_frame", `size=${data.size}, method=${data.method}`);
    }
  } catch (e) {
    fail("get_video_frame", e.message);
  }

  // ── Cleanup ─────────────────────────────────────────────
  server.kill();

  const allPassed = passed === tests;
  console.log(`\n${"─".repeat(48)}`);
  if (allPassed) {
    console.log(`\n🎉 All ${tests} tests passed!\n`);
  } else {
    console.log(`\n⚠️  ${passed}/${tests} passed — ${tests - passed} failed\n`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 E2E test crashed:", err);
  if (server) server.kill();
  process.exit(1);
});

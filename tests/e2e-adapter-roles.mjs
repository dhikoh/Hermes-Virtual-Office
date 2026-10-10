// End-to-end check: mock LLM, spawn developer agent, execute tool via agentic loop.
// Usage: node tests/e2e-adapter-roles.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const ADAPTER = path.resolve(import.meta.dirname, "../server/hermes-gateway-adapter.js");
const MOCK_LLM_PORT = 18796;
const WS_PORT = "18797";
const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-roles-e2e-"));
const stateDir = path.join(tempBase, "state");
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(
  path.join(stateDir, "api_providers.json"),
  JSON.stringify({
    activeProviderId: "mock",
    providers: [{ id: "mock", name: "Mock LLM", url: `http://127.0.0.1:${MOCK_LLM_PORT}`, key: "test-key" }],
  }, null, 2)
);

const targetFileName = "delegated_task_output.txt";
const targetFileContent = "Automated test content written by delegated developer.";

let _requestCount = 0;

// Fake OpenAI-compatible server (SSE streaming)
const mockServer = http.createServer((req, res) => {
  if (req.method === "POST") {
    let bodyStr = "";
    req.on("data", (chunk) => (bodyStr += chunk.toString("utf8")));
    req.on("end", () => {
      _requestCount++;
      const body = JSON.parse(bodyStr || "{}");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Check if this request includes tool results
      const hasToolResult = body.messages && body.messages.some((m) => m.role === "tool");

      if (!hasToolResult) {
        // First turn: invoke write_file tool
        const toolCallChunk = {
          choices: [
            {
              delta: {
                role: "assistant",
                content: "Executing write operation...",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_test_write_1",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments: JSON.stringify({
                        file_path: targetFileName,
                        content: targetFileContent,
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        // Second turn: finish with text answer
        const textChunk = {
          choices: [
            {
              delta: {
                role: "assistant",
                content: "Task completed successfully: file has been written.",
              },
              finish_reason: "stop",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => mockServer.listen(MOCK_LLM_PORT, "127.0.0.1", resolve));

const env = {
  ...process.env,
  USERPROFILE: tempBase,
  HOME: tempBase,
  HERMES_API_URL: `http://127.0.0.1:${MOCK_LLM_PORT}`,
  HERMES_ADAPTER_PORT: WS_PORT,
  HERMES_STATE_DIR: stateDir,
};

function startAdapter() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ADAPTER], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(() => reject(new Error("adapter start timeout\n" + out)), 15000);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("Listening on")) {
        clearTimeout(t);
        resolve(child);
      }
    });
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (c) => reject(new Error(`adapter exited ${c}\n${out}`)));
  });
}

function rpc(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (raw) => {
      const f = JSON.parse(raw.toString());
      if (f.type === "res" && f.id === id) {
        ws.off("message", onMsg);
        resolve(f);
      }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ type: "req", id, method, params }));
    setTimeout(() => reject(new Error("rpc timeout " + method)), 15000);
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("PASS:", msg);
}

const adapterProc = await startAdapter();

try {
  const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  await rpc(ws, "connect", {});

  // 1. Create a developer agent with explicit developer capability
  const createRes = await rpc(ws, "agents.create", {
    name: "DevBot",
    role: "developer",
    capability: "developer",
  });
  assert(createRes.ok && createRes.payload.agentId, "created developer agent DevBot");
  const devId = createRes.payload.agentId;

  // 2. Listen for final chat event
  const chatFinalPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("chat final event timeout")), 20000);
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "event" && msg.event === "chat") {
        if (msg.payload?.state === "final") {
          clearTimeout(timer);
          resolve(msg.payload);
        } else if (msg.payload?.state === "error") {
          clearTimeout(timer);
          reject(new Error("Chat failed: " + JSON.stringify(msg.payload)));
        }
      }
    });
  });

  // 3. Send chat message to developer agent triggering agentic loop tool call
  const sendRes = await rpc(ws, "chat.send", {
    sessionKey: `agent:${devId}:main`,
    message: "Please create the file delegated_task_output.txt with required content.",
  });
  assert(sendRes.ok, "chat.send dispatched to developer agent");

  const finalPayload = await chatFinalPromise;
  assert(finalPayload, "received chat.final event from agentic loop");

  // 4. Verify file was created in process.cwd()
  const writtenFilePath = path.join(process.cwd(), targetFileName);
  assert(fs.existsSync(writtenFilePath), `target file ${targetFileName} created on disk`);
  const writtenContent = fs.readFileSync(writtenFilePath, "utf8");
  assert(writtenContent === targetFileContent, "target file content matches expected value");

  // Clean up written test file
  fs.unlinkSync(writtenFilePath);

  // 5. Verify snapshot was recorded
  const snapshotsDir = path.join(process.cwd(), ".hermes", "snapshots");
  assert(fs.existsSync(snapshotsDir), "snapshot directory created during mutation");

  ws.close();
  console.log("\nALL ROLE INTEGRATION E2E CHECKS PASSED!");
} finally {
  adapterProc.kill("SIGTERM");
  mockServer.close();
  try {
    fs.rmSync(tempBase, { recursive: true, force: true });
  } catch {}
}

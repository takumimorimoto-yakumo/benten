import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function waitForReceipt(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => fail(`timed out waiting for readiness; stderr=${stderr}`), 10_000);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };
    const fail = (message) => { cleanup(); reject(new Error(message)); };
    const onStderr = (chunk) => { stderr += chunk; };
    const onExit = (code, signal) => fail(
      `local stack exited before readiness (code=${code}, signal=${signal}); stderr=${stderr}`,
    );
    const onStdout = (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      try {
        const receipt = JSON.parse(stdout.slice(0, newline));
        cleanup();
        resolve(receipt);
      } catch (error) {
        fail(`invalid readiness receipt: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("local stack did not stop after SIGTERM")), 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve([code, signal]);
    });
  });
}

test("local stack exposes direct and fixed-origin proxied facts and shuts down", async (t) => {
  const child = spawn(process.execPath, ["scripts/run-local-stack.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
  const receipt = await waitForReceipt(child);
  assert.match(receipt.apiOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(receipt.webOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);

  const [direct, proxied] = await Promise.all([
    fetch(`${receipt.apiOrigin}/api/v2/fundamentals?ticker=NVDA`),
    fetch(`${receipt.webOrigin}/api/v2/fundamentals?ticker=NVDA`),
  ]);
  assert.equal(direct.status, 200);
  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get("cache-control"), "no-store");
  assert.equal(proxied.headers.get("x-benten-artifact-revision"), direct.headers.get("x-benten-artifact-revision"));
  assert.deepEqual(await proxied.json(), await direct.json());

  // The Solana RPC relay is reachable through the Web origin. These checks
  // never reach the upstream RPC: each is rejected by the relay first.
  const relay = `${receipt.webOrigin}/api/solana-rpc`;
  const blockhash = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] });
  const withoutOrigin = await fetch(relay, { method: "POST", headers: { "content-type": "application/json" }, body: blockhash });
  assert.equal(withoutOrigin.status, 403);
  assert.equal((await withoutOrigin.json()).error.code, -32001);
  const foreign = await fetch(relay, { method: "POST", headers: { origin: "https://evil.example" }, body: blockhash });
  assert.equal(foreign.status, 403);
  await foreign.body?.cancel();
  const oversized = await fetch(relay, { method: "POST", headers: { origin: receipt.webOrigin }, body: " ".repeat(65 * 1024) });
  assert.equal(oversized.status, 413);
  await oversized.body?.cancel();
  const get = await fetch(relay);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  await get.body?.cancel();

  // The remote MCP endpoint is reachable through the Web origin for a connector (no Origin) and offers prepare_purchase.
  const mcp = await fetch(`${receipt.webOrigin}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(mcp.status, 200);
  assert.ok((await mcp.json()).result.tools.some((tool) => tool.name === "prepare_purchase"));
  const mcpForeign = await fetch(`${receipt.webOrigin}/api/mcp`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(mcpForeign.status, 403);
  await mcpForeign.body?.cancel();

  child.kill("SIGTERM");
  const [code, signal] = await waitForExit(child);
  assert.equal(signal, null);
  assert.equal(code, 0);
});

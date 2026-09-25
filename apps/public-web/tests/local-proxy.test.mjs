import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const { startCapsuleHost } = await import("../build-host/host/server.js");
const { createFixedFactsProxy } = await import("../build-host/ingress/local-proxy.js");

async function startApiFixture() {
  let received;
  const server = createServer((request, response) => {
    received = { method: request.method, url: request.url, origin: request.headers.origin, cookie: request.headers.cookie };
    response.writeHead(404, {
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-benten-artifact-revision": "fixture-v1",
    });
    response.end(JSON.stringify({ error: { code: "unknown_ticker" }, disclaimer: "fixture" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture API did not bind TCP");
  return { server, origin: `http://127.0.0.1:${address.port}`, received: () => received };
}

test("proxies facts only to a launcher-fixed loopback origin and preserves the raw query", async () => {
  const api = await startApiFixture();
  const host = await startCapsuleHost({
    clientDirectory: join(appDirectory, "..", ".generated", "local-web", "output", "client"),
    factsOrigin: api.origin,
  });
  try {
    const response = await fetch(`${host.capsuleAddress}/api/v2/fundamentals?ticker=UNKNOWN&source=browser`, {
      headers: { cookie: "must-not-forward=1", origin: "https://foreign.invalid" },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-benten-artifact-revision"), "fixture-v1");
    assert.deepEqual(await response.json(), { error: { code: "unknown_ticker" }, disclaimer: "fixture" });
    assert.deepEqual(api.received(), {
      method: "GET",
      url: "/api/v2/fundamentals?ticker=UNKNOWN&source=browser",
      origin: undefined,
      cookie: undefined,
    });
  } finally {
    host.close();
    api.server.close();
    await Promise.all([once(host, "close"), once(api.server, "close")]);
  }
});

async function startRelayFixture() {
  let received;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      received = { method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") };
      response.writeHead(429, {
        "cache-control": "no-store",
        "content-type": "application/json",
        "retry-after": "7",
        "set-cookie": "fixture=1",
        "x-upstream-host": "must-not-forward.invalid",
      });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32005, message: "relay rate limit reached" } }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture relay did not bind TCP");
  return { server, origin: `http://127.0.0.1:${address.port}`, received: () => received };
}

function rawRequest(url, { method = "POST", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(url, { method, headers }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

test("forwards the Solana RPC relay body with only the caller-check headers and the edge host", async () => {
  const api = await startRelayFixture();
  const host = await startCapsuleHost({
    clientDirectory: join(appDirectory, "..", ".generated", "local-web", "output", "client"),
    factsOrigin: api.origin,
  });
  try {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] });
    const edgeHost = new URL(host.capsuleAddress).host;
    const response = await rawRequest(`${host.capsuleAddress}/api/solana-rpc`, {
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
        origin: host.capsuleAddress,
        "sec-fetch-site": "same-origin",
        cookie: "must-not-forward=1",
        authorization: "Bearer must-not-forward",
        "x-forwarded-for": "203.0.113.200",
        "x-real-ip": "203.0.113.201",
      },
      body,
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "7");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(response.headers["x-upstream-host"], undefined);
    assert.equal(JSON.parse(response.body).error.code, -32005);

    const received = api.received();
    assert.equal(received.method, "POST");
    assert.equal(received.url, "/api/solana-rpc");
    assert.equal(received.body, body);
    assert.equal(received.headers.host, edgeHost);
    assert.equal(received.headers.origin, host.capsuleAddress);
    assert.equal(received.headers["sec-fetch-site"], "same-origin");
    assert.equal(received.headers["x-real-ip"], "127.0.0.1");
    for (const name of ["cookie", "authorization", "x-forwarded-for"]) {
      assert.equal(received.headers[name], undefined, name);
    }
  } finally {
    host.close();
    api.server.close();
    await Promise.all([once(host, "close"), once(api.server, "close")]);
  }
});

test("forwards a prices GET with only the caller-check headers, the edge host and the raw query", async () => {
  let received;
  const server = createServer((request, response) => {
    received = { method: request.method, url: request.url, headers: request.headers };
    response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json", "set-cookie": "fixture=1" });
    response.end(JSON.stringify({ prices: [], feed_map_revision: "fixture", disclaimer: "fixture" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const host = await startCapsuleHost({
    clientDirectory: join(appDirectory, "..", ".generated", "local-web", "output", "client"),
    factsOrigin: `http://127.0.0.1:${address.port}`,
  });
  try {
    const feed = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
    const response = await rawRequest(`${host.capsuleAddress}/api/prices?feed=${feed}`, {
      method: "GET",
      headers: { "sec-fetch-site": "same-origin", cookie: "must-not-forward=1", "x-forwarded-for": "203.0.113.200" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(received.method, "GET");
    assert.equal(received.url, `/api/prices?feed=${feed}`);
    assert.equal(received.headers.host, new URL(host.capsuleAddress).host);
    assert.equal(received.headers["sec-fetch-site"], "same-origin");
    assert.equal(received.headers["x-real-ip"], "127.0.0.1");
    for (const name of ["cookie", "x-forwarded-for"]) assert.equal(received.headers[name], undefined, name);
  } finally {
    host.close();
    server.close();
    await Promise.all([once(host, "close"), once(server, "close")]);
  }
});

test("answers the prices path with 503 when no API origin was injected", async () => {
  const host = await startCapsuleHost({ clientDirectory: join(appDirectory, "..", ".generated", "local-web", "output", "client") });
  try {
    const response = await rawRequest(`${host.capsuleAddress}/api/prices?feed=x`, { method: "GET" });
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { status: "unavailable", service: "prices" });
  } finally {
    host.close();
    await once(host, "close");
  }
});

test("answers the relay path with 503 when no API origin was injected", async () => {
  const host = await startCapsuleHost({
    clientDirectory: join(appDirectory, "..", ".generated", "local-web", "output", "client"),
  });
  try {
    const response = await rawRequest(`${host.capsuleAddress}/api/solana-rpc`, { body: "{}" });
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { status: "unavailable", service: "solana-rpc" });
  } finally {
    host.close();
    await once(host, "close");
  }
});

test("rejects a non-loopback fixed origin before it can receive a request", () => {
  assert.throws(() => createFixedFactsProxy("https://foreign.invalid"), /127\.0\.0\.1/);
  assert.throws(() => createFixedFactsProxy("http://127.0.0.1"), /explicit port/);
});

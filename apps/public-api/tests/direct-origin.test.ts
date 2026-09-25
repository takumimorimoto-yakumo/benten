import { afterEach, describe, expect, it } from "vitest";
import { startPublicApi, type PublicApiServer } from "../src/node.js";

let active: PublicApiServer | undefined;
afterEach(async () => {
  await active?.close();
  active = undefined;
});

describe("standalone public API process", () => {
  it("binds loopback port zero and serves direct facts with CORS closed", async () => {
    active = await startPublicApi();
    expect(active.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${active.origin}/api/fundamentals/NVDA`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ found: true, ticker: "NVDA" });
  });

  it("keeps the direct API usable independently of any Web process", async () => {
    active = await startPublicApi({ host: "127.0.0.1", port: 0 });
    const response = await fetch(`${active.origin}/api/v2/financials?ticker=NVDA&statement=cf`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { found: true } });
  });

  it("preserves HEAD headers and normalizes unknown methods at the real HTTP boundary", async () => {
    active = await startPublicApi();
    const path = "/api/v2/fundamentals?ticker=NVDA";
    const get = await fetch(`${active.origin}${path}`);
    const head = await fetch(`${active.origin}${path}`, { method: "HEAD" });
    expect(head.status).toBe(get.status);
    for (const name of ["content-type", "cache-control", "x-benten-artifact-revision"]) {
      expect(head.headers.get(name), name).toBe(get.headers.get(name));
    }
    expect(await head.text()).toBe("");

    const unknown = await fetch(`${active.origin}/api/unknown`, { method: "OPTIONS" });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("allow")).toBeNull();
    expect(unknown.headers.get("content-type")).toBe("application/json");
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: "unknown_endpoint" } });
  });
});

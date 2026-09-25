import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_UPSTREAM_URL, UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay";

import * as route from "./route";

const SECRET_UPSTREAM = "https://paid-rpc.example.invalid/v1/secret-key-123";
const SAME_ORIGIN = { host: "benten.test", origin: "https://benten.test", "sec-fetch-site": "same-origin" };

function post(): Request {
  return new Request("https://benten.test/api/solana-rpc", {
    method: "POST",
    headers: { "content-type": "application/json", ...SAME_ORIGIN },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] }),
  });
}

function okUpstream() {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: null } }), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("legacy Next solana-rpc route", () => {
  it("reads the upstream only from the server environment", async () => {
    vi.stubEnv(UPSTREAM_URL_ENV, SECRET_UPSTREAM);
    const fetchMock = okUpstream();
    vi.stubGlobal("fetch", fetchMock);

    const response = await route.POST(post());

    expect(response.status).toBe(200);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(SECRET_UPSTREAM);
  });

  it("uses the public mainnet endpoint when the variable is empty", async () => {
    vi.stubEnv(UPSTREAM_URL_ENV, "");
    const fetchMock = okUpstream();
    vi.stubGlobal("fetch", fetchMock);

    await route.POST(post());

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(new URL(DEFAULT_UPSTREAM_URL).href);
  });

  it.each(["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const)("answers %s with 405", async (method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = route[method]();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

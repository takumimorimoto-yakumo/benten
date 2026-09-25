import { describe, expect, it } from "vitest";
import { MCP_PATH } from "@benten/mcp/config";
import { classifyWebIngress } from "../ingress/classify.ts";

const paths = new Set<string>(["/"]);

describe("public Web ingress: remote MCP endpoint", () => {
  it("routes only the exact MCP path to the MCP decision", () => {
    expect(MCP_PATH).toBe("/api/mcp");
    expect(classifyWebIngress("/api/mcp", { staticPaths: paths })).toEqual({ kind: "proxy_mcp", pathname: "/api/mcp", search: "" });
  });

  it("leaves near misses to the facts decision, where they are the unknown-path 404", () => {
    for (const nearMiss of ["/api/mcp/extra", "/api/MCP", "/api/mcpx", "/api/mc"]) {
      expect(classifyWebIngress(nearMiss, { staticPaths: paths }).kind, nearMiss).toBe("proxy_facts");
    }
    expect(classifyWebIngress("/api/mcp/", { staticPaths: paths })).toEqual({ kind: "html_not_found", status: 404 });
  });
});

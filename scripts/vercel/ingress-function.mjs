/**
 * Entry of the hosted ingress function; bundled by `build-output.mjs` into
 * `.vercel/output/functions/_benten/ingress.func/index.mjs`. It composes the
 * public Web's hosted ingress with the facts API in one process. The server
 * environment (`SOLANA_RPC_UPSTREAM_URL`, `SOLANA_RPC_RELAY_ALLOWED_ORIGINS`)
 * is read per request by the API routes and never reaches a response.
 */
import { readFileSync } from "node:fs";
import { createEnvironmentPublicApiHandler } from "../../apps/public-api/dist/node.js";
import { createHostedIngress } from "../../apps/public-web/build-host/host/hosted-ingress.js";

const data = JSON.parse(readFileSync(new URL("./ingress-data.json", import.meta.url), "utf8"));
const notFound = new Map(Object.entries(data.notFound).map(([path, body]) => [path, Buffer.from(body, "utf8")]));

/**
 * The platform's client address. The hosting edge sets `X-Real-IP` (and the
 * first `X-Forwarded-For` entry) to the connecting client and does not pass a
 * client-sent value through; a function is reachable only through that edge.
 */
function platformClientAddress(request) {
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  const forwarded = request.headers["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : "";
  return first || undefined;
}

/**
 * The read-only quote reader of the fixed purchase route (MCP
 * `prepare_purchase`), bundled from source into its own chunk and loaded on
 * the first quote: it carries the Solana and pool SDKs, which no other route
 * (relay, prices, facts, 404) needs, so their cold start does not load it.
 * One reader per instance; a failed load is retried on the next quote.
 */
let quoteReader;
export async function purchaseQuote(amountText) {
  quoteReader ??= import("../../packages/purchase/src/server-quote.ts").then(
    ({ createServerQuoteReader }) => createServerQuoteReader({ env: process.env }),
    (error) => {
      quoteReader = undefined;
      throw error;
    },
  );
  return (await quoteReader)(amountText);
}

export default createHostedIngress({
  staticPaths: new Set(data.staticPaths),
  notFound: (documentPath) => {
    const body = notFound.get(documentPath);
    return body && { contentType: data.notFoundContentType, body: async () => body };
  },
  api: createEnvironmentPublicApiHandler({ env: process.env, purchaseQuote }),
  clientAddress: platformClientAddress,
});

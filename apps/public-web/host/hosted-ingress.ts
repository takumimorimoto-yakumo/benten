import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { classifyWebIngress, type WebIngressContext } from "../ingress/classify.js";
import {
  FORWARDED_RELAY_RESPONSE_HEADERS,
  FORWARDED_RESPONSE_HEADERS,
  callerCheckRequestHeaders,
  callerCheckedRequestHeaders,
  callerCheckedResponseHeaderNames,
  pickResponseHeaders,
} from "../ingress/local-proxy.js";
import { apiUnavailable, send, sendHostError, sendNotFound, type NotFoundLookup } from "./responses.js";

/**
 * The hosted-function side of Web ingress: every request the hosted static
 * file layer does not answer itself. It applies the same `classifyWebIngress`
 * decision and the same response primitives as the loopback host
 * (`server.ts`), with one difference: the facts API runs in the same process
 * instead of behind a loopback origin, so the API handler is injected rather
 * than proxied. Request and response headers crossing into the API follow the
 * loopback proxy's allowlists exactly.
 */

export type PublicApiFetch = (request: Request) => Promise<Response>;

export type HostedIngressOptions = {
  /** The same servable path set the static layer publishes. */
  readonly staticPaths: ReadonlySet<string>;
  readonly notFound: NotFoundLookup;
  readonly api: PublicApiFetch;
  /** The platform's trusted client address for one request, used as `X-Real-IP`. */
  readonly clientAddress: (request: IncomingMessage) => string | undefined;
};

/** Only the pathname and query reach the API; the base is a fixed placeholder, never a request input. */
const API_BASE = "http://public-api.invalid";

function apiRequest(request: IncomingMessage, method: string, url: string, headers: Record<string, string>, withBody: boolean): Request {
  if (!withBody || method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit);
}

async function sendApiResponse(response: ServerResponse, method: string, upstream: Response, names: ReadonlySet<string>) {
  const body = method === "HEAD" ? undefined : Buffer.from(await upstream.arrayBuffer());
  send(response, upstream.status, pickResponseHeaders(upstream.headers, names), body);
}

export function createHostedIngress(options: HostedIngressOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const context = { staticPaths: options.staticPaths } satisfies WebIngressContext;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const method = request.method?.toUpperCase() ?? "GET";
    const target = request.url ?? "/";
    const decision = classifyWebIngress(target, context);

    if (decision.kind === "proxy_acquisition") return apiUnavailable(response, method, "acquisition");
    if (decision.kind === "proxy_solana_rpc" || decision.kind === "proxy_prices") {
      const headers = callerCheckRequestHeaders(request.headers, options.clientAddress(request));
      // Only the relay carries a body, as on the loopback proxy.
      const upstream = await options.api(apiRequest(request, method, `${API_BASE}${decision.pathname}${decision.search}`, headers, decision.kind === "proxy_solana_rpc"));
      return sendApiResponse(response, method, upstream, FORWARDED_RELAY_RESPONSE_HEADERS);
    }
    if (decision.kind === "proxy_mcp") {
      const headers = callerCheckedRequestHeaders(request, "mcp", options.clientAddress(request));
      const upstream = await options.api(apiRequest(request, method, `${API_BASE}${decision.pathname}${decision.search}`, headers, true));
      return sendApiResponse(response, method, upstream, callerCheckedResponseHeaderNames("mcp"));
    }
    if (decision.kind === "proxy_facts") {
      // Facts requests carry no client header, cookie, body or origin.
      const upstream = await options.api(apiRequest(request, method, `${API_BASE}${decision.pathname}${decision.search}`, {}, false));
      return sendApiResponse(response, method, upstream, FORWARDED_RESPONSE_HEADERS);
    }
    if (decision.kind === "canonical_redirect") return send(response, decision.status, { location: decision.location });
    if (decision.kind === "html_not_found") return sendNotFound(response, method, target, options.notFound);
    if (method !== "GET" && method !== "HEAD") return send(response, 405, { allow: "GET, HEAD" });
    // A GET/HEAD for a static path is the static layer's to answer. Reaching
    // here means the routing table and the path set disagree: fail loudly.
    throw new Error("static path reached the hosted ingress function");
  }

  return (request, response) => handle(request, response).catch(() => sendHostError(response));
}

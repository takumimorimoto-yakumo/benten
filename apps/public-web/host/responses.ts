import type { ServerResponse } from "node:http";
import { notFoundDocumentFor, notFoundDocumentPath } from "../app/lib/not-found.js";

/**
 * Response primitives shared by every Web host adapter (the loopback host and
 * the hosted function), so a 404 body, a 503 and an error look the same on both.
 */

export type NotFoundBody = { readonly contentType: string; readonly body: () => Promise<Buffer> };
export type NotFoundLookup = (documentPath: string) => NotFoundBody | undefined;

export function send(response: ServerResponse, status: number, headers: Record<string, string>, body?: string | Buffer) {
  response.writeHead(status, headers);
  response.end(body);
}

/**
 * A 404 for a public path Benten cannot serve: the prerendered not-found body
 * for the path's locale and scope when the build has one, plain text otherwise.
 */
export async function sendNotFound(response: ServerResponse, method: string, target: string, lookup: NotFoundLookup) {
  const { locale, scope } = notFoundDocumentFor(target);
  const entry = lookup(notFoundDocumentPath(locale, scope));
  if (!entry) return send(response, 404, { "content-type": "text/plain; charset=utf-8" }, method === "HEAD" ? undefined : "Not found");
  const body = method === "HEAD" ? undefined : await entry.body();
  return send(response, 404, { "content-type": entry.contentType, "cache-control": "no-store" }, body);
}

export function apiUnavailable(response: ServerResponse, method: string, service: "acquisition" | "facts") {
  const body = JSON.stringify({ status: "unavailable", service });
  send(response, 503, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  }, method === "HEAD" ? undefined : body);
}

/** The last-resort answer of a host adapter whose handler threw. */
export function sendHostError(response: ServerResponse) {
  if (!response.headersSent) send(response, 500, { "content-type": "text/plain; charset=utf-8" }, "Unavailable");
  else response.destroy();
}

/**
 * The Build Output API v3 route table for the single hosted Project.
 *
 * Division of work, mirroring the loopback host (`apps/public-web/host/server.ts`):
 * the static file layer answers only an exact `GET`/`HEAD` of a path in the
 * servable inventory; every other request goes to one function that runs
 * `classifyWebIngress` itself and answers exactly like the loopback host
 * (facts, relay and prices in process; canonical 308; scoped HTML 404).
 * The routes therefore never re-implement the classifier. They only decide
 * "exact static hit or not", and every route below that sends a request to the
 * function exists because the platform's file layer might otherwise answer a
 * request the classifier would not treat as that static path.
 */

export const INGRESS_FUNCTION = "_benten/ingress";
export const INGRESS_DEST = `/${INGRESS_FUNCTION}`;

/** Methods the static layer may answer; every other method goes to the function (405 or 404 there). */
export const STATIC_METHODS = Object.freeze(["GET", "HEAD"]);
/** Every other method a client can send; the function answers them as the loopback host does. */
export const NON_STATIC_METHODS = Object.freeze(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A `src` regular expression string longer than this is rejected by the
 * platform's route processing (`invalid_routes` / `process-and-upload-routes`).
 * Chunking below this bound, with margin, keeps every emitted route well
 * under that limit regardless of how many published data files there are.
 */
export const MAX_HEADER_ROUTE_SRC_LENGTH = 2048;

/** The two characters that wrap the alternation, `^(?:` and `)$`. */
const ALTERNATION_WRAPPER_LENGTH = "^(?:".length + ")$".length;

/**
 * Split already-escaped path alternatives into ordered groups so that each
 * group's `^(?:a|b|...)$` string never exceeds `maxLength`. Greedy and
 * order-preserving: every input appears in exactly one output group, and the
 * groups, concatenated in order, reproduce the input order.
 */
export function chunkEscapedAlternatives(escapedPaths, maxLength) {
  const chunks = [];
  let current = [];
  let bodyLength = 0;
  for (const path of escapedPaths) {
    if (ALTERNATION_WRAPPER_LENGTH + path.length > maxLength) {
      throw new Error(`a single route alternative (${path.length} chars) cannot fit within maxLength ${maxLength}`);
    }
    const separatorLength = current.length > 0 ? 1 : 0;
    const nextBodyLength = bodyLength + separatorLength + path.length;
    if (current.length > 0 && ALTERNATION_WRAPPER_LENGTH + nextBodyLength > maxLength) {
      chunks.push(current);
      current = [path];
      bodyLength = path.length;
    } else {
      current.push(path);
      bodyLength = nextBodyLength;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * `cacheControl`: servable paths whose static file carries a Cache-Control
 * header (the published data files: statements and prices), by that header value. Each value
 * becomes one or more routes that together name the exact published paths (a
 * single `src` alternation of every path would exceed the platform's `src`
 * length limit once enough data files are published), so a request for any
 * other path never gets the header; they sit after every route that sends a
 * request to the function, so only an exact static hit reaches them.
 */
export function buildRoutes(cacheControl = new Map()) {
  const headerRoutes = [...cacheControl].flatMap(([value, paths]) => {
    const escapedPaths = [...paths].sort().map(escapeRegExp);
    return chunkEscapedAlternatives(escapedPaths, MAX_HEADER_ROUTE_SRC_LENGTH).map((chunk) => ({
      src: `^(?:${chunk.join("|")})$`,
      headers: { "cache-control": value },
      continue: true,
    }));
  });
  return [
    // Every API path, including near misses and malformed ones: the function
    // classifies it (relay, prices, facts, acquisition 503, or HTML 404).
    { src: "^/api(?:/.*)?$", dest: INGRESS_DEST },
    // Percent-encoded paths: the classifier redirects a valid encoding alias
    // and rejects every other; the file layer must not decode and serve them.
    { src: "^.*%.*$", dest: INGRESS_DEST },
    // Non-canonical shapes the file layer might normalize: empty and dot
    // segments, and a trailing slash anywhere but the root.
    { src: "^(?:.*//.*|.*/\\.{1,2}(?:/.*)?|.+/)$", dest: INGRESS_DEST },
    // No `.html` address is a page: this blocks `/index.html` and the
    // published file names behind the path overrides.
    { src: "^.*\\.html$", dest: INGRESS_DEST },
    // Only GET and HEAD may reach static files; other methods get the host's 405/404.
    { src: "^.*$", methods: [...NON_STATIC_METHODS], dest: INGRESS_DEST },
    ...headerRoutes,
    { handle: "filesystem" },
    // Everything the file layer does not have: casing alias 308 or scoped 404.
    { src: "^.*$", dest: INGRESS_DEST },
  ];
}

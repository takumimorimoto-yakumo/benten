/**
 * Browser-side read client for the standalone facts API. The browser may use
 * only the current Web origin: choosing a direct API origin would bypass the
 * local host's fixed-origin boundary and reintroduce CORS as a product input.
 */

export type PublicApiErrorPayload = {
  readonly code: string;
  readonly message?: string;
};

export class PublicApiClientError extends Error {
  readonly status: number;
  readonly payload?: PublicApiErrorPayload;

  constructor(status: number, message: string, payload?: PublicApiErrorPayload) {
    super(message);
    this.name = "PublicApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorPayload(value: unknown): PublicApiErrorPayload | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.error) && typeof value.error.code === "string") {
    return typeof value.error.message === "string"
      ? { code: value.error.code, message: value.error.message }
      : { code: value.error.code };
  }
  // v2 facts envelopes intentionally keep their schema under `data`.
  if (isRecord(value.data) && typeof value.data.reason === "string") return { code: value.data.reason };
  return undefined;
}

/** Reject protocol-relative, absolute, fragment, and non-facts paths. */
function sameOriginFactsPath(path: string): string {
  if (
    !path.startsWith("/api/")
    || path.startsWith("//")
    || path.includes("#")
    || path.includes("\\")
    || /[\u0000-\u001f\u007f\s]/.test(path)
  ) throw new TypeError("public facts requests must use a same-origin /api/ path");
  return path;
}

/**
 * Fetch a read-only facts response through the public Web origin. The returned
 * value is intentionally `unknown`: the API package owns the response schema,
 * and a future screen must validate the specific endpoint contract before use.
 */
export async function requestPublicFacts(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(sameOriginFactsPath(path), {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    throw new PublicApiClientError(response.status, "facts API returned invalid JSON");
  }
  if (!response.ok) {
    const payload = errorPayload(body);
    throw new PublicApiClientError(response.status, payload?.message ?? "facts API request failed", payload);
  }
  return body;
}

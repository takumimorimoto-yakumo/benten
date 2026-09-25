import { createSolanaRpcRelayHandler, methodNotAllowedResponse } from "@benten/solana-rpc-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only Solana JSON-RPC relay for the browser purchase island. The relay
 * itself (method allowlist, no signed bytes, caller check, rate limit, and an
 * upstream URL read only from the server environment) lives in
 * `@benten/solana-rpc-relay`, shared with the standalone facts API. One
 * handler, and so one rate limiter, per server instance.
 */
export const POST = createSolanaRpcRelayHandler({ env: process.env });

export function GET(): Response {
  return methodNotAllowedResponse();
}
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const HEAD = GET;
export const OPTIONS = GET;

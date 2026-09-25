/**
 * Display names of the DEX programs a route can go through. Proper names,
 * the same in every locale: the remote MCP route facts and the buy panel's
 * route lines both read them from here.
 */

import type { RouteDex } from "./routes-table";

export const ROUTE_DEX_LABELS = {
  "meteora-dlmm": "Meteora DLMM",
  "raydium-clmm": "Raydium CLMM",
} as const satisfies Record<RouteDex, string>;

export type RouteDexLabel = (typeof ROUTE_DEX_LABELS)[RouteDex];

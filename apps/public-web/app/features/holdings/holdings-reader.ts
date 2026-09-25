/**
 * The browser read of one wallet's holdings: `readHoldingsThroughRelay` over
 * the same-origin read-only relay. Nothing is logged and nothing but the
 * public key leaves the page, and only to the relay.
 */
import { readHoldingsThroughRelay, type HoldingsObservation } from "@benten/holdings/read-holdings";
import { SOLANA_RPC_RELAY_PATH } from "@benten/solana-rpc-relay/config";
import { createHoldingsStore } from "./holdings-store";

export function readBrowserHoldings(owner: string): Promise<HoldingsObservation> {
  return readHoldingsThroughRelay(owner, { relayUrl: `${window.location.origin}${SOLANA_RPC_RELAY_PATH}` });
}

/** This visit's holdings observations, shared by every mount of the Holdings page. */
export const browserHoldingsStore = createHoldingsStore(readBrowserHoldings);

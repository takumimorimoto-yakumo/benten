"use client";

import { useState } from "react";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@benten/solana";

import {
  buildNvdaxUsdcExactInSwap,
  NVDAX_MINT,
  NVDAX_USDC_POOL,
  USDC_MINT,
  type BuildSwapResult,
} from "@benten/purchase/build-swap";

/** Same-origin, read-only RPC relay (`app/api/solana-rpc/route.ts`). The browser never learns the upstream URL. */
const RPC_RELAY_PATH = "/api/solana-rpc";
/** Standard SPL / Token-2022 token account layout: the raw amount is a little-endian u64 at this byte offset. */
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;
const DEFAULT_USDC_IN_RAW = "1000000"; // 1 USDC, raw (6 decimals)
const DEFAULT_SLIPPAGE_BPS = "100"; // 1%

interface SimulateSummary {
  err: unknown;
  unitsConsumed: number | null;
  logs: string[];
  /** The user's NVDAx associated token account, read before and (simulated) after the swap. */
  nvdaxAccount: string;
  nvdaxBeforeRaw: string | null;
  nvdaxAfterSimulatedRaw: string | null;
  nvdaxDeltaSimulatedRaw: string | null;
}

type SpikeState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      build: {
        input: BuildSwapResult["input"];
        quote: BuildSwapResult["quote"];
        binArrays: string[];
        instructions: BuildSwapResult["instructions"];
      };
      simulate: SimulateSummary;
    }
  | { status: "error"; message: string };

function tokenAccountAmountRaw(data: Uint8Array): bigint | null {
  if (data.byteLength < TOKEN_ACCOUNT_AMOUNT_OFFSET + 8) return null;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(TOKEN_ACCOUNT_AMOUNT_OFFSET, true);
}

function base64Bytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function replaceBigInt(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * DEV-ONLY spike page for gate G-B1
 * (`specs/stocklana-submission-plan-2026-09-23.md`). Not linked from
 * production navigation and not part of the purchase UI.
 *
 * Verifies, inside an actual browser bundle, that
 * `packages/purchase/src/build-swap.ts` builds the pinned NVDAx/USDC exact-in
 * swap and that a no-funds `simulateTransaction` of the unsigned result
 * succeeds. Never signs or sends anything: the public key entered below is
 * only ever used to build and simulate a transaction, exactly like the
 * library it calls. Enter a real, USDC-funded wallet address to get a
 * realistic (non-error) simulate result.
 *
 * Every RPC call goes to the same-origin read-only relay over HTTP; nothing
 * here opens a WebSocket subscription (confirmation, when it exists, polls).
 */
export default function PurchaseSpikePage() {
  const [userAddress, setUserAddress] = useState("");
  const [usdcInAmountRaw, setUsdcInAmountRaw] = useState(DEFAULT_USDC_IN_RAW);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [state, setState] = useState<SpikeState>({ status: "idle" });

  async function run() {
    setState({ status: "running" });
    try {
      // Built on click (not at render) so server rendering never needs `window`.
      const connection = new Connection(`${window.location.origin}${RPC_RELAY_PATH}`, "confirmed");
      const userPublicKey = new PublicKey(userAddress.trim());
      const [nvdaxAccount] = PublicKey.findProgramAddressSync(
        [userPublicKey.toBytes(), TOKEN_2022_PROGRAM_ID.toBytes(), NVDAX_MINT.toBytes()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const nvdaxBefore = await connection.getAccountInfo(nvdaxAccount);
      const nvdaxBeforeRaw = nvdaxBefore ? tokenAccountAmountRaw(nvdaxBefore.data) : 0n;
      const result = await buildNvdaxUsdcExactInSwap({
        connection,
        userPublicKey,
        usdcInAmountRaw: BigInt(usdcInAmountRaw),
        slippageBps: Number(slippageBps),
      });

      // `simulateTransaction`'s (sigVerify, replaceRecentBlockhash) config overload
      // is only typed (and only accepted at runtime -- the legacy-Transaction
      // overload throws "Invalid arguments" for a non-array second argument)
      // for a VersionedTransaction. Wrap the built legacy Transaction's already
      // -compiled message; this changes no instruction, account, or amount.
      const versionedTransaction = new VersionedTransaction(result.transaction.compileMessage());
      const simResult = await connection.simulateTransaction(versionedTransaction, {
        sigVerify: false,
        replaceRecentBlockhash: true,
        accounts: { encoding: "base64", addresses: [nvdaxAccount.toBase58()] },
      });
      const nvdaxAfterAccount = simResult.value.accounts?.[0] ?? null;
      const nvdaxAfterSimulatedRaw = nvdaxAfterAccount ? tokenAccountAmountRaw(base64Bytes(nvdaxAfterAccount.data[0])) : null;

      setState({
        status: "done",
        build: {
          input: result.input,
          quote: result.quote,
          binArrays: result.binArrays,
          instructions: result.instructions,
        },
        simulate: {
          err: simResult.value.err,
          unitsConsumed: simResult.value.unitsConsumed ?? null,
          logs: simResult.value.logs ?? [],
          nvdaxAccount: nvdaxAccount.toBase58(),
          nvdaxBeforeRaw: nvdaxBeforeRaw === null ? null : nvdaxBeforeRaw.toString(),
          nvdaxAfterSimulatedRaw: nvdaxAfterSimulatedRaw === null ? null : nvdaxAfterSimulatedRaw.toString(),
          nvdaxDeltaSimulatedRaw: nvdaxBeforeRaw === null || nvdaxAfterSimulatedRaw === null
            ? null
            : (nvdaxAfterSimulatedRaw - nvdaxBeforeRaw).toString(),
        },
      });
    } catch (error: unknown) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">Purchase spike (gate G-B1, dev only)</h2>
      <p className="section__note">
        Pool <code>{NVDAX_USDC_POOL.toBase58()}</code>, NVDAx{" "}
        <code>{NVDAX_MINT.toBase58()}</code>, USDC <code>{USDC_MINT.toBase58()}</code>. Builds one
        unsigned exact-in swap with the Meteora DLMM SDK and runs a no-funds
        <code> simulateTransaction</code> through the read-only relay <code>{RPC_RELAY_PATH}</code>.
        This page never signs or sends anything, and is not linked from production navigation.
      </p>

      <div className="panel">
        <label>
          User public key (enter a real, USDC-funded wallet address for a realistic simulate)
          <input
            id="user-public-key"
            value={userAddress}
            onChange={(event) => setUserAddress(event.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          USDC in (raw integer, 6 decimals)
          <input
            id="usdc-in-raw"
            value={usdcInAmountRaw}
            onChange={(event) => setUsdcInAmountRaw(event.target.value)}
          />
        </label>
        <label>
          Slippage (bps)
          <input
            id="slippage-bps"
            value={slippageBps}
            onChange={(event) => setSlippageBps(event.target.value)}
          />
        </label>
        <button
          id="run-spike"
          type="button"
          className="button"
          onClick={() => void run()}
          disabled={state.status === "running"}
        >
          {state.status === "running" ? "Building + simulating…" : "Build & simulate"}
        </button>
      </div>

      <pre id="spike-result" data-testid="spike-result">
        {JSON.stringify(state, replaceBigInt, 2)}
      </pre>
    </section>
  );
}

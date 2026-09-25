"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getXStockHoldings, type XStockHolding } from "@benten/solana";

import { CoverageBadge } from "@/components/CoverageBadge";
import { EMPTY_VALUE, formatNumber, shortenAddress } from "@/lib/format";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; holdings: XStockHolding[]; slot: number }
  | { status: "error"; message: string };

const RPC_ERROR_MESSAGE =
  "Could not read this wallet from the Solana RPC endpoint. Public endpoints are rate-limited; try again, or point NEXT_PUBLIC_SOLANA_RPC_URL at your own endpoint.";

/**
 * Read-only wallet panel.
 *
 * SECURITY: this component reads balances and nothing else. It never
 * requests a signature, never builds a transaction, and never touches a
 * private key. The only RPC traffic it causes is the read issued by
 * `@benten/solana`.
 */
export function WalletSection({ registrySize }: { registrySize: number }) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  // Monotonic token so that a slow in-flight read from a previous wallet or a
  // previous render can never overwrite a newer result.
  const requestId = useRef(0);

  const address = publicKey?.toBase58() ?? null;

  const load = useCallback(async () => {
    if (!publicKey) {
      requestId.current += 1;
      setState({ status: "idle" });
      return;
    }
    const id = (requestId.current += 1);
    setState({ status: "loading" });
    try {
      const { holdings, slot } = await getXStockHoldings(connection, publicKey);
      if (requestId.current === id) setState({ status: "loaded", holdings, slot });
    } catch (error: unknown) {
      // A rate-limited or unreachable RPC endpoint is an expected condition,
      // not a crash: surface it and leave the rest of the page working.
      console.warn("xStocks holdings lookup failed", error);
      if (requestId.current === id) setState({ status: "error", message: RPC_ERROR_MESSAGE });
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="section" aria-labelledby="wallet-heading">
      <h2 className="section__title" id="wallet-heading">
        Your wallet
      </h2>
      <p className="section__note">
        Connect a Solana wallet to list the xStocks it holds. Benten reads balances
        only: it never asks for a signature, never builds a transaction, and never
        sees a private key. Nothing is read until you connect.
      </p>

      <div className="panel">
        <div className="panel__row">
          <WalletMultiButton />
          {address ? (
            <span className="mono muted" title={address}>
              {shortenAddress(address)}
            </span>
          ) : null}
          {connected && state.status !== "loading" ? (
            <button type="button" className="button" onClick={() => void load()}>
              Refresh
            </button>
          ) : null}
        </div>

        {state.status === "idle" ? (
          <p className="muted text-sm">
            No wallet connected. Connecting lists the xStocks this wallet holds,
            with a link to the filed financials behind each one.
          </p>
        ) : null}

        {state.status === "loading" ? (
          <p className="muted text-sm">Reading token accounts…</p>
        ) : null}

        {state.status === "error" ? (
          <div className="notice">
            <p>{state.message}</p>
          </div>
        ) : null}

        {state.status === "loaded" && state.holdings.length === 0 ? (
          <p className="muted text-sm">
            This wallet holds none of the <span className="num">{registrySize}</span>{" "}
            xStocks tokens in the registry (read at slot{" "}
            <span className="num">{formatNumber(state.slot)}</span>).
          </p>
        ) : null}

        {state.status === "loaded" && state.holdings.length > 0 ? (
          <>
            <p className="muted text-sm">
              Read at slot <span className="num">{formatNumber(state.slot)}</span>.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ticker</th>
                    <th scope="col">Name</th>
                    <th scope="col" className="cell--numeric">
                      Amount
                    </th>
                    <th scope="col">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {state.holdings.map((holding) => (
                    <tr key={holding.mint}>
                      <td className="cell--tight">
                        <Link href={`/stock/${holding.ticker}`}>{holding.ticker}</Link>
                      </td>
                      <td>{holding.name}</td>
                      <td className="cell--numeric">
                        {holding.amount === null ? EMPTY_VALUE : formatNumber(holding.amount)}
                      </td>
                      <td>
                        <CoverageBadge covered={holding.fundamentals_available} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

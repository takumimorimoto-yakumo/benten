"use client";

import { DataStateNotice } from "@/components/data-state-notice";
import { MintLookupForm } from "@/components/mint-lookup-form";
import type { FinancialResultData } from "@/lib/public-result";
import { SITE_COPY } from "@/lib/site-copy";

/** Network-free state specimens for the development-only catalog. */
export function CatalogLookupStates({ unknown }: { unknown: FinancialResultData }) {
  return <><MintLookupForm defaultMint="" loading onResolve={async () => null} onInvalid={() => undefined} onEdit={() => undefined} /><MintLookupForm defaultMint="not-a-solana-mint" loading={false} initialError={SITE_COPY.invalidMint} onResolve={async () => "invalid_input"} onInvalid={() => undefined} onEdit={() => undefined} /><DataStateNotice data={unknown} /></>;
}

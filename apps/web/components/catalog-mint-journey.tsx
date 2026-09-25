"use client";

import { MintJourney } from "@/components/mint-journey";
import type { FinancialResult } from "@/lib/public-result";

/** Public, deterministic catalog adapter. It never calls the runtime API. */
export function CatalogMintJourney({ defaultMint, fixtures }: { defaultMint: string; fixtures: Record<string, FinancialResult> }) {
  const fallback = fixtures[defaultMint];
  return <MintJourney defaultMint={defaultMint} resolver={async (mint) => fixtures[mint] ?? fallback} />;
}

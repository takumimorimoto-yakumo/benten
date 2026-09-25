import { describe, expect, it } from "vitest";
import {
  companyForProviderAsset,
  companyForXStock,
  findCompany,
  isWithheldFromProduct,
  listCompanies,
  listedCompanyMap,
  productXStocks,
  providerAssets,
  xstocks,
} from "./index.js";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

describe("company read model across both maps", () => {
  it("lists the 8 private and 129 US-listed companies in slug order", () => {
    const all = listCompanies();
    expect(all).toHaveLength(137);
    expect(all.map((item) => item.slug)).toEqual([...all.map((item) => item.slug)].sort());
    expect(new Set(all.map((item) => item.slug)).size).toBe(all.length);
    expect(listCompanies({ listing_status: "private" })).toHaveLength(8);
    expect(listCompanies({ listing_status: "us_listed" })).toHaveLength(129);
    expect(listCompanies({ listing_status: "private" }).every((item) => item.map_review === "reviewed")).toBe(true);
    // The generated map stays pending until a person reviews it.
    expect(listedCompanyMap.generation.human_review.status).toBe("pending");
    expect(listCompanies({ listing_status: "us_listed" }).every((item) => item.map_review === "pending")).toBe(true);
  });

  it("filters by an exact purchasable-mint predicate supplied by the caller", () => {
    const isPurchasableMint = (mint: string) => mint === NVDAX_MINT;
    expect(listCompanies({ purchasable_mint: isPurchasableMint })).toEqual([
      { slug: "nvidia", display_name: "NVIDIA", listing_status: "us_listed", map_review: "pending", instrument_count: 1 },
    ]);
    expect(listCompanies({ listing_status: "private", purchasable_mint: isPurchasableMint })).toEqual([]);
    // Only a strict `true` counts: a truthy non-boolean never widens the list.
    expect(listCompanies({ purchasable_mint: (() => 1) as unknown as (mint: string) => boolean })).toEqual([]);
  });

  it("rejects a malformed filter instead of widening the list", () => {
    for (const input of [{ listing_status: "public" }, { listing: "private" }, { purchasable_mint: "yes" }, [], null]) {
      expect(() => listCompanies(input as never)).toThrow(TypeError);
    }
  });

  it("finds US-listed companies exactly and resolves their xStock through the product allowlist", () => {
    const nvidia = findCompany("nvidia")!;
    expect(nvidia).toMatchObject({ display_name: "NVIDIA", sec_registrant_name: "NVIDIA CORP", listing_status: "us_listed", map_review: "pending" });
    expect(findCompany("openai")).toMatchObject({ sec_registrant_name: null });
    expect(nvidia.instruments.map((instrument) => instrument.source === "xstocks_registry" ? instrument.entry.ticker : null)).toEqual(["NVDA"]);
    for (const slug of ["NVIDIA", " nvidia", "nvidia ", "nvda", "nvidia-corp", ""]) expect(findCompany(slug)).toBeUndefined();
  });

  it("links every mapped product xStock to its company and no other registry row", () => {
    const mapped = new Set(listedCompanyMap.companies.map((company) => company.instruments[0].ticker));
    for (const entry of productXStocks) {
      const reference = companyForXStock(entry.ticker);
      if (mapped.has(entry.ticker)) expect(findCompany(reference?.slug)?.instruments.length).toBe(1);
      else expect(reference).toBeUndefined();
    }
    for (const entry of xstocks.filter(isWithheldFromProduct)) expect(companyForXStock(entry.ticker)).toBeUndefined();
    for (const ticker of ["STRC", "SPY", "nvda", " NVDA", "NVDAx"]) expect(companyForXStock(ticker)).toBeUndefined();
    expect(companyForXStock("BAC")).toEqual({ slug: "bank-of-america", display_name: "Bank of America" });
    expect(companyForXStock("MSTR")).toEqual({ slug: "strategy", display_name: "Strategy" });
    expect(companyForXStock(undefined)).toBeUndefined();
  });

  it("keeps provider instruments on private companies only", () => {
    for (const entry of providerAssets.entries) {
      const reference = companyForProviderAsset(entry.provider, entry.provider_asset_id)!;
      expect(findCompany(reference.slug)?.listing_status).toBe("private");
    }
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { isWithheldFromProduct, productXStocks, providerAssets, xstocks } from "@benten/registry";
import {
  SUPPORTED_PRODUCTS,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESSES,
  supportedProductForMint,
} from "./supported-products.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./index.js";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("every product xStocks entry and every PreStocks entry is a supported product, and nothing else", () => {
  const prestocks = providerAssets.entries.filter((entry) => entry.provider === "prestocks");
  assert.equal(SUPPORTED_PRODUCTS.size, productXStocks.length + prestocks.length);
  for (const entry of xstocks.filter(isWithheldFromProduct)) {
    assert.equal(supportedProductForMint(entry.mint), undefined, `${entry.ticker} is withheld from the product`);
  }
  for (const entry of productXStocks) {
    assert.deepEqual(SUPPORTED_PRODUCTS.get(entry.mint), { kind: "xstock", mint: entry.mint, symbol: entry.symbol, ticker: entry.ticker });
  }
  for (const entry of prestocks) {
    assert.deepEqual(SUPPORTED_PRODUCTS.get(entry.mint_or_contract), {
      kind: "prestocks",
      mint: entry.mint_or_contract,
      providerAssetId: entry.provider_asset_id,
      symbol: entry.symbol,
    });
  }
  assert.ok(prestocks.length >= 8, "the PreStocks catalog is part of the supported set");
});

test("lookup is exact mint equality only", () => {
  assert.equal(supportedProductForMint(NVDAX_MINT)?.kind, "xstock");
  assert.equal(supportedProductForMint(USDC_MINT), undefined, "USDC is a route asset, not a product");
  assert.equal(supportedProductForMint(NVDAX_MINT.toLowerCase()), undefined);
  assert.equal(supportedProductForMint(` ${NVDAX_MINT}`), undefined);
  assert.equal(supportedProductForMint("NVDAx"), undefined, "a symbol never resolves a product");
  assert.equal(supportedProductForMint(undefined), undefined);
});

test("products are frozen and the token program constants match the SDK keys", () => {
  assert.ok(Object.isFrozen(SUPPORTED_PRODUCTS.get(NVDAX_MINT)));
  assert.equal(TOKEN_PROGRAM_ID.toBase58(), TOKEN_PROGRAM_ADDRESS);
  assert.equal(TOKEN_2022_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ADDRESS);
  assert.deepEqual([...TOKEN_PROGRAM_ADDRESSES].sort(), [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS].sort());
});

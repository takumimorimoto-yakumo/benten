import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import artifactJson from "./provider-assets-v1.json" with { type: "json" };
import manifestJson from "./provider-assets-manifest.json" with { type: "json" };
import {
  canonicalJson,
  decodeBase58,
  sha256Hex,
  validateProviderAssets,
  validateProviderAssetsManifest,
} from "./provider-assets-validation.js";
import {
  findProviderAsset,
  listProviderAssets,
  providerAssets,
  providerAssetsManifest,
} from "./provider-read-model.js";

const sourceRoot = import.meta.dirname;

/** Rebuild the revision so a mutated copy stays otherwise valid. */
function resign(artifact: any): any {
  const { revision: _dropped, ...rest } = artifact;
  return { ...artifact, revision: sha256Hex(canonicalJson(rest)) };
}

function copy(): any {
  return JSON.parse(JSON.stringify(artifactJson));
}

describe("provider assets artifact", () => {
  it("loads the eight PreStocks entries, and only those, with a reproducible revision", () => {
    expect(providerAssets.schema_version).toBe("provider-assets.v1");
    expect(providerAssets.entries).toHaveLength(8);
    expect(providerAssets.entries.every((entry) => entry.provider === "prestocks")).toBe(true);
    expect(providerAssets.sources.map((source) => source.provider)).toEqual(["prestocks"]);
    expect(providerAssetsManifest.counts).toEqual({ prestocks: 8 });
    const { revision, ...rest } = artifactJson as any;
    expect(sha256Hex(canonicalJson(rest))).toBe(revision);
  });

  it("binds the manifest digest to the artifact bytes on disk", () => {
    const bytes = readFileSync(join(sourceRoot, "provider-assets-v1.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifestJson.sha256);
    expect(manifestJson.revision).toBe(providerAssets.revision);
  });

  it("keeps every entry a provider claim and never a quote", () => {
    for (const entry of providerAssets.entries) {
      expect(entry.evidence_state).toBe("candidate_unverified");
      expect(entry.not_quote).toBe(true);
      expect(entry.not_authorization).toBe(true);
      expect(entry.company_binding.binding_status).toBe("provider_claim_only");
      expect(entry.unknowns.map((unknown) => unknown.code)).toEqual(
        expect.arrayContaining([
          "source_as_of_unknown", "chain_identity_unknown", "redistribution_pending", "rights_unknown",
        ]),
      );
      expect(entry.unknowns.find((unknown) => unknown.code === "rights_unknown")!.blocks)
        .toEqual(["comparison", "release"]);
      for (const reference of entry.references) {
        expect(reference.currency).toBeNull();
        expect(reference.provider_reported_as_of).toBeNull();
      }
      expect(decodeBase58(entry.mint_or_contract)).toHaveLength(32);
    }
  });

  it("records restrictions as unreviewed for every PreStocks entry", () => {
    for (const entry of providerAssets.entries) {
      // Restrictions record what Benten has not reviewed, never what the
      // instrument grants or withholds: Benten has not read the provider's
      // terms document.
      expect(entry.rights.restrictions).toEqual(["provider_terms_not_reviewed", "no_public_source_verification"]);
    }
  });

  it("keeps PreStocks references apart from its rights claim", () => {
    const prestock = findProviderAsset("prestocks", "OPENAI")!;
    expect(prestock.references.map((reference) => reference.kind)).toEqual([
      "prestock_mark_reference", "prestock_token_reference", "prestock_implied_valuation_reference",
    ]);
    expect(prestock.rights).toMatchObject({
      status: "provider_claim_only",
      instrument_kind: "economic_exposure_instrument",
      equity_ownership: "unknown",
      voting_rights: "unknown",
      redemption_kind: "unknown",
    });
    expect(prestock.unknowns.map((unknown) => unknown.code)).toContain("currency_unknown");
    expect(prestock.rights.provider_statement.length).toBeGreaterThan(0);
    expect(prestock).not.toHaveProperty("underlying_kind");
  });

  it("resolves every evidence digest to a recorded source", () => {
    const digests = new Set(providerAssets.sources.map((source) => source.response_digest));
    for (const entry of providerAssets.entries) {
      expect(digests.has(entry.source_digest)).toBe(true);
      for (const digest of [...entry.company_binding.evidence_refs, ...entry.rights.evidence_refs]) {
        expect(digests.has(digest)).toBe(true);
      }
    }
  });
});

describe("provider assets validation", () => {
  it.each([
    ["unknown artifact key", (artifact: any) => { artifact.extra = true; }],
    ["unknown entry key", (artifact: any) => { artifact.entries[0].price = "1"; }],
    ["duplicate provider asset id", (artifact: any) => {
      artifact.entries[1].provider_asset_id = artifact.entries[0].provider_asset_id;
    }],
    ["duplicate mint", (artifact: any) => {
      artifact.entries[1].mint_or_contract = artifact.entries[0].mint_or_contract;
    }],
    ["non-base58 address", (artifact: any) => {
      artifact.entries[0].mint_or_contract = "0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl";
    }],
    ["short address", (artifact: any) => { artifact.entries[0].mint_or_contract = "11111111111111111111111111111"; }],
    ["exponent decimal", (artifact: any) => { artifact.entries[0].references[0].value = "1e3"; }],
    ["negative decimal", (artifact: any) => { artifact.entries[0].references[0].value = "-1.5"; }],
    ["trailing zero decimal", (artifact: any) => { artifact.entries[0].references[0].value = "1.50"; }],
    ["coerced numeric value", (artifact: any) => { artifact.entries[0].references[0].value = 1.5; }],
    ["reference kind outside the PreStocks set", (artifact: any) => {
      artifact.entries[0].references[0].kind = "auction_price_reference";
    }],
    ["provider outside the allowlist", (artifact: any) => { artifact.entries[0].provider = "other"; }],
    ["source provider outside the allowlist", (artifact: any) => { artifact.sources[0].provider = "other"; }],
    ["underlying discriminator", (artifact: any) => { artifact.entries[0].underlying_kind = "openai"; }],
    ["removed instrument kind", (artifact: any) => { artifact.entries[0].rights.instrument_kind = "loan_participation_token"; }],
    ["unsorted entries", (artifact: any) => { artifact.entries.reverse(); }],
    ["dangling evidence digest", (artifact: any) => {
      artifact.entries[0].rights.evidence_refs = ["f".repeat(64)];
    }],
    ["unreviewed non-equity rights", (artifact: any) => {
      artifact.entries[0].rights.equity_ownership = false;
    }],
    ["restriction code outside the unreviewed allowlist", (artifact: any) => {
      artifact.entries[0].rights.restrictions = [...artifact.entries[0].rights.restrictions, "no_voting_rights"];
    }],
    ["coerced currency", (artifact: any) => { artifact.entries[0].references[0].currency = 840; }],
    ["overlong currency", (artifact: any) => { artifact.entries[0].references[0].currency = "U".repeat(17); }],
    ["fetch time as provider as-of", (artifact: any) => {
      artifact.entries[0].references[0].provider_reported_as_of = "not-a-time";
    }],
    ["promoted evidence state", (artifact: any) => { artifact.entries[0].evidence_state = "verified_reference"; }],
    ["provider asset id with a path separator", (artifact: any) => {
      artifact.entries[0].provider_asset_id = "prestocks/OPENAI";
    }],
    ["provider asset id with a space", (artifact: any) => { artifact.entries[0].provider_asset_id = "OPEN AI"; }],
    ["empty provider asset id", (artifact: any) => { artifact.entries[0].provider_asset_id = ""; }],
    ["off-allowlist external host", (artifact: any) => {
      artifact.entries[0].external_url = "https://prestocks.com.example.net/openai";
    }],
    ["off-allowlist terms host", (artifact: any) => {
      artifact.entries[0].rights.terms_url = "https://prestocks.com.evil.test/terms";
    }],
    ["empty entries", (artifact: any) => { artifact.entries = []; }],
  ])("rejects %s", (_name, mutate) => {
    const artifact = copy();
    mutate(artifact);
    expect(() => validateProviderAssets(resign(artifact))).toThrow(TypeError);
  });

  it("rejects a revision that does not reproduce from the artifact bytes", () => {
    const artifact = copy();
    artifact.entries[0].display_name = "Tampered PreStocks";
    expect(() => validateProviderAssets(artifact)).toThrow(/revision does not reproduce/);
    artifact.revision = "0".repeat(64);
    expect(() => validateProviderAssets(artifact)).toThrow(/revision does not reproduce/);
  });

  it("rejects a manifest that drifts from the artifact", () => {
    const manifest = JSON.parse(JSON.stringify(manifestJson));
    manifest.counts.prestocks = 9;
    expect(() => validateProviderAssetsManifest(manifest, providerAssets)).toThrow(TypeError);
    const extra = JSON.parse(JSON.stringify(manifestJson));
    extra.counts.other = 0;
    expect(() => validateProviderAssetsManifest(extra, providerAssets)).toThrow(TypeError);
    const revisioned = JSON.parse(JSON.stringify(manifestJson));
    revisioned.revision = "0".repeat(64);
    expect(() => validateProviderAssetsManifest(revisioned, providerAssets)).toThrow(TypeError);
  });

  it("fails module load when the bundled artifact is tampered with", async () => {
    const { execFileSync } = await import("node:child_process");
    const script = [
      "const fs = require('node:fs');",
      `const path = ${JSON.stringify(join(sourceRoot, "provider-assets-v1.json"))};`,
      "const original = fs.readFileSync(path);",
      "const artifact = JSON.parse(original.toString('utf8'));",
      "artifact.entries[0].symbol = 'TAMPERED';",
      "fs.writeFileSync(path, JSON.stringify(artifact, null, 2) + '\\n');",
      `import(${JSON.stringify(join(sourceRoot, "provider-assets-validation.js"))})`,
      "  .then((module) => { module.validateProviderAssets(JSON.parse(fs.readFileSync(path, 'utf8')));",
      "    fs.writeFileSync(path, original); process.exit(9); })",
      "  .catch(() => { fs.writeFileSync(path, original); process.exit(0); });",
    ].join("\n");
    expect(() => execFileSync(process.execPath, ["-e", script], { encoding: "utf8" })).not.toThrow();
    expect(readFileSync(join(sourceRoot, "provider-assets-v1.json"), "utf8")).toContain(providerAssets.revision);
  });
});

describe("provider assets read model", () => {
  it("lists every entry and filters by provider", () => {
    const all = listProviderAssets();
    expect(all).toMatchObject({ found: true });
    expect(all.found && all.items).toHaveLength(8);
    const prestocks = listProviderAssets({ provider: "prestocks" });
    expect(prestocks.found && prestocks.items.map((entry) => entry.provider_asset_id)).toEqual([
      "ANDURIL", "ANTHROPIC", "FIGUREAI", "KALSHI", "NEURALINK", "OPENAI", "POLYMARKET", "SPACEX",
    ]);
  });

  it("selects one entry by id or mint", () => {
    const byId = listProviderAssets({ provider_asset_id: "ANTHROPIC" });
    expect(byId.found && byId.items).toHaveLength(1);
    const mint = byId.found ? byId.items[0].mint_or_contract : "";
    const byMint = listProviderAssets({ mint_or_contract: mint });
    expect(byMint).toEqual(byId);
    expect(findProviderAsset("prestocks", "ANTHROPIC")?.company_binding.company_id).toBe("anthropic");
    expect(findProviderAsset("other", "ANTHROPIC")).toBeUndefined();
    expect(findProviderAsset(null, "ANTHROPIC")).toBeUndefined();
  });

  it("separates an unknown asset from malformed input", () => {
    expect(listProviderAssets({ provider_asset_id: "NOPE" }))
      .toEqual({ found: false, reason: "asset_not_found", requested_identifier: "NOPE", retryable: false });
    expect(listProviderAssets({ mint_or_contract: "11111111111111111111111111111111" }))
      .toMatchObject({ found: false, reason: "asset_not_found" });
  });

  it.each([
    { provider: "xstocks" },
    { provider: "other" },
    { provider: "prestocks", debug: true },
    { provider_asset_id: 12 },
    { provider_asset_id: "" },
    { provider_asset_id: "OPENAI", mint_or_contract: "11111111111111111111111111111111" },
    [],
    null,
    "prestocks",
  ])("rejects malformed provider selector %#", (input) => {
    expect(listProviderAssets(input as unknown)).toEqual({
      found: false, reason: "invalid_input", requested_identifier: null, retryable: false,
    });
  });

  it("returns a frozen artifact that a caller cannot mutate", () => {
    expect(Object.isFrozen(providerAssets)).toBe(true);
    expect(Object.isFrozen(providerAssets.entries[0])).toBe(true);
    expect(() => {
      (providerAssets.entries[0] as { symbol: string }).symbol = "MUTATED";
    }).toThrow(TypeError);
  });
});

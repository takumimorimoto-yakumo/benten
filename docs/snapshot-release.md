# Snapshot release procedure

Benten financial runtimes are network-free. An external producer may prepare
a sanitized candidate, but this repository accepts only the nine public files
defined by the v2 contract (revision 2.2):

```text
xstocks.json
financials-snapshot.json
verified-facts-v2.json
verified-facts-annual-v1.json
verified-statements-annual-v1-pl.json
verified-statements-annual-v1-bs.json
verified-statements-annual-v1-cf.json
verified-statements-annual-v1-per_share.json
snapshot-manifest.json
```

`verified-facts-annual-v1.json` is the FY2016-onward annual history
(contract C-FIN-03). Its producer runs outside this repository; the committed
artifact carries every value's status and cited SEC filing, and startup fails
if it disagrees with the newest-year `verified-facts-v2.json`.
The four `verified-statements-annual-v1-*.json` files carry the other statement
line items of the same years (C-FIN-03 revision 2.2). They come from the same
external producer; startup and the checker reject any statement year that is
not a published annual year or any filing record that differs from the annual
artifact's.

Run the candidate checker before replacing any repository file:

```bash
node scripts/check-snapshot-release.mjs \
  --current-root packages/registry/src \
  --candidate-root /path/to/sanitized-candidate
```

The checker is read-only. It validates strict schemas, raw-file SHA-256 values,
record counts, identifiers, source and period references, and coverage changes.
Runtime startup and this checker call the same legacy snapshot validator.
`snapshot_available` counts the union of legacy and verified fundamentals, so a
verified-only record remains available. Reusing an artifact revision after any
of the hashed files changes is rejected. A current root published before the
statement files (revision 2.1) is accepted only as a comparison baseline.
Success exits zero and prints one JSON result. Failure exits nonzero, prints
public error codes and paths, and leaves both roots unchanged.

After checker success, review the source comparison ledger, replace the four
files in one dedicated artifact change, and run:

```bash
pnpm --filter @benten/registry test
pnpm --filter @benten/registry typecheck
pnpm --filter @benten/mcp test
pnpm build
bash scripts/check-publishable.sh
```

The release commit records the exact artifact revision and contains no private
producer data, credentials, local filesystem paths, or unrelated features.
Change `artifact_revision` whenever `xstocks.json`, `financials-snapshot.json`,
`verified-facts-v2.json`, `verified-facts-annual-v1.json`, or a statement file
changes; unchanged
bytes may retain the revision.
Rollback uses `git revert` of that artifact commit followed by the same gates.
Deployment and publication are separate operations.

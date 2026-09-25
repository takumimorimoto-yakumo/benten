/**
 * Bundle `src/server-quote.ts` for a Node host (the local stack; the hosted
 * function bundles the source itself). Dependencies are bundled too: the pool
 * SDK's ESM build uses directory imports that Node's ESM resolver refuses.
 */
import { build } from "esbuild";

await build({
  entryPoints: [new URL("../src/server-quote.ts", import.meta.url).pathname],
  outfile: new URL("../dist/server-quote.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // CommonJS dependencies inside an ESM bundle need a real `require`, and `__filename`/`__dirname`
  // (the native-binding loader of a Solana dependency reads `__filename` inside a stack-trace hook).
  banner: { js: "import { createRequire as __bentenCreateRequire } from 'node:module'; import { fileURLToPath as __bentenFileURLToPath } from 'node:url'; import { dirname as __bentenDirname } from 'node:path'; const require = __bentenCreateRequire(import.meta.url); const __filename = __bentenFileURLToPath(import.meta.url); const __dirname = __bentenDirname(__filename);" },
  logLevel: "warning",
  legalComments: "none",
});

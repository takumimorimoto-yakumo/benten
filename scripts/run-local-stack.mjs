import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const [{ startPublicApi }, { startCapsuleHost }, { createServerQuoteReader }] = await Promise.all([
  import(pathToFileURL(resolve(repositoryRoot, "apps/public-api/dist/node.js"))),
  import(pathToFileURL(resolve(repositoryRoot, "apps/public-web/build-host/host/server.js"))),
  // The read-only quote reader of the fixed purchase route, for the MCP prepare_purchase tool.
  import(pathToFileURL(resolve(repositoryRoot, "packages/purchase/dist/server-quote.js"))),
]);

/**
 * Loopback ports default to 0 (OS-assigned). An operator may bind fixed ports
 * for one run through these process environment variables; no request,
 * browser field or forwarded header can change them. The API origin the Web
 * proxies to is always the one this process just bound.
 */
function portFromEnvironment(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return 0;
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) throw new Error(`${name} must be an integer from 0 to 65535`);
  return Number(raw);
}

const apiPort = portFromEnvironment("BENTEN_LOCAL_STACK_API_PORT");
const webPort = portFromEnvironment("BENTEN_LOCAL_STACK_WEB_PORT");

const api = await startPublicApi({ host: "127.0.0.1", port: apiPort, purchaseQuote: createServerQuoteReader({ env: process.env }) });
let web;
try {
  web = await startCapsuleHost({
    clientDirectory: resolve(repositoryRoot, "apps/public-web/.generated/local-web/output/client"),
    factsOrigin: api.origin,
    host: "127.0.0.1",
    port: webPort,
  });
} catch (error) {
  await api.close();
  throw error;
}

process.stdout.write(`${JSON.stringify({
  service: "benten-local-stack",
  apiOrigin: api.origin,
  webOrigin: web.capsuleAddress,
})}\n`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise((resolveClose, reject) => web.close((error) => error ? reject(error) : resolveClose()));
  await api.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void close().then(() => { process.exitCode = 0; }, (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  });
}

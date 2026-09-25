import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { installFiles } from "./app/features/pwa/install-files.server.js";
import { DATA_FILE_CACHE_CONTROL, DATA_FILE_CONTENT_TYPE } from "./app/lib/data-files.js";
import { publishedPriceFiles } from "./app/lib/price-files.server.js";
import { publishedStatementsFiles } from "./app/lib/statements.server.js";

/**
 * Manifests and app icons (app IA section 3.4) as plain client files: emitted
 * into the client build, and served with the same bytes by the dev server.
 */
function installFilesPlugin(): Plugin {
  return {
    name: "benten-install-files",
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const file of installFiles()) this.emitFile({ type: "asset", fileName: file.path.slice(1), source: file.body });
    },
    configureServer(server) {
      const files = new Map(installFiles().map((file) => [file.path, file]));
      server.middlewares.use((request, response, next) => {
        const file = files.get(request.url?.split("?")[0] ?? "");
        if (!file) return next();
        response.setHeader("content-type", file.contentType);
        response.end(file.body);
      });
    },
  };
}

/**
 * The published data files (`app/lib/data-files.ts`): one statements file
 * per published xStock with statements (app IA section 4.9) and one daily
 * on-chain price file per bundled series (app IA section 4.8). Emitted into
 * the client build, and served with the same bytes and headers by the dev
 * server. The company, product and evidence documents name them and read
 * them after hydration.
 */
function publishedDataFiles() {
  return [...publishedStatementsFiles(), ...publishedPriceFiles()];
}

function dataFilesPlugin(): Plugin {
  return {
    name: "benten-data-files",
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const file of publishedDataFiles()) this.emitFile({ type: "asset", fileName: file.path.slice(1), source: file.body });
    },
    configureServer(server) {
      let files: Map<string, string> | null = null;
      server.middlewares.use((request, response, next) => {
        files ??= new Map(publishedDataFiles().map((file) => [file.path, file.body]));
        const body = files.get(request.url?.split("?")[0] ?? "");
        if (body === undefined) return next();
        response.setHeader("content-type", DATA_FILE_CONTENT_TYPE);
        response.setHeader("cache-control", DATA_FILE_CACHE_CONTROL);
        response.end(body);
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), installFilesPlugin(), dataFilesPlugin()],
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json that components.json aliases use.
    alias: { "@": fileURLToPath(new URL("./app", import.meta.url)) },
  },
});

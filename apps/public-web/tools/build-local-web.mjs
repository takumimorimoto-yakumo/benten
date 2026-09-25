import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { markGuardedBuild, prepareGuardedOutput, recordFailedBuild } from "./local-output-ownership.mjs";

const appDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const guarded = await prepareGuardedOutput(appDirectory);

try {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["exec", "react-router", "build"], {
      cwd: appDirectory,
      env: {
        ...process.env,
        BENTEN_PUBLIC_WEB_BUILD_DIRECTORY: relative(appDirectory, guarded.outputDirectory),
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`react-router build failed with ${signal ?? `exit code ${code}`}`));
    });
  });
  await access(`${guarded.outputDirectory}/client/index.html`);
  const completed = await markGuardedBuild(appDirectory, "complete");
  console.info(`guarded local Web build complete: ${completed.outputDirectory} (${completed.artifact.digest})`);
} catch (error) {
  await recordFailedBuild(appDirectory);
  throw error;
}

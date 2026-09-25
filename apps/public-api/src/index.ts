import { startPublicApi } from "./node.js";

const port = process.env.BENTEN_PUBLIC_API_PORT === undefined
  ? 0
  : Number.parseInt(process.env.BENTEN_PUBLIC_API_PORT, 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("BENTEN_PUBLIC_API_PORT must be an integer from 0 to 65535");

const server = await startPublicApi({ port });
process.stdout.write(`${JSON.stringify({ service: "benten-public-api", origin: server.origin })}\n`);

const shutdown = async () => {
  await server.close();
  process.exitCode = 0;
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

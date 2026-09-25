/**
 * Node's `Buffer` global, which the Solana and DEX SDKs expect in the browser.
 * Installed only inside the purchase island chunk: this module is imported
 * first by the island entry, so no other page code ever carries or sees it.
 */
import { Buffer } from "buffer";

const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (scope.Buffer === undefined) scope.Buffer = Buffer;

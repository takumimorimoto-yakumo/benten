/**
 * Entry of the purchase island chunk. Only `features/dossier/purchase-slot.tsx`
 * imports it, dynamically and after hydration, and only for the fixed-route
 * token. The static-artifact test keeps this chunk and its dependencies out
 * of every document's static graph.
 */
// Must stay the first import: the SDK modules below read the Buffer global.
import "./buffer-polyfill";

export { createInstalledPurchase } from "./purchase-island";

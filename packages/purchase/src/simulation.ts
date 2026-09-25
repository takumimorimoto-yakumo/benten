/**
 * Classification of a failed unsigned simulation into the panel's error
 * cases (design contract section 6). Pure; kept apart from the SDK-backed
 * preview builder so it is unit tested without loading the SDK.
 */

/** Transaction-level errors that mean the wallet lacks SOL for the fee or a new account's deposit. */
const SOL_SHORTFALL_ERRORS: ReadonlySet<string> = new Set(["InsufficientFundsForFee", "InsufficientFundsForRent", "AccountNotFound"]);
const SOL_SHORTFALL_LOG = /insufficient lamports/i;

/** Map a failed unsigned simulation to the panel's error case. */
export function classifySimulationError(err: unknown, logs: readonly string[] | null | undefined): "notEnoughSol" | "simulationFailed" {
  if (typeof err === "string" && SOL_SHORTFALL_ERRORS.has(err)) return "notEnoughSol";
  if (err && typeof err === "object" && "InsufficientFundsForRent" in err) return "notEnoughSol";
  return (logs ?? []).some((line) => SOL_SHORTFALL_LOG.test(line)) ? "notEnoughSol" : "simulationFailed";
}

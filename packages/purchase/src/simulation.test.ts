import { describe, expect, it } from "vitest";

import { classifySimulationError } from "./simulation";

describe("classifySimulationError", () => {
  it.each([
    ["InsufficientFundsForFee", null],
    ["AccountNotFound", null],
    [{ InsufficientFundsForRent: { account_index: 1 } }, null],
    [{ InstructionError: [1, { Custom: 1 }] }, ["Program 11111111111111111111111111111111 failed: Transfer: insufficient lamports 100, need 2039280"]],
  ])("maps %j to notEnoughSol", (err, logs) => {
    expect(classifySimulationError(err, logs)).toBe("notEnoughSol");
  });

  it("maps any other simulation error to simulationFailed", () => {
    expect(classifySimulationError({ InstructionError: [2, { Custom: 6004 }] }, ["Program log: exceeded slippage"])).toBe("simulationFailed");
    expect(classifySimulationError("BlockhashNotFound", undefined)).toBe("simulationFailed");
  });
});

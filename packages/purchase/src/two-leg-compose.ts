/**
 * SDK-free composition of the two SDK-built legs of a two-leg purchase into
 * one instruction list (kept apart from `build-two-leg.ts` so it can be tested
 * without loading the DEX SDK). Nothing here signs or sends.
 */

import { ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import { COMPUTE_BUDGET_PROGRAM_ID } from "./route";

const TOKEN_CLOSE_ACCOUNT = 9;

function isComputeBudget(instruction: TransactionInstruction): boolean {
  return instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID);
}

function isTokenClose(instruction: TransactionInstruction): boolean {
  return instruction.programId.equals(TOKEN_PROGRAM_ID) && instruction.data.length === 1 && instruction.data[0] === TOKEN_CLOSE_ACCOUNT;
}

/** The associated token account an idempotent creation instruction creates, or `null`. */
function createdAccountOf(instruction: TransactionInstruction): string | null {
  return instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) ? (instruction.keys[1]?.pubkey.toBase58() ?? null) : null;
}

/**
 * Compose the two SDK-built legs into one transaction: one compute-unit limit,
 * the first leg's setup and swap, the second leg's setup (minus any token
 * account the first leg already creates) and swap, then the wrapped-SOL close.
 */
export function composeTwoLegInstructions(legInstructions: readonly TransactionInstruction[], nvdaxInstructions: readonly TransactionInstruction[], computeUnitLimit: number): TransactionInstruction[] {
  const first = legInstructions.filter((instruction) => !isComputeBudget(instruction));
  const created = new Set(first.map(createdAccountOf).filter((address): address is string => address !== null));
  const second = nvdaxInstructions.filter((instruction) => {
    if (isComputeBudget(instruction)) return false;
    const account = createdAccountOf(instruction);
    return account === null || !created.has(account);
  });
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    ...first.filter((instruction) => !isTokenClose(instruction)),
    ...second,
    ...first.filter(isTokenClose),
  ];
}


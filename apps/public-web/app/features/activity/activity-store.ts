/**
 * Device-local purchase history (app IA sections 5.4 and 8.5).
 *
 * What is kept, per Solana cluster (genesis hash) and wallet account: the
 * attempt id, times, the route and both mints, the raw amount entered, the
 * signature once the wallet returned one, the status, and the amounts
 * measured from the finalized transaction. Never signed bytes, never
 * transaction bytes, never a key. Nothing here is sent anywhere: the history
 * lives in this browser's `localStorage` only, and every storage failure
 * (private mode, quota, disabled storage) makes the history "unavailable"
 * instead of breaking the page.
 *
 * One way in: `recordPurchaseAttempt` creates or updates one attempt, and
 * the purchase flow and "Check again" both write through it. Its rules keep a
 * record from going backwards: identity fields never change once written, a
 * signature once known never changes, a final status (finalized, failed,
 * dropped) is never replaced by another, and measured amounts are accepted
 * only with the finalized status.
 *
 * One way out: `withdrawOpenedAttempt` removes an attempt the wallet
 * rejected with a structured rejection, which means nothing was sent. It
 * removes a record only while it is `opened` with no signature, so nothing
 * that may have reached the network is ever removed by it.
 */
import { ACTIVITY_CONFIG } from "./activity-config";

export const ACTIVITY_PHASES = ["opened", "outcome_unknown", "sent", "confirmed", "not_finalized", "finalized", "failed", "dropped"] as const;
export type ActivityPhase = (typeof ACTIVITY_PHASES)[number];

/** Order of progress; a record never moves to a lower rank. The last rank is final. */
const PHASE_RANK: Record<ActivityPhase, number> = {
  opened: 0,
  outcome_unknown: 1,
  sent: 2,
  confirmed: 3,
  not_finalized: 3,
  finalized: 4,
  failed: 4,
  dropped: 4,
};
const FINAL_RANK = 4;

export function isFinalPhase(phase: ActivityPhase): boolean {
  return PHASE_RANK[phase] === FINAL_RANK;
}

export type ActivityRecord = {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly walletAddress: string;
  readonly genesisHash: string;
  /** The fixed pool the route swaps through. */
  readonly routeId: string;
  readonly inputMint: string;
  readonly outputMint: string;
  /** Raw amount the user entered (input token), not a result. */
  readonly inputRaw: string;
  /** From the swap preview; never shown as a result. */
  readonly expectedOutputRaw: string | null;
  readonly minimumOutputRaw: string | null;
  readonly previewExpiresAt: number | null;
  readonly phase: ActivityPhase;
  readonly signature: string | null;
  readonly finalizedAt: number | null;
  /** Measured from the finalized transaction's token balances only. */
  readonly receivedRaw: string | null;
  /** The received amount in display units, as the purchase flow measured it (optional). */
  readonly receivedDisplay: string | null;
  readonly paidRaw: string | null;
  readonly lastCheckedAt: number | null;
};

/** What a writer passes. Optional fields left out keep their stored value. */
export type PurchaseAttemptInput = {
  readonly attemptId: string;
  readonly walletAddress: string;
  readonly genesisHash: string;
  readonly routeId: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inputRaw: string;
  readonly phase: ActivityPhase;
  readonly expectedOutputRaw?: string | null;
  readonly minimumOutputRaw?: string | null;
  readonly previewExpiresAt?: number | null;
  readonly signature?: string | null;
  readonly finalizedAt?: number | null;
  readonly receivedRaw?: string | null;
  readonly receivedDisplay?: string | null;
  readonly paidRaw?: string | null;
  readonly checkedAt?: number | null;
};

export type RecordOutcome =
  | { readonly ok: true; readonly record: ActivityRecord }
  | { readonly ok: false; readonly reason: "invalid" | "conflict" | "storage_unavailable" };

export type ActivityList =
  | { readonly status: "available"; readonly records: readonly ActivityRecord[]; readonly skipped: number }
  | { readonly status: "unavailable" };

export type ActivityStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Partition = { genesisHash: string; walletAddress: string; records: ActivityRecord[] };
type StoredHistory = { schema: string; partitions: Partition[] };

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const RAW = /^(?:0|[1-9]\d{0,19})$/;
const DISPLAY = /^\d{1,30}(?:\.\d{1,30})?$/;
const U64_MAX = (1n << 64n) - 1n;
const ADDRESS_BYTES = 32;
const SIGNATURE_BYTES = 64;

/** Decoded byte length of a canonical base58 text, or `null` when it is not canonical. */
function base58Bytes(text: unknown, maxLength: number): number | null {
  if (typeof text !== "string" || text.length === 0 || text.length > maxLength) return null;
  let value = 0n;
  for (const character of text) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  let bytes = 0;
  for (let rest = value; rest > 0n; rest >>= 8n) bytes += 1;
  let leading = 0;
  while (text[leading] === "1") leading += 1;
  // Canonical: re-encoding the value gives the same text (no extra leading ones, no other spelling).
  let encoded = "";
  for (let rest = value; rest > 0n; rest /= 58n) encoded = BASE58[Number(rest % 58n)] + encoded;
  return "1".repeat(leading) + encoded === text ? leading + bytes : null;
}

export function isAddressText(value: unknown): value is string {
  return base58Bytes(value, 44) === ADDRESS_BYTES;
}

export function isSignatureText(value: unknown): value is string {
  return base58Bytes(value, 88) === SIGNATURE_BYTES;
}

function isRaw(value: unknown): value is string {
  return typeof value === "string" && RAW.test(value) && BigInt(value) <= U64_MAX;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nullable<T>(value: unknown, check: (value: unknown) => value is T): value is T | null {
  return value === null || check(value);
}

function isPhase(value: unknown): value is ActivityPhase {
  return typeof value === "string" && (ACTIVITY_PHASES as readonly string[]).includes(value);
}

function isDisplay(value: unknown): value is string {
  return typeof value === "string" && DISPLAY.test(value);
}

const RECORD_KEYS = [
  "id", "createdAt", "updatedAt", "walletAddress", "genesisHash", "routeId", "inputMint", "outputMint", "inputRaw",
  "expectedOutputRaw", "minimumOutputRaw", "previewExpiresAt", "phase", "signature", "finalizedAt", "receivedRaw",
  "receivedDisplay", "paidRaw", "lastCheckedAt",
].sort();

/** Strict record check: exact keys, exact types, and the cross-field rules a writer enforces. */
export function isActivityRecord(value: unknown): value is ActivityRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || keys.some((key, index) => key !== RECORD_KEYS[index])) return false;
  if (typeof record.id !== "string" || !ATTEMPT_ID.test(record.id) || !isTime(record.createdAt) || !isTime(record.updatedAt)) return false;
  for (const key of ["walletAddress", "genesisHash", "routeId", "inputMint", "outputMint"] as const) if (!isAddressText(record[key])) return false;
  if (!isRaw(record.inputRaw) || !nullable(record.expectedOutputRaw, isRaw) || !nullable(record.minimumOutputRaw, isRaw)) return false;
  if (!nullable(record.previewExpiresAt, isTime) || !isPhase(record.phase) || !nullable(record.signature, isSignatureText)) return false;
  if (!nullable(record.finalizedAt, isTime) || !nullable(record.receivedRaw, isRaw) || !nullable(record.paidRaw, isRaw)) return false;
  if (!nullable(record.receivedDisplay, isDisplay) || !nullable(record.lastCheckedAt, isTime)) return false;
  // Measured amounts exist only for a finalized purchase, and anything past "sent" has a signature.
  if (record.phase !== "finalized" && (record.receivedRaw !== null || record.paidRaw !== null || record.receivedDisplay !== null || record.finalizedAt !== null)) return false;
  if (PHASE_RANK[record.phase] >= PHASE_RANK.sent && record.signature === null) return false;
  return true;
}

function emptyHistory(): StoredHistory {
  return { schema: ACTIVITY_CONFIG.schema, partitions: [] };
}

function parseHistory(text: string | null): { history: StoredHistory; skipped: number } {
  if (!text) return { history: emptyHistory(), skipped: 0 };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { history: emptyHistory(), skipped: 1 };
  }
  const root = value as { schema?: unknown; partitions?: unknown } | null;
  if (!root || typeof root !== "object" || root.schema !== ACTIVITY_CONFIG.schema || !Array.isArray(root.partitions)) {
    return { history: emptyHistory(), skipped: 1 };
  }
  let skipped = 0;
  const partitions: Partition[] = [];
  for (const entry of root.partitions) {
    const partition = entry as { genesisHash?: unknown; walletAddress?: unknown; records?: unknown } | null;
    if (!partition || !isAddressText(partition.genesisHash) || !isAddressText(partition.walletAddress) || !Array.isArray(partition.records)) {
      skipped += 1;
      continue;
    }
    const records: ActivityRecord[] = [];
    for (const record of partition.records) {
      // A record must also belong to the partition it is stored under.
      if (isActivityRecord(record) && record.genesisHash === partition.genesisHash && record.walletAddress === partition.walletAddress) records.push(record);
      else skipped += 1;
    }
    partitions.push({ genesisHash: partition.genesisHash, walletAddress: partition.walletAddress, records });
  }
  return { history: { schema: ACTIVITY_CONFIG.schema, partitions }, skipped };
}

function newestFirst(left: ActivityRecord, right: ActivityRecord): number {
  return right.createdAt - left.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** Keep the newest `maxRecords` across all partitions; drop emptied partitions. */
function capped(history: StoredHistory): StoredHistory {
  const all = history.partitions.flatMap((partition) => partition.records).sort(newestFirst);
  const keep = new Set(all.slice(0, ACTIVITY_CONFIG.maxRecords).map((record) => record.id));
  const partitions = history.partitions
    .map((partition) => ({ ...partition, records: partition.records.filter((record) => keep.has(record.id)).sort(newestFirst) }))
    .filter((partition) => partition.records.length > 0);
  return { schema: history.schema, partitions };
}

function validInput(input: PurchaseAttemptInput): boolean {
  if (typeof input.attemptId !== "string" || !ATTEMPT_ID.test(input.attemptId) || !isPhase(input.phase)) return false;
  for (const key of ["walletAddress", "genesisHash", "routeId", "inputMint", "outputMint"] as const) if (!isAddressText(input[key])) return false;
  if (!isRaw(input.inputRaw)) return false;
  const optional: Array<[unknown, (value: unknown) => boolean]> = [
    [input.expectedOutputRaw, isRaw], [input.minimumOutputRaw, isRaw], [input.previewExpiresAt, isTime], [input.signature, isSignatureText],
    [input.finalizedAt, isTime], [input.receivedRaw, isRaw], [input.receivedDisplay, isDisplay], [input.paidRaw, isRaw], [input.checkedAt, isTime],
  ];
  return optional.every(([value, check]) => value === undefined || value === null || check(value));
}

function pick<T>(next: T | undefined, current: T): T {
  return next === undefined ? current : next;
}

/** Merge a write into the stored record, or say why it is refused. Pure. */
export function mergeAttempt(current: ActivityRecord | null, input: PurchaseAttemptInput, now: number): ActivityRecord | "invalid" | "conflict" {
  if (!validInput(input)) return "invalid";
  if (current) {
    for (const key of ["walletAddress", "genesisHash", "routeId", "inputMint", "outputMint", "inputRaw"] as const) {
      if (current[key] !== input[key]) return "conflict";
    }
    if (current.signature !== null && input.signature !== undefined && input.signature !== current.signature) return "conflict";
    const from = PHASE_RANK[current.phase];
    const to = PHASE_RANK[input.phase];
    if (to < from) return "conflict";
    if (from === FINAL_RANK && input.phase !== current.phase) return "conflict";
  }
  const base: ActivityRecord = current ?? {
    id: input.attemptId,
    createdAt: now,
    updatedAt: now,
    walletAddress: input.walletAddress,
    genesisHash: input.genesisHash,
    routeId: input.routeId,
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    inputRaw: input.inputRaw,
    expectedOutputRaw: null,
    minimumOutputRaw: null,
    previewExpiresAt: null,
    phase: input.phase,
    signature: null,
    finalizedAt: null,
    receivedRaw: null,
    receivedDisplay: null,
    paidRaw: null,
    lastCheckedAt: null,
  };
  const finalized = input.phase === "finalized";
  const merged: ActivityRecord = {
    ...base,
    updatedAt: now,
    phase: input.phase,
    expectedOutputRaw: pick(input.expectedOutputRaw, base.expectedOutputRaw),
    minimumOutputRaw: pick(input.minimumOutputRaw, base.minimumOutputRaw),
    previewExpiresAt: pick(input.previewExpiresAt, base.previewExpiresAt),
    signature: base.signature ?? input.signature ?? null,
    finalizedAt: finalized ? pick(input.finalizedAt, base.finalizedAt) : null,
    receivedRaw: finalized ? pick(input.receivedRaw, base.receivedRaw) : null,
    receivedDisplay: finalized ? pick(input.receivedDisplay, base.receivedDisplay) : null,
    paidRaw: finalized ? pick(input.paidRaw, base.paidRaw) : null,
    lastCheckedAt: pick(input.checkedAt, base.lastCheckedAt),
  };
  if (!finalized && (input.receivedRaw != null || input.paidRaw != null || input.receivedDisplay != null || input.finalizedAt != null)) return "invalid";
  return isActivityRecord(merged) ? merged : "invalid";
}

export type WithdrawOutcome =
  | { readonly ok: true; readonly removed: boolean }
  | { readonly ok: false; readonly reason: "invalid" | "conflict" | "storage_unavailable" };

export type ActivityStore = {
  list(): ActivityList;
  record(input: PurchaseAttemptInput): RecordOutcome;
  /**
   * Remove the attempt `attemptId` of `walletAddress` if it is still `opened`
   * without a signature (the wallet rejected it: nothing was sent). A record
   * in any other state is kept and reported as a conflict; a missing record
   * is not an error.
   */
  withdraw(attemptId: string, walletAddress: string): WithdrawOutcome;
  /** Delete every record in this browser. Touches nothing on the network. */
  clear(): boolean;
  subscribe(listener: () => void): () => void;
};

export function createActivityStore(options: { storage: () => ActivityStorage | null; now?: () => number }): ActivityStore {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  function read(): { storage: ActivityStorage; history: StoredHistory; skipped: number } | null {
    try {
      const storage = options.storage();
      if (!storage) return null;
      return { storage, ...parseHistory(storage.getItem(ACTIVITY_CONFIG.storageKey)) };
    } catch {
      return null;
    }
  }

  return {
    list() {
      const current = read();
      if (!current) return { status: "unavailable" };
      return { status: "available", records: current.history.partitions.flatMap((partition) => partition.records).sort(newestFirst), skipped: current.skipped };
    },
    record(input) {
      const current = read();
      if (!current) return { ok: false, reason: "storage_unavailable" };
      const { history } = current;
      let partition = history.partitions.find((entry) => entry.genesisHash === input.genesisHash && entry.walletAddress === input.walletAddress);
      const existing = history.partitions.flatMap((entry) => entry.records).find((record) => record.id === input.attemptId) ?? null;
      const merged = mergeAttempt(existing, input, now());
      if (typeof merged === "string") return { ok: false, reason: merged };
      if (!partition) {
        partition = { genesisHash: merged.genesisHash, walletAddress: merged.walletAddress, records: [] };
        history.partitions.push(partition);
      }
      partition.records = [merged, ...partition.records.filter((record) => record.id !== merged.id)];
      try {
        current.storage.setItem(ACTIVITY_CONFIG.storageKey, JSON.stringify(capped(history)));
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
      notify();
      return { ok: true, record: merged };
    },
    withdraw(attemptId, walletAddress) {
      if (!ATTEMPT_ID.test(attemptId) || !isAddressText(walletAddress)) return { ok: false, reason: "invalid" };
      const current = read();
      if (!current) return { ok: false, reason: "storage_unavailable" };
      const { history } = current;
      const partition = history.partitions.find((entry) => entry.walletAddress === walletAddress && entry.records.some((record) => record.id === attemptId));
      const existing = partition?.records.find((record) => record.id === attemptId);
      if (!partition || !existing) return { ok: true, removed: false };
      if (existing.phase !== "opened" || existing.signature !== null) return { ok: false, reason: "conflict" };
      partition.records = partition.records.filter((record) => record.id !== attemptId);
      try {
        current.storage.setItem(ACTIVITY_CONFIG.storageKey, JSON.stringify(capped(history)));
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
      notify();
      return { ok: true, removed: true };
    },
    clear() {
      try {
        const storage = options.storage();
        if (!storage) return false;
        storage.removeItem(ACTIVITY_CONFIG.storageKey);
      } catch {
        return false;
      }
      notify();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      // Another tab of this browser wrote the history.
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === ACTIVITY_CONFIG.storageKey) listener();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}

function browserStorage(): ActivityStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** This browser's history. */
export const activityStore: ActivityStore = createActivityStore({ storage: browserStorage });

/**
 * The one write into this browser's purchase history. The purchase flow calls
 * it at `awaitingWallet` (phase `opened`), when the wallet returns a
 * signature (`sent`), and at each later status; "Check again" calls it with
 * what it read. Never throws.
 */
export function recordPurchaseAttempt(input: PurchaseAttemptInput): RecordOutcome {
  return activityStore.record(input);
}

/** Remove an attempt the wallet rejected (still `opened`, no signature) from this browser's history. Never throws. */
export function withdrawOpenedAttempt(attemptId: string, walletAddress: string): WithdrawOutcome {
  return activityStore.withdraw(attemptId, walletAddress);
}

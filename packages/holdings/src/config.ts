/**
 * The single place for holdings-read constants. The reader and its tests
 * import from here; no literal of these values appears elsewhere.
 */

export const HOLDINGS_CONFIG = {
  /** Commitment for every holdings read. */
  commitment: "confirmed",
  /** Overall deadline of one explicit refresh (all reads together). */
  deadlineMs: 5_000,
  /**
   * Token accounts accepted per token program; a wallet with more is reported
   * (`account_limit`), not truncated. Kept at 256 on measured relay load
   * (2026-09-25): a base64 `getTokenAccountsByOwner` answer is about 450 bytes
   * per account, so 256 is about 115 KB per program and 230 KB per refresh. A
   * wallet past this limit held 3,494 SPL Token and 5,095 Token-2022 accounts
   * (1.6 MB and 2.3 MB answers); reading it would pass megabytes through the
   * relay on every refresh and near its 4 MiB upstream cap, while the relay's
   * per-client budget counts calls, not bytes.
   */
  maxAccountsPerProgram: 256,
  /** Distinct supported product mints read back in one refresh. */
  maxProductMints: 64,
  /** Largest accepted response body of one read, in UTF-16 code units of its text. */
  maxResponseLength: 2 * 1024 * 1024,
  /** Clock sysvar: the chain time at which the Scaled UI multiplier is evaluated. */
  clockSysvar: "SysvarC1ock11111111111111111111111111111111",
} as const;

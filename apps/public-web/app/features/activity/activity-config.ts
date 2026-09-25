/**
 * The single place for Activity constants (app IA sections 5.4 and 8.5).
 */
export const ACTIVITY_CONFIG = {
  /** The one `localStorage` key of the device-local purchase history. */
  storageKey: "benten.activity.v1",
  /** Schema tag written with the history; anything else is not read. */
  schema: "benten.activity.v1",
  /** Records kept per browser; the oldest beyond this are dropped on write. */
  maxRecords: 200,
  /**
   * Genesis hash of Solana mainnet-beta, the one cluster the purchase route
   * and the read-only relay use. A protocol constant; a record made on any
   * other cluster is listed but never checked through the relay.
   */
  mainnetGenesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  /** The privacy page that explains this storage (app IA section 8.12); `null` shows the explanation without a link. */
  privacyPath: ((localePrefix: string) => `${localePrefix}/legal/privacy`) as ((localePrefix: string) => string) | null,
} as const;

/**
 * Constants of the pay-token choice (USDC, SOL or SKR). The fixed-route
 * constants stay in `config.ts`; these apply only when the panel pays with a
 * token other than USDC. Components and flow code import from here.
 */

export const PAY_CONFIG = {
  /**
   * SOL kept back when paying with SOL (lamports): the network fee plus the
   * rent deposits the purchase may create (wrapped SOL, USDC and NVDAx token
   * accounts, about 0.002 SOL each; the wrapped SOL deposit is returned in the
   * same transaction). The pay field never accepts more than balance minus this.
   */
  solFeeReserveLamports: 10_000_000n,
  /**
   * Compute-unit limit of a two-leg purchase (pay token -> USDC -> NVDAx in
   * one transaction). Measured on mainnet 2026-09-25: about 105,000 units for
   * SOL -> USDC -> NVDAx; the limit leaves room for extra bin arrays.
   */
  twoLegComputeUnitLimit: 400_000,
} as const;

import { formatBpsAsPercent, formatPriceImpactPct } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { clockText, countdownText, nvdaxText, tokenText, usdcText } from "@benten/purchase/display";
import type { PreviewTerms } from "@benten/purchase/purchase-machine";
import { NVDAX_SYMBOL, PAY_TOKEN_UNITS, USDC_SYMBOL } from "@benten/purchase/route";
import { EMPTY_VALUE } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import type { PurchaseCopy } from "@/i18n/purchase-messages";
import { cn } from "@/lib/utils";

type Row = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Short secondary text (the raw integer, the absolute expiry time): on the value's line, wrapping only when the line is too narrow. */
  readonly beside: readonly string[];
  /** Longer secondary text, always under the value. */
  readonly lines: readonly string[];
  /** Explanation shown across the full row width under the value. */
  readonly note?: string;
};

/** NVDAx value text: scaled display amount, or raw units when no multiplier was read. */
function nvdaxValue(raw: bigint, preview: PreviewTerms, copy: PurchaseCopy["preview"], locale: PublicWebLocale): string {
  const scaled = nvdaxText(raw, preview.nvdaxMultiplier, locale);
  return scaled === null ? copy.rawOnly(raw.toString()) : `${scaled} ${NVDAX_SYMBOL}`;
}

/** The amounts, one full-width row each; the remaining terms sit in a two-column table below them. */
const AMOUNT_ROWS: ReadonlySet<string> = new Set(["pay", "firstLeg", "usdcIn", "expected", "minimum"]);

function impactText(pct: string, copy: PurchaseCopy["preview"]): string {
  const impact = formatPriceImpactPct(pct);
  return impact === null ? EMPTY_VALUE : impact.kind === "below" ? copy.priceImpactBelow : `${impact.text}%`;
}

/**
 * The swap preview as a description list. The three amounts (you pay,
 * expected, minimum) keep one full-width row each: label, then the value with
 * its raw integer beside it on the same line (values right-aligned; the row
 * wraps under the label only when the line is too narrow, as at 200% text
 * zoom). Pool fee, slippage, price impact and expiry follow as a small
 * two-column table, so at 390 x 844 the approve button and every term the
 * wallet approval depends on share one screen. `expired` dims the values,
 * never strikes them through, and keeps only the expiry time as a secondary
 * line: the raw integers and the minimum note exist to be compared with the
 * wallet at approval, which an expired preview no longer allows; a refreshed
 * preview shows them again.
 */
export function PurchaseTermsList({ preview, now, expired, copy, payCopy, locale }: { preview: PreviewTerms; now: number; expired: boolean; copy: PurchaseCopy["preview"]; payCopy: PurchaseCopy["pay"]; locale: PublicWebLocale }) {
  const feeRawOnly = !preview.feeOnInput && preview.nvdaxMultiplier === null;
  const feeText = (raw: bigint) => preview.feeOnInput ? `${usdcText(raw, locale)} ${USDC_SYMBOL}` : feeRawOnly ? copy.rawOnly(raw.toString()) : nvdaxValue(raw, preview, copy, locale);
  const leg = preview.firstLeg;
  const payTokenText = (raw: bigint) => `${tokenText(raw, PAY_TOKEN_UNITS[preview.payToken].decimals, locale)} ${preview.payToken}`;
  const payValue = leg === null ? `${usdcText(preview.inputRaw, locale)} ${USDC_SYMBOL}` : payTokenText(preview.inputRaw);
  const legRows: Row[] = leg === null ? [] : [
    {
      key: "firstLeg",
      label: payCopy.firstLeg,
      value: payCopy.firstLegValue(payValue, `${usdcText(leg.usdcOutRaw, locale)} ${USDC_SYMBOL}`),
      beside: [copy.raw(leg.usdcOutRaw.toString())],
      lines: [
        payCopy.firstLegFee(leg.feeOnInput ? payTokenText(leg.feeRaw) : `${usdcText(leg.feeRaw, locale)} ${USDC_SYMBOL}`),
        `${copy.priceImpact} ${impactText(leg.priceImpactPct, copy)}`,
      ],
      note: payCopy.limitBasis(usdcText(leg.usdcOutRaw, locale), usdcText(PURCHASE_CONFIG.maxUsdcInRaw, locale)),
    },
    {
      key: "usdcIn",
      label: payCopy.usdcIn,
      value: `${usdcText(leg.usdcMinimumRaw, locale)} ${USDC_SYMBOL}`,
      beside: [copy.raw(leg.usdcMinimumRaw.toString())],
      lines: [],
      note: payCopy.usdcInNote,
    },
  ];
  const rows: Row[] = [
    {
      key: "pay",
      label: copy.youPay,
      value: payValue,
      beside: [copy.raw(preview.inputRaw.toString())],
      lines: leg === null && preview.consumedInputRaw !== preview.inputRaw ? [copy.consumed(usdcText(preview.consumedInputRaw, locale), preview.consumedInputRaw.toString())] : [],
    },
    ...legRows,
    { key: "expected", label: copy.expected, value: nvdaxValue(preview.outputRaw, preview, copy, locale), beside: [copy.raw(preview.outputRaw.toString())], lines: [] },
    { key: "minimum", label: copy.minimum, value: nvdaxValue(preview.minimumOutputRaw, preview, copy, locale), beside: [copy.raw(preview.minimumOutputRaw.toString())], lines: [], note: copy.minimumNote },
    // With two legs these terms are the NVDAx pool's (the second leg); the first pool's sit on its own row.
    { key: "fee", label: leg === null ? copy.poolFee : payCopy.nvdaxPoolFee, value: feeText(preview.feeRaw), beside: [], lines: [copy.protocolShare(feeText(preview.protocolFeeRaw))] },
    { key: "slippage", label: copy.slippage, value: `${formatBpsAsPercent(PURCHASE_CONFIG.slippageBps)}%`, beside: [], lines: [] },
    { key: "impact", label: leg === null ? copy.priceImpact : payCopy.nvdaxPoolImpact, value: impactText(preview.priceImpactPct, copy), beside: [], lines: [] },
    {
      key: "expires",
      label: copy.expires,
      value: expired ? copy.expired : copy.expiresIn(countdownText(preview.expiresAt - now)),
      beside: [copy.expiresAt(clockText(preview.expiresAt, locale))],
      lines: [],
    },
  ];
  const valueClass = cn("text-sm tabular-nums wrap-anywhere", expired ? "font-normal text-muted-foreground" : "font-semibold");
  const beside = (row: Row) => (expired && row.key !== "expires" ? [] : row.beside).map((line) => (
    <span key={line} className="text-xs text-muted-foreground tabular-nums wrap-anywhere">{line}</span>
  ));
  const lines = (row: Row) => (expired ? [] : row.lines).map((line) => (
    <span key={line} className="basis-full text-xs text-muted-foreground tabular-nums wrap-anywhere">{line}</span>
  ));
  return (
    <dl data-purchase-terms={expired ? "expired" : "current"} className="grid grid-cols-2 gap-x-4 border-t">
      {rows.map((row) => AMOUNT_ROWS.has(row.key) ? (
        <div key={row.key} data-row={row.key} className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-3 border-b py-1 leading-snug">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          {/* Value first in reading order; the raw integer sits to its left on the same line, so values stay right-aligned. */}
          <dd className="ms-auto flex min-w-0 flex-row-reverse flex-wrap items-baseline justify-start gap-x-2 text-right">
            <span className={valueClass}>{row.value}</span>
            {beside(row)}
            {lines(row)}
          </dd>
          {row.note && !expired ? <dd className="basis-full text-xs text-muted-foreground">{row.note}</dd> : null}
        </div>
      ) : (
        <div key={row.key} data-row={row.key} className="flex min-w-0 flex-col border-b py-1 leading-snug">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className={valueClass}>{row.value}</span>
            {beside(row)}
            {lines(row)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

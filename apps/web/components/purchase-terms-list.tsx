import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
import { formatBpsAsPercent, formatPriceImpactPct } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { clockText, countdownText, nvdaxText, usdcText } from "@benten/purchase/display";
import type { PreviewTerms } from "@benten/purchase/purchase-machine";
import { NVDAX_SYMBOL, USDC_SYMBOL } from "@benten/purchase/route";

interface Row {
  key: string;
  label: string;
  value: string;
  lines: string[];
  /** Explanation shown across the full row width under the value. */
  note?: string;
}

/** NVDAx value text: scaled display amount, or raw units when no multiplier was read. */
function nvdaxValue(raw: bigint, preview: PreviewTerms, locale: Locale): string {
  const copy = messagesFor(locale).purchase.preview;
  const scaled = nvdaxText(raw, preview.nvdaxMultiplier, locale);
  return scaled === null ? copy.rawOnly(raw.toString()) : `${scaled} ${NVDAX_SYMBOL}`;
}

/**
 * The swap preview as a description list: label left, value right with
 * tabular figures, and the raw integer under every amount. `expired` dims the
 * values (never struck through) so they stay legible, and keeps only the
 * expiry time as a secondary line: the raw integers and the minimum note are
 * there to be compared with the wallet at approval, which an expired preview
 * no longer allows, and a refreshed preview shows them again.
 */
export function PurchaseTermsList({ preview, now, expired, locale }: { preview: PreviewTerms; now: number; expired: boolean; locale: Locale }) {
  const copy = messagesFor(locale).purchase.preview;
  const feeRawOnly = !preview.feeOnInput && preview.nvdaxMultiplier === null;
  const feeText = (raw: bigint) => preview.feeOnInput ? `${usdcText(raw, locale)} ${USDC_SYMBOL}` : feeRawOnly ? copy.rawOnly(raw.toString()) : nvdaxValue(raw, preview, locale);
  const impact = formatPriceImpactPct(preview.priceImpactPct);
  const rows: Row[] = [
    {
      key: "pay",
      label: copy.youPay,
      value: `${usdcText(preview.inputRaw, locale)} ${USDC_SYMBOL}`,
      lines: [
        copy.raw(preview.inputRaw.toString()),
        ...(preview.consumedInputRaw !== preview.inputRaw ? [copy.consumed(usdcText(preview.consumedInputRaw, locale), preview.consumedInputRaw.toString())] : []),
      ],
    },
    { key: "expected", label: copy.expected, value: nvdaxValue(preview.outputRaw, preview, locale), lines: [copy.raw(preview.outputRaw.toString())] },
    { key: "minimum", label: copy.minimum, value: nvdaxValue(preview.minimumOutputRaw, preview, locale), lines: [copy.raw(preview.minimumOutputRaw.toString())], note: copy.minimumNote },
    { key: "fee", label: copy.poolFee, value: feeText(preview.feeRaw), lines: [copy.protocolShare(feeText(preview.protocolFeeRaw))] },
    { key: "slippage", label: copy.slippage, value: `${formatBpsAsPercent(PURCHASE_CONFIG.slippageBps)}%`, lines: [] },
    { key: "impact", label: copy.priceImpact, value: impact === null ? "—" : impact.kind === "below" ? copy.priceImpactBelow : `${impact.text}%`, lines: [] },
    {
      key: "expires",
      label: copy.expires,
      value: expired ? copy.expired : copy.expiresIn(countdownText(preview.expiresAt - now)),
      lines: [copy.expiresAt(clockText(preview.expiresAt, locale))],
    },
  ];
  return (
    <dl className={`purchase-terms${expired ? " purchase-terms--expired" : ""}`}>
      {rows.map((row) => (
        <div className="purchase-terms__row" key={row.key} data-row={row.key}>
          <dt>{row.label}</dt>
          <dd>
            <span className="purchase-terms__value">{row.value}</span>
            {(expired && row.key !== "expires" ? [] : row.lines).map((line) => <span className="purchase-terms__raw" key={line}>{line}</span>)}
          </dd>
          {row.note && !expired ? <dd className="purchase-terms__note">{row.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

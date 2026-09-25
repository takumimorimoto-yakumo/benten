import { shortenAddress } from "@/lib/short-address";
import { cn } from "@/lib/utils";

/**
 * A wallet or token address shown short (its first and last characters),
 * so it fits one line on a phone. The full address stays whole for every
 * other reader: in `title` on pointer hover, and as the text a screen
 * reader reads (a hidden full text, since a label on a plain text element
 * is not announced reliably). Copying takes the full address through a
 * Copy action next to it, never this short form.
 */
export function ShortAddress({ address, label, className, visibleClassName, ...attributes }: {
  address: string;
  /** What a screen reader reads instead of the bare address, such as "Wallet {address}"; it must contain the full address. */
  label?: string;
  className?: string;
  /** Classes of the short text alone (for example truncation in a narrow button). */
  visibleClassName?: string;
} & Readonly<Record<`data-${string}`, string>>) {
  return (
    <span className={cn("font-mono", className)} title={address} {...attributes}>
      <span aria-hidden="true" className={visibleClassName}>{shortenAddress(address)}</span>
      <span className="sr-only">{label ?? address}</span>
    </span>
  );
}

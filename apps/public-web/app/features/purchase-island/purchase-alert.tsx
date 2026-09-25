import type { ReactNode, Ref } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Error notice built on the generated Alert: tinted attention surface, left
 * rule, an icon and a bold title, so meaning never depends on colour alone.
 * `announce` renders it as a live alert (the default); the earlier-request
 * warning is not announced.
 */
export function PurchaseAlert({ title, children, titleRef, announce = true }: { title: string; children?: ReactNode; titleRef?: Ref<HTMLHeadingElement>; announce?: boolean }) {
  return (
    <Alert
      role={announce ? "alert" : "note"}
      data-purchase-alert=""
      className="rounded-md border-0 border-s-(length:--notice-rule-width) border-s-destructive bg-(--attention-surface) px-3 py-2.5"
    >
      {/* The icon carries the attention colour; the title and body stay in ink for legibility. */}
      <CircleAlertIcon aria-hidden="true" className="text-destructive!" />
      <AlertTitle>
        <h3 ref={titleRef} tabIndex={-1} className="text-sm font-semibold">{title}</h3>
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-foreground [&_p:not(:last-child)]:mb-0">{children}</AlertDescription>
    </Alert>
  );
}

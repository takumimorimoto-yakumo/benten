import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The generated shadcn Button at the panel's touch-target height. `busy`
 * keeps the button focusable and announced but inert: no handler runs and
 * the wallet is never asked twice while it is open.
 */
export function PanelButton({ busy = false, className, onClick, ...props }: ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button
      size="lg"
      data-variant={props.variant ?? "default"}
      {...props}
      className={cn("min-h-(--touch-target-min) px-4", className)}
      {...(busy ? { "aria-disabled": true, "aria-busy": true } : { onClick })}
    />
  );
}

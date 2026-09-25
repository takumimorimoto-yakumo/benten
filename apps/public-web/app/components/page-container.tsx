import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The one horizontal page frame shared by the header, main content, and footer. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-(--page-max-width) px-(--page-gutter) md:px-6", className)} {...props} />;
}

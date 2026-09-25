import type { MouseEvent } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { hasInAppPrevious } from "@/features/navigation/in-app-history";
import { cn } from "@/lib/utils";

/**
 * The header back button on detail pages (app IA section 3.3). It is a link
 * to the page's logical parent, so it works without JavaScript and when the
 * page was opened directly (a shared link, a home-screen launch). When the
 * previous entry is inside the app it goes back in history instead, which
 * restores the earlier page and its scroll position. Browser Back is never
 * intercepted.
 */
export function BackButton({ parentHref, label }: { parentHref: string; label: string }) {
  const navigate = useNavigate();
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!hasInAppPrevious()) return;
    event.preventDefault();
    void navigate(-1);
  }
  return (
    <Link
      to={parentHref}
      onClick={onClick}
      aria-label={label}
      data-app-back=""
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "-ms-2 size-(--app-header-control-size) shrink-0 md:size-8")}
    >
      <ArrowLeftIcon aria-hidden="true" />
    </Link>
  );
}

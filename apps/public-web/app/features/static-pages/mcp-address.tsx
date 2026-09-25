import { MCP_PATH } from "@benten/mcp/config";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * The remote MCP endpoint's address on About (section `connect`). The
 * prerendered page cannot know the host it is served from, so it shows the
 * path and, once interactive, the full address on this origin.
 */
export function McpAddress({ label }: { label: string }) {
  const hydrated = useHydrated();
  const address = hydrated ? `${window.location.origin}${MCP_PATH}` : MCP_PATH;
  return (
    <p data-static-mcp-address="" className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <code className="w-fit rounded-md bg-muted px-2 py-1 font-mono break-all select-all">{address}</code>
    </p>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShareButton, shareableUrl, shareModeOf } from "../app/components/share-button.tsx";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { SHARE_MESSAGES } from "../app/i18n/shell-messages.ts";

describe("share button", () => {
  it("shares the page address without its hash or query", () => {
    expect(shareableUrl({ origin: "https://example.test", pathname: "/company/nvidia" })).toBe("https://example.test/company/nvidia");
  });

  it("uses the share sheet only where the browser offers one for a URL, and Copy link otherwise", () => {
    const share = async () => undefined;
    expect(shareModeOf({ share }, "https://example.test/")).toBe("share");
    expect(shareModeOf({ share, canShare: () => false }, "https://example.test/")).toBe("copy");
    expect(shareModeOf({}, "https://example.test/")).toBe("copy");
  });

  it("keeps its place but is inert before hydration, in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = renderToStaticMarkup(<ShareButton locale={locale} />);
      expect(html, locale).toContain('data-share-mode="pending"');
      expect(html, locale).toContain('tabindex="-1"');
      expect(html, locale).toContain('aria-hidden="true"');
      expect(html, locale).toContain(SHARE_MESSAGES[locale].share);
    }
  });
});

import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { MESSAGES, messagesFor } from "@/lib/i18n/messages";
function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "function" || typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}
describe("localized message catalogs", () => {
  it("has the same complete shape in every supported locale", () => {
    const english = leafPaths(MESSAGES.en).sort();
    for (const locale of LOCALES) expect(leafPaths(messagesFor(locale)).sort()).toEqual(english);
  });
  it("provides explicit non-English page metadata and key state feedback", () => {
    for (const locale of LOCALES.filter((locale) => locale !== "en")) {
      const copy = messagesFor(locale);
      expect(copy.metadata.title).not.toBe(MESSAGES.en.metadata.title);
      expect(copy.states.invalid).not.toBe(MESSAGES.en.states.invalid);
      expect(copy.legacy.fields.revenue).not.toBe(MESSAGES.en.legacy.fields.revenue);
      expect(copy.mcp.unavailable).not.toBe(MESSAGES.en.mcp.unavailable);
    }
  });
});

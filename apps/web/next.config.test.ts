import { describe, expect, it } from "vitest";
import nextConfig from "./next.config.mjs";

describe("legacy Next image configuration", () => {
  it("disables the built-in image optimizer", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});

import { CHART_CONFIG } from "@/features/charts/chart-config";

/** A y axis column wide enough for its longest label (a CJK character counts wider). */
export function axisWidth(labels: readonly string[]): number {
  const longest = Math.max(0, ...labels.map((label) => [...label].reduce((sum, char) => sum + (char.charCodeAt(0) > 0xff ? CHART_CONFIG.axisLabel.wideCharEm : 1), 0)));
  return Math.max(CHART_CONFIG.axisLabel.minPx, longest * CHART_CONFIG.axisLabel.charPx + CHART_CONFIG.axisLabel.gapPx);
}

/**
 * Build-config flag for the charts' fixture data (see
 * `app/features/charts/chart-fixture.ts`). Set only for local review builds
 * (`BENTEN_PUBLIC_WEB_CHART_FIXTURE=1`); a hosted or CI build with the flag
 * set fails, so fixture numbers never reach a published page. Pages built
 * with it say, next to the chart, that the data is a sample.
 */
const requested = process.env.BENTEN_PUBLIC_WEB_CHART_FIXTURE === "1";

if (requested && (process.env.VERCEL || process.env.CI)) {
  throw new Error("chart fixture data is for local review builds only");
}

export const CHART_FIXTURE_ENABLED = requested;

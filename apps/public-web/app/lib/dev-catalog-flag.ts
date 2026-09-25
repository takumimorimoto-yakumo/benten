/**
 * Build-config flag for the development-only Living Catalog route. Enabled only
 * by the `dev:catalog` script; a production build with the flag set fails.
 */
const requested = process.env.BENTEN_PUBLIC_WEB_DEV_CATALOG === "1";

if (requested && process.argv.some((argument) => argument === "build")) {
  throw new Error("the Living Catalog is development-only and cannot be built");
}

export const DEV_CATALOG_ENABLED = requested;

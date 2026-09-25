/**
 * Whether the previous history entry belongs to this visit of the app (app
 * IA section 3.3). React Router numbers the entries it creates in
 * `history.state.idx`, starting at 0 for the entry the document was opened
 * with. A shared link, a reload of a first entry or a home-screen launch
 * therefore reads 0, and the in-app back button goes to the logical parent
 * instead of leaving the app.
 */
export function hasInAppPrevious(): boolean {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === "number" && state.idx > 0;
}

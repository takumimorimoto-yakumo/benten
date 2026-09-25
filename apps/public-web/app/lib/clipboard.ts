/**
 * Copy one exact string (an address or signature, never an abbreviation).
 * Clipboard API first, then a hidden textarea fallback. Resolves to whether
 * the text was copied, so callers show an explicit unavailable state rather
 * than a silent no-op.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }
  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  fallback.remove();
  return copied;
}

/** How long a Copied / unavailable label stays before returning to its idle label. */
export const COPY_FEEDBACK_MS = 1800;

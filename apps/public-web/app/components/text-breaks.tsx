import { Children, Fragment, type ReactNode } from "react";

/**
 * Line-breaking helpers for short reference text (dates, filing labels,
 * XBRL concepts) in narrow table cells. They change where a line may break,
 * never the text itself.
 */

/** Keeps one unit, such as a date, on a single line. */
export function NoWrap({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

/** Private-use markers: a message function formats placeholders, then each is swapped for its node. */
const SLOT_OPEN = "\u{E000}";
const SLOT_CLOSE = "\u{E001}";
const SLOT_PATTERN = new RegExp(`${SLOT_OPEN}(\\d+)${SLOT_CLOSE}`, "u");

/**
 * Formats a message whose arguments are nodes (for example a date wrapped in
 * `NoWrap`), keeping the catalog's own word order in every locale. Returns
 * keyed children.
 */
export function interpolate(format: (...args: string[]) => string, nodes: readonly ReactNode[]): ReactNode[] {
  const text = format(...nodes.map((_, index) => `${SLOT_OPEN}${index}${SLOT_CLOSE}`));
  const parts = text.split(SLOT_PATTERN);
  return Children.toArray(parts.map((part, index) => (index % 2 === 1 ? nodes[Number(part)] : part)).filter((part) => part !== ""));
}

/** Break opportunities after the taxonomy prefix and at camelCase boundaries. */
const CONCEPT_BREAK = /(?<=:)|(?<=[a-z])(?=[A-Z])/;

/** An XBRL concept name that wraps between its words instead of mid-word. */
export function ConceptName({ concept }: { concept: string }) {
  const words = concept.split(CONCEPT_BREAK);
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {word}
        </Fragment>
      ))}
    </>
  );
}

/** The last whitespace-separated word of a string, with the text before it. */
function splitLastWord(text: string): [string, string] {
  const start = text.search(/\S+\s*$/);
  return start <= 0 ? ["", text] : [text.slice(0, start), text.slice(start)];
}

/**
 * Appends a trailing mark (such as an external-link icon) so that it stays on
 * the same line as the last word or last node of `children`.
 */
export function withTrailingMark(children: ReactNode, mark: ReactNode): ReactNode {
  const parts = Children.toArray(children);
  const last = parts.at(-1);
  if (last === undefined) return mark;
  const lead = parts.slice(0, -1);
  if (typeof last === "string" || typeof last === "number") {
    const [head, tail] = splitLastWord(String(last));
    return <>{lead}{head}<NoWrap>{tail}{mark}</NoWrap></>;
  }
  return <>{lead}<NoWrap>{last}{mark}</NoWrap></>;
}

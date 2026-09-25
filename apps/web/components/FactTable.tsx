import { formatValue, type ValueKind } from "@/lib/format";

export interface Fact {
  label: string;
  value: unknown;
  /** Render the value in a monospace face (addresses, identifiers). */
  mono?: boolean;
  /** Full text shown on hover when the displayed value is abbreviated. */
  title?: string;
  /** How a numeric value is read. Defaults to `quantity` (digit grouping). */
  kind?: ValueKind;
}

/**
 * Two-column label/value table used for every "facts" block in the app.
 *
 * Values are right-aligned with tabular figures so that digits line up
 * across rows. Presentation only — no value is computed here.
 */
export function FactTable({ caption, valueLabel = "Value", facts }: { caption?: string; valueLabel?: string; facts: ReadonlyArray<Fact> }) {
  return (
    <div className="table-scroll fact-table">
      <table>
        {caption ? (
          <thead>
            <tr>
              <th scope="col">{caption}</th>
              <th scope="col" className="cell--numeric">
                {valueLabel}
              </th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {facts.map((fact) => (
            <tr key={fact.label}>
              <td className="cell--key">{fact.label}</td>
              <td className="cell--numeric" title={fact.title}>
                <span className={fact.mono ? "mono" : undefined}>
                  {formatValue(fact.value, fact.kind)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

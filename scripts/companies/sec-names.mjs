/**
 * SEC registrant name helpers shared by the company-map and verified-facts
 * generators. Tooling only; no runtime package imports this file.
 *
 * A comparison key tells whether two SEC name sources name the same
 * registrant: case, punctuation, state suffixes (`/DE/`) and trailing legal
 * forms are removed. It is a review aid for generators, never a runtime
 * lookup: published artifacts store the result and the names it compared.
 */

/** Legal-form words dropped from the end of a comparison key, after canonical spelling. */
const LEGAL_FORM_WORDS = new Set(["INC", "CORP", "CO", "LTD", "PLC", "NV", "SA", "AG", "LLC", "LP", "AS"]);
const CANONICAL_WORD = { CORPORATION: "CORP", INCORPORATED: "INC", COMPANY: "CO", LIMITED: "LTD" };

/** Words of a registrant name with case, punctuation, state suffixes and legal forms removed. */
export function comparisonWords(name) {
  let upper = name.toUpperCase().replace(/[‘’']/g, "").replace(/&/g, " AND ");
  for (let previous = ""; previous !== upper;) {
    previous = upper;
    upper = upper.replace(/\s*\/\s*[A-Z]{2}\s*\/?\s*$/, "").replace(/\s*\/\s*$/, "").trim();
  }
  const words = upper.split(/[^A-Z0-9]+/).filter(Boolean).map((word) => CANONICAL_WORD[word] ?? word);
  if (words[0] === "THE") words.shift();
  for (;;) {
    const last = words.at(-1);
    const pair = words.length >= 2 ? `${words.at(-2)}${last}` : "";
    if (LEGAL_FORM_WORDS.has(last)) words.pop();
    else if (words.length >= 3 && LEGAL_FORM_WORDS.has(pair) && words.at(-2).length === 1) words.splice(-2, 2);
    else break;
  }
  return words;
}

/** Whether two SEC names reduce to the same comparison key. */
export function sameRegistrant(left, right) {
  return typeof left === "string" && typeof right === "string" && comparisonWords(left).join(" ") === comparisonWords(right).join(" ");
}

/**
 * The registrant name of a CIK for a record built from one of its filings.
 *
 * `companyfacts.entityName` is the registrant name of the CIK's latest XBRL
 * filing, which can be another filer's: a joint prospectus filed with a
 * subsidiary issuer (Bank of America's 424B2 with BofA Finance LLC) makes it
 * the subsidiary's name. `submissions.name` is the name EDGAR holds for the
 * CIK itself. The companyfacts spelling is kept while both name the same
 * registrant; otherwise the submissions name is the registrant. `null` when
 * neither is usable.
 */
export function registrantName(companyfactsEntityName, submissionsName) {
  const facts = typeof companyfactsEntityName === "string" ? companyfactsEntityName.trim() : "";
  const filed = typeof submissionsName === "string" ? submissionsName.trim() : "";
  if (filed.length < 1) return facts.length >= 1 ? facts : null;
  if (facts.length >= 1 && sameRegistrant(facts, filed)) return facts;
  return filed;
}

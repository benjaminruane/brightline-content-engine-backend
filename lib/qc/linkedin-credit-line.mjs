/**
 * B449. On a LinkedIn post, a structural_integrity concern that is only a
 * name plus a relative clause, or a short credit line, is not a fragment
 * the rulebook asked for. A dangling modifier, a run-on, and an agreement
 * error do not match these shapes, so they stay.
 */

const NAME = "[\\p{Lu}][\\p{L}'’\\-]*";
const TITLE = "(?:CEO|CFO|CTO|COO|Mr|Mrs|Ms|Dr)\\.?";
const NAME_PLUS_RELATIVE_RE = new RegExp(
  `^(?:And\\s+)?${NAME}(?:\\s+${NAME}){0,4},\\s+wh(?:o|om|ose|ich)\\b[\\s\\S]*$`,
  "u"
);
const SHORT_CREDIT_RE = new RegExp(
  `^(?:And\\s+)?(?:${TITLE}\\s+)?${NAME}(?:\\s+${NAME}){0,3}(?:,\\s+${TITLE})?\\.?$`,
  "u"
);

export function isNamePlusRelativeClause(text) {
  if (typeof text !== "string") throw new Error("isNamePlusRelativeClause: text is missing");
  return NAME_PLUS_RELATIVE_RE.test(text.trim());
}

export function isShortCreditLine(text) {
  if (typeof text !== "string") throw new Error("isShortCreditLine: text is missing");
  const trimmed = text.trim();
  const words = trimmed.replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 8) return false;
  return SHORT_CREDIT_RE.test(trimmed);
}

export function isLinkedInCreditLine(text) {
  if (typeof text !== "string") throw new Error("isLinkedInCreditLine: text is missing");
  return isNamePlusRelativeClause(text) || isShortCreditLine(text);
}

function citedText(concern, statementText) {
  const spans = Array.isArray(concern?.span) ? concern.span : [];
  const first = spans[0];
  if (
    first &&
    Number.isInteger(first.startChar) &&
    Number.isInteger(first.endChar) &&
    first.endChar > first.startChar
  ) {
    return statementText.slice(first.startChar, first.endChar);
  }
  if (typeof concern?.quote === "string" && concern.quote.trim()) return concern.quote;
  return statementText;
}

/**
 * Drop the LinkedIn credit-line exception. Any other output type is returned
 * as given. A missing output type is refused. A missing statement is refused
 * only when this output type would inspect the text.
 */
export function suppressLinkedInCreditLines(concerns, statementText, outputType) {
  if (!Array.isArray(concerns)) throw new Error("suppressLinkedInCreditLines: concerns are missing");
  if (outputType == null || String(outputType).trim() === "") {
    throw new Error("suppressLinkedInCreditLines: output type is missing");
  }
  if (String(outputType) !== "linkedin_post") return concerns;
  if (typeof statementText !== "string") {
    throw new Error("suppressLinkedInCreditLines: statement is missing");
  }
  return concerns.filter((concern) => {
    const code = typeof concern?.concernCode === "string" && concern.concernCode
      ? concern.concernCode
      : typeof concern?.rule === "string"
        ? concern.rule
        : "";
    if (code !== "structural_integrity") return true;
    const quote = citedText(concern, statementText);
    if (!isLinkedInCreditLine(quote)) return true;
    console.log(
      `[editorial] structural_integrity concern dropped, LinkedIn credit line "${String(quote).slice(0, 120)}"`
    );
    return false;
  });
}

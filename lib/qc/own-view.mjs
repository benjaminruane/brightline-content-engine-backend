/**
 * B540. A sentence that only states the writer's own view, and that
 * carries no figure, date, name, or outcome, is not a claim.
 */

const CHECKABLE =
  /\d|\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|q[1-4]|quarter)\b|\b(?:completed|signed|agreed|closed|approved|look forward|recommend|commit|intend)\b/i;

const VIEW =
  /^(?:we|i)\s+(?:remain|stay|continue to (?:be|feel))\b|^(?:we|i)\s+(?:are|am)\s+(?:constructive|positive|cautious|optimistic|neutral|comfortable|supportive|confident)\b|^(?:in our view|our view is)\b/i;

// AUTHOR-NAME-BLIND: a capitalised name is a checkable referent. The author's name is one too, so naming it keeps the sentence a claim.

function hasName(text) {
  const rest = String(text || "").replace(/^\s*\S+\s*/, "");
  if (/\b[A-Z]{2,}\b/.test(rest)) return true;
  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(rest);
}

export function isOwnViewWithoutFact(text) {
  const body = typeof text === "string" ? text.trim() : "";
  if (!body || !VIEW.test(body)) return false;
  if (CHECKABLE.test(body) || hasName(body)) return false;
  return true;
}

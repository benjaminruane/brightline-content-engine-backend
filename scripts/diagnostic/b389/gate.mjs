/**
 * B389 gate. Implements scripts/diagnostic/b389/GATE.md.
 * No model calls. The rules in GATE.md are not revised from here.
 */
import { repairNormaliseWithMap } from "../../../lib/qc/excerpt-from-source.mjs";
import { capitalisedNames, numberKeySet, numberTokens } from "../b381/fabrication-checks.mjs";

const MONTH_ALT =
  "january|february|march|april|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|may";

const MONTH_INDEX = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const DAY_MONTH_YEAR = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\s+(\\d{4})\\b`,
  "gi"
);
const MONTH_DAY_YEAR = new RegExp(
  `\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  "gi"
);

export function normaliseForLocate(text) {
  return repairNormaliseWithMap(String(text ?? "").trim()).normalised;
}

export function hasEllipsis(passage) {
  return String(passage ?? "").includes("...") || String(passage ?? "").includes("\u2026");
}

export function citationPieces(passage) {
  const raw = String(passage ?? "");
  if (!hasEllipsis(raw)) {
    const whole = raw.trim();
    return { ellipsis: false, pieces: whole ? [whole] : [] };
  }
  const pieces = raw
    .split(/\u2026|\.{3}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
  return { ellipsis: true, pieces };
}

export function findSource(sources, sourceId) {
  if (sourceId == null) return null;
  const id = String(sourceId).trim();
  if (!id) return null;
  return (sources || []).find((source) => source.id === id || source.label === id) || null;
}

export function passageVerifies(sourceText, passage) {
  if (typeof passage !== "string" || !passage.trim()) return false;
  if (typeof sourceText !== "string" || !sourceText) return false;
  const { ellipsis, pieces } = citationPieces(passage);
  if (pieces.length === 0) return false;
  if (ellipsis && pieces.length === 0) return false;
  const hay = repairNormaliseWithMap(sourceText).normalised;
  return pieces.every((piece) => {
    const needle = normaliseForLocate(piece);
    return needle.length > 0 && hay.indexOf(needle) !== -1;
  });
}

export function dateKeys(text) {
  const keys = new Set();
  const input = String(text ?? "");
  for (const match of input.matchAll(DAY_MONTH_YEAR)) {
    const key = dateKey(match[1], match[2], match[3]);
    if (key) keys.add(key);
  }
  for (const match of input.matchAll(MONTH_DAY_YEAR)) {
    const key = dateKey(match[2], match[1], match[3]);
    if (key) keys.add(key);
  }
  return [...keys];
}

function dateKey(dayRaw, monthRaw, yearRaw) {
  const day = Number(dayRaw);
  const month = MONTH_INDEX[String(monthRaw).toLowerCase()];
  const year = Number(yearRaw);
  if (!month || !Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nameInPassage(name, passage) {
  const needle = String(name)
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const hay = String(passage)
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ");
  return needle.length > 0 && hay.includes(needle);
}

export function missingElements(claimText, passageText) {
  const missing = [];
  const passageFigures = numberKeySet(passageText);
  for (const token of numberTokens(claimText)) {
    if (!passageFigures.has(token.key)) {
      missing.push({ kind: "figure", value: token.raw, key: token.key });
    }
  }
  for (const name of capitalisedNames(claimText)) {
    if (!nameInPassage(name.raw, passageText)) {
      missing.push({ kind: "name", value: name.raw });
    }
  }
  const passageDates = new Set(dateKeys(passageText));
  for (const key of dateKeys(claimText)) {
    if (!passageDates.has(key)) missing.push({ kind: "date", value: key });
  }
  return missing;
}

export function assessClaim(claim, sources) {
  const source = findSource(sources, claim?.sourceId);
  const passage = typeof claim?.passage === "string" ? claim.passage : "";
  const verifies = source ? passageVerifies(source.text, passage) : false;
  const confirmed = claim?.verdict === "confirmed";
  const missing = confirmed && verifies ? missingElements(claim?.claim, passage) : [];
  return {
    verifies,
    confirmed,
    demoted: missing.length > 0,
    missing,
    commentWithheld: !verifies,
    comment: typeof claim?.comment === "string" ? claim.comment : "",
  };
}

export function gateStatement(claims, sources) {
  const rows = (Array.isArray(claims) ? claims : []).map((claim) => assessClaim(claim, sources));
  let state = "could_not_verify";
  if (rows.length > 0 && rows.every((row) => row.confirmed && row.verifies && !row.demoted)) {
    state = "verified_green";
  } else if (rows.some((row) => !row.confirmed && row.verifies)) {
    state = "flagged";
  }
  return { state, claims: rows };
}

export function agreementState(state, otherState) {
  if (state === "verified_green" && otherState !== "verified_green") return "could_not_verify";
  return state;
}

export function scoreVerdict(state, storedDisplayVerdict) {
  if (state === "verified_green") return "supported_full";
  if (state === "could_not_verify") return "not_supported";
  const mapped = mapStored(storedDisplayVerdict);
  if (mapped) return storedDisplayVerdict;
  return "supported_partial";
}

function mapStored(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ /g, "_");
  if (s === "supported_partial" || s === "partially_confirmed" || s === "partial") return s;
  if (s === "conflict" || s === "conflicting") return s;
  if (s === "not_supported" || s === "no_support" || s === "no_clear_support") return s;
  return null;
}

function assertCanons() {
  const may = dateKeys("13 May 2026").join(",");
  const american = dateKeys("May 13, 2026").join(",");
  if (may !== "2026-05-13" || american !== "2026-05-13") {
    throw new Error(`Date canon failed: ${may} / ${american}`);
  }
  const source = "Alpha beta gamma delta. Later the same source says epsilon zeta eta theta.";
  const joined = "Alpha beta gamma delta. ... Later the same source says epsilon zeta eta theta.";
  if (!passageVerifies(source, joined)) throw new Error("Ellipsis canon failed.");
  if (passageVerifies(source, "Alpha beta gamma delta. ... not in the source at all here")) {
    throw new Error("Ellipsis canon accepted a missing fragment.");
  }
  if (passageVerifies(source, "short ... also")) throw new Error("Short fragments verified.");
}

assertCanons();

/**
 * A public draft may state a confidential figure only when a public source states it.
 * The check names the figure. It does not delete text.
 */
import { normalizePublicationState } from "../source-publication-state.mjs";
import { sentenceList } from "../text/sentences.mjs";

const RETURN_TERMS = ["DPI", "TVPI", "MOIC", "RVPI", "IRR"];
const CURRENCY = "USD|EUR|GBP|CHF|CAD|AUD|HKD|NZD|SGD|\\$|£|€|C\\$|A\\$|S\\$|HK\\$|NZ\\$";

function sourceName(source, index) {
  return (typeof source?.name === "string" && source.name.trim())
    || (typeof source?.title === "string" && source.title.trim())
    || (typeof source?.label === "string" && source.label.trim())
    || `Source ${index + 1}`;
}

function sentences(text) {
  return sentenceList(text);
}

function numberToken(surface) {
  const match = String(surface).match(/\d[\d.,']*/);
  return match ? match[0].replace(/[,']/g, "") : "";
}

function textHasNumber(text, raw) {
  if (!raw) return false;
  const escaped = raw.replace(".", "\\.");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(text);
}

function roundsToSameBillion(surface, sourceText) {
  const match = String(surface).match(/(\d+\.\d)\s*billion/i);
  if (!match) return false;
  const target = Number(match[1]);
  for (const hit of sourceText.matchAll(/\b(\d{1,3}(?:[,']\d{3})+|\d+)\s*million\b/gi)) {
    const millions = Number(hit[1].replace(/[,']/g, ""));
    if (Number.isFinite(millions) && Math.round(millions / 100) / 10 === target) return true;
  }
  return false;
}

function returnMeasureSurfaces(text) {
  const found = [];
  for (const sentence of sentences(text)) {
    if (/\bexceed(?:s|ed|ing)?\s+contributed\s+capital\b/i.test(sentence) || /\b(?:above|over|beyond)\s+contributed\s+capital\b/i.test(sentence)) {
      found.push("exceed contributed capital");
    }
    for (const term of RETURN_TERMS) {
      if (new RegExp(`\\b${term}\\b`).test(sentence)) found.push(term);
    }
    const hasMultiple = /\b\d+(?:\.\d+)?x\b/i.test(sentence);
    if (/\bgross\s+multiple\b/i.test(sentence) && !hasMultiple) found.push("gross multiple");
    if (/\bnet\s+multiple\b/i.test(sentence) && !hasMultiple) found.push("net multiple");
  }
  return [...new Set(found)];
}

function sentenceFor(text, surface) {
  return sentences(text).find((sentence) => sentence.includes(surface)) || "";
}

function sourceText(source) {
  return typeof source?.text === "string" ? source.text : "";
}

function statesMeasure(text, surface) {
  if (surface === "exceed contributed capital") return /\b(?:DPI|TVPI|MOIC|RVPI|contributed capital)\b/i.test(text);
  if (surface === "gross multiple" || surface === "net multiple") return new RegExp(surface, "i").test(text);
  return new RegExp(`\\b${surface}\\b`).test(text);
}

function surfacesIn(text) {
  const found = [];
  for (const sentence of sentences(text)) {
    for (const match of sentence.matchAll(/~?\+?-?\d+(?:\.\d+)?x\b/gi)) found.push(match[0]);
    for (const match of sentence.matchAll(/~?\+?-?\d+(?:\.\d+)?\s*(?:%|percent|per cent)/gi)) {
      found.push(match[0].replace(/\s+/g, " ").trim());
    }
    for (const match of sentence.matchAll(new RegExp(`\\b(?:${CURRENCY})\\s?\\d[\\d.,']*(?:\\s*(?:million|billion))?`, "gi"))) {
      found.push(match[0].replace(/\s+/g, " ").trim());
    }
    for (const match of sentence.matchAll(/\b\d[\d.,']*\s*pence\b/gi)) {
      found.push(match[0].replace(/\s+/g, " ").trim());
    }
  }
  return [...new Set(found)];
}

function isMultiple(surface) {
  return /\d(?:\.\d+)?x$/i.test(String(surface).replace(/^~/, ""));
}

function isPercent(surface) {
  return /(?:%|percent|per cent)$/i.test(String(surface).trim());
}

function percentIn(surface, text) {
  const raw = numberToken(surface);
  if (!raw || !text) return false;
  const escaped = raw.replace(".", "\\.");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d])\\s*(?:%|percent|per cent)`, "i").test(text);
}

function currencyOf(text) {
  const value = String(text || "");
  if (/£|\bGBP\b/.test(value) || /\bpence\b/i.test(value)) return "GBP";
  if (/€|\bEUR\b/.test(value)) return "EUR";
  if (/C\$|\bCAD\b/.test(value)) return "CAD";
  if (/A\$|\bAUD\b/.test(value)) return "AUD";
  if (/HK\$|\bHKD\b/.test(value)) return "HKD";
  if (/NZ\$|\bNZD\b/.test(value)) return "NZD";
  if (/S\$|\bSGD\b/.test(value)) return "SGD";
  if (/\bCHF\b/.test(value)) return "CHF";
  if (/\$|\bUSD\b/.test(value)) return "USD";
  return "";
}

function sameBillion(surface, text) {
  if (roundsToSameBillion(surface, text)) return true;
  const match = String(surface).match(/(\d+(?:\.\d+)?)\s*billion/i);
  if (!match) return false;
  const target = Math.round(Number(match[1]) * 10) / 10;
  if (!Number.isFinite(target)) return false;
  for (const hit of String(text).matchAll(/\b(\d+(?:\.\d+)?)\s*billion\b/gi)) {
    if (Math.round(Number(hit[1]) * 10) / 10 === target) return true;
  }
  return false;
}

function moneyIn(surface, text) {
  if (!text) return false;
  const wanted = currencyOf(surface);
  const found = currencyOf(text);
  if (!wanted || (found && found !== wanted)) return false;
  if (sameBillion(surface, text)) return true;
  const raw = numberToken(surface);
  if (!raw || !textHasNumber(text, raw)) return false;
  if (/\bbillion\b/i.test(surface)) return /\bbillion\b/i.test(text);
  if (/\bmillion\b/i.test(surface)) return /\bmillion\b/i.test(text) || sameBillion(surface, text);
  return true;
}

function figureIn(surface, text) {
  if (isReturnTerm(surface)) return statesMeasure(text, surface);
  if (isMultiple(surface)) return text.toLowerCase().includes(String(surface).replace(/^~/, "").toLowerCase());
  if (isPercent(surface)) return percentIn(surface, text);
  return moneyIn(surface, text);
}

function publicSources(sources) {
  return (Array.isArray(sources) ? sources : []).filter((source) => normalizePublicationState(source?.publicationState) === "published_external");
}

/**
 * Every confidential figure in the draft, with where it was found.
 * result is "passes" when a public source states it.
 */
function isReturnTerm(surface) {
  return RETURN_TERMS.includes(surface) || surface === "exceed contributed capital" || surface === "gross multiple" || surface === "net multiple";
}

function multiplePasses(surface, draft, publics) {
  const sentence = sentenceFor(draft, surface);
  const term = RETURN_TERMS.find((item) => new RegExp(`\\b${item}\\b`).test(sentence));
  if (term) return publics.some((source) => new RegExp(`\\b${term}\\b`).test(sourceText(source)));
  if (/\b(?:gross|net)\s+multiple\b/i.test(sentence)) {
    return publics.some((source) => /\b(?:gross|net)\s+multiple\b/i.test(sourceText(source)) && sourceText(source).toLowerCase().includes(surface.toLowerCase()));
  }
  return publics.some((source) => sourceText(source).toLowerCase().includes(surface.toLowerCase()));
}

export function inspectPublicFigures(draft, sources) {
  const list = Array.isArray(sources) ? sources : [];
  const publics = publicSources(list);
  const surfaces = [...new Set([...surfacesIn(draft), ...returnMeasureSurfaces(draft)])];
  return surfaces.map((surface) => {
    let where = "no loaded source";
    let state = "";
    for (let i = 0; i < list.length; i += 1) {
      const text = sourceText(list[i]);
      if (!figureIn(surface, text)) continue;
      where = sourceName(list[i], i);
      state = normalizePublicationState(list[i]?.publicationState);
      break;
    }
    const inPublic = isMultiple(surface)
      ? multiplePasses(surface, draft, publics)
      : publics.some((source) => figureIn(surface, sourceText(source)));
    return {
      surface,
      source: where,
      publicationState: state,
      result: inPublic ? "passes" : state === "restricted" ? "restricted" : "not in a public source",
    };
  });
}

export function figuresMissingFromPublicSources(draft, sources) {
  return inspectPublicFigures(draft, sources).filter((row) => row.result !== "passes");
}

export function publicFigureNote(figures) {
  const list = Array.isArray(figures) ? figures : [];
  if (!list.length) return "";
  const named = list.map((row) => {
    if (row.source && row.source !== "no loaded source" && row.publicationState) {
      return `${row.surface}, which appears in ${row.source} (${row.publicationState}) and in no public source`;
    }
    return `${row.surface}, which appears in no public source`;
  });
  return `This public draft states ${named.join("; ")}.`;
}

/**
 * One regeneration. The figure stays in the draft when the rewrite still states it.
 * @param {{ draft: string, sources: Array<object>, visibility: string, regenerate: (figures: Array<object>) => Promise<string> }} args
 */
export async function settlePublicDraft({ draft, sources, visibility, regenerate }) {
  const text = typeof draft === "string" ? draft : "";
  if (String(visibility || "").trim().toUpperCase() !== "PUBLIC") return { text, note: "", regenerated: false };
  const missing = figuresMissingFromPublicSources(text, sources);
  if (!missing.length) return { text, note: "", regenerated: false };
  if (typeof regenerate !== "function") throw new Error("public figures: regenerate is missing");
  const rewritten = await regenerate(missing);
  const next = typeof rewritten === "string" && rewritten.trim() ? rewritten : text;
  const still = figuresMissingFromPublicSources(next, sources);
  return { text: next, note: publicFigureNote(still), regenerated: true };
}

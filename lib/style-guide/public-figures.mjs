/**
 * A public draft may state a confidential figure only when a public source states it.
 * The check names the figure. It does not delete text.
 */
import { normalizePublicationState } from "../source-publication-state.mjs";

const CONFIDENTIAL_CONTEXT = /\b(?:IRR|DPI|TVPI|MOIC|RVPI|valuation|valued|enterprise value|\bNAV\b|returns?|multiple)\b/i;
const RETURN_TERMS = ["DPI", "TVPI", "MOIC", "RVPI", "IRR"];

function sourceName(source, index) {
  return (typeof source?.name === "string" && source.name.trim())
    || (typeof source?.title === "string" && source.title.trim())
    || (typeof source?.label === "string" && source.label.trim())
    || `Source ${index + 1}`;
}

function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/);
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
    for (const match of sentence.matchAll(/\b\d+(?:\.\d+)?x\b/gi)) found.push(match[0]);
    if (!CONFIDENTIAL_CONTEXT.test(sentence)) continue;
    for (const match of sentence.matchAll(/\b\d+(?:\.\d+)?%/g)) found.push(match[0]);
    for (const match of sentence.matchAll(/\b(?:USD|EUR|GBP|CHF|CAD|AUD|HKD|NZD|SGD|\$|£|€)\s?\d[\d.,']*(?:\s*(?:million|billion))?/gi)) {
      found.push(match[0].replace(/\s+/g, " ").trim());
    }
  }
  return [...new Set(found)];
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
      const raw = numberToken(surface);
      const hit = isReturnTerm(surface)
        ? statesMeasure(text, surface)
        : text && (textHasNumber(text, raw) || roundsToSameBillion(surface, text) || text.toLowerCase().includes(surface.toLowerCase()));
      if (!hit) continue;
      where = sourceName(list[i], i);
      state = normalizePublicationState(list[i]?.publicationState);
      break;
    }
    const inPublic = /\d(?:\.\d+)?x$/i.test(surface)
      ? multiplePasses(surface, draft, publics)
      : isReturnTerm(surface)
        ? publics.some((source) => statesMeasure(sourceText(source), surface))
        : publics.some((source) => {
          const text = sourceText(source);
          const raw = numberToken(surface);
          return textHasNumber(text, raw) || roundsToSameBillion(surface, text) || text.toLowerCase().includes(surface.toLowerCase());
        });
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

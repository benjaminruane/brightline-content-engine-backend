/**
 * A card may display a source passage only when that passage has been sliced
 * from the named source (B325). The model's pointer is never shown.
 */

import { recoverExcerptFromSource } from "./excerpt-from-source.mjs";

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function sourceTextForLabel(sources, sourceLabel) {
  const label = trimmed(sourceLabel);
  const list = Array.isArray(sources) ? sources : [];
  if (!label) return "";
  const hit = list.find((row) => {
    const rowLabel = trimmed(row?.label) || trimmed(row?.name) || trimmed(row?.title);
    return rowLabel === label;
  });
  return typeof hit?.text === "string" ? hit.text : "";
}

export function excerptHasLocatablePosition({ passage, supportSpans } = {}) {
  const text = trimmed(passage);
  if (!text) return false;
  const spans = Array.isArray(supportSpans) ? supportSpans : [];
  for (const span of spans) {
    const sp = trimmed(span?.passage);
    if (!sp) continue;
    if (sp.includes(text) || text.includes(sp)) return true;
  }
  return false;
}

export function sourceTextAt(sources, sourceIndex) {
  const list = Array.isArray(sources) ? sources : [];
  const idx = Number(sourceIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) return "";
  const row = list[idx];
  return typeof row?.text === "string" ? row.text : "";
}

/**
 * Displayed span text is always a source slice. Offsets win when they land
 * inside the source. Otherwise recover from the stored pointer.
 */
export function rewriteSpanFromSource(span, sources) {
  if (!span || typeof span !== "object") return span;
  const src = sourceTextAt(sources, span.sourceRefId);
  const start = Number(span.start);
  const end = Number(span.end);
  if (src && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= src.length) {
    return { ...span, passage: src.slice(start, end), start, end };
  }
  const recovered = recoverExcerptFromSource({ pointer: span.passage, sourceText: src });
  if (recovered?.miss || !recovered?.passage) {
    return { ...span, passage: "", start: null, end: null };
  }
  return { ...span, passage: recovered.passage, start: recovered.start, end: recovered.end };
}

/**
 * @returns {{ passage: string, sourceLabel: string, start?: number, end?: number } | null}
 */
export function gateExcerpt({ passage, sourceLabel, sources, supportSpans } = {}) {
  const text = trimmed(passage);
  const label = trimmed(sourceLabel);
  if (!text || !label) return null;
  void supportSpans;
  const srcText = sourceTextForLabel(sources, label);
  const recovered = recoverExcerptFromSource({ pointer: text, sourceText: srcText });
  if (recovered?.miss || !recovered?.passage) return null;
  return {
    passage: recovered.passage,
    sourceLabel: label,
    start: recovered.start,
    end: recovered.end,
  };
}

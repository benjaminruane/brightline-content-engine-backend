/**
 * A card may display a source passage only when that passage has a locatable
 * position (a supportSpan). A substring that lives in a named source but has
 * no span is how an unrelated document lands on a card (B259).
 */

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

/**
 * @returns {{ passage: string, sourceLabel: string } | null}
 */
export function gateExcerpt({ passage, sourceLabel, sources, supportSpans } = {}) {
  const text = trimmed(passage);
  const label = trimmed(sourceLabel);
  if (!text || !label) return null;
  if (!excerptHasLocatablePosition({ passage: text, supportSpans })) return null;
  const srcText = sourceTextForLabel(sources, label);
  if (srcText && !srcText.includes(text)) return null;
  return { passage: text, sourceLabel: label };
}

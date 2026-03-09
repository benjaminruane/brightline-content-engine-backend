// lib/qc/citation-authority.mjs
// A6.1: Single citation authority — qcCard supportRefIds/supportRefTitles MUST come exclusively from supportBindings.

/**
 * Derive QC card reference ids and titles from support bindings only.
 * No other citation derivation paths allowed for qcCard.
 *
 * @param {Array<{ refId?: string|number }>} supportBindings - Support bindings (each may have refId)
 * @param {Map<string, { title?: string }>|Array<{ id?: string, title?: string }>} sources - Source index: id -> { title } or array of { id, title }
 * @returns {{ supportRefIds: string[], supportRefTitles: string[] }}
 */
export function deriveQcCardReferences(supportBindings, sources) {
  const supportRefIds = [];
  const seen = new Set();
  if (Array.isArray(supportBindings)) {
    for (const b of supportBindings) {
      const id = b?.refId != null ? String(b.refId).trim() : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      supportRefIds.push(id);
    }
  }

  const getTitle = (id) => {
    if (sources instanceof Map) {
      const ref = sources.get(id);
      if (ref && typeof ref.title === "string" && ref.title.trim()) return ref.title.trim();
      return null;
    }
    if (Array.isArray(sources)) {
      const ref = sources.find((r) => r && (String(r.id) === id || String(r.id) === String(id)));
      if (ref && typeof ref.title === "string" && ref.title.trim()) return ref.title.trim();
      return null;
    }
    return null;
  };

  const supportRefTitles = supportRefIds.map((id) => {
    const title = getTitle(id);
    if (title) return title;
    const binding = Array.isArray(supportBindings) ? supportBindings.find((b) => String(b?.refId) === id) : null;
    if (binding?.title && String(binding.title).trim()) return String(binding.title).trim();
    return `source [${id}]`;
  });

  return { supportRefIds, supportRefTitles };
}

/**
 * B603 F62. Growth figures must name their period. House-style note only.
 */

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// No trailing \b after %: "%" and a following space are both non-word, so \b never matches.
const GROWTH = /\b(\d[\d,]*(?:\.\d+)?)\s*%(?!\d)|\b(\d[\d,]*(?:\.\d+)?)\s*(?:x|times)\b/gi;
const PERIOD = /\b(?:in|over|for|during|across|through|to|ended|ending|as of|as at|yoy|year[- ]on[- ]year|qoq|mom|ttm|ltm|cagr)\b|\b(?:12|6|3)\s*months?\b|\b(?:Q[1-4]|FY|H[12])\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b|\b(?:19|20)\d{2}\b/i;
const GROWTH_CUE = /\b(?:grew|growth|increased|increase|rose|up|gained|expanded|declined|fell|down|contracted|revenue|sales|arr|gmv|ebitda|profit|earnings)\b/i;

/**
 * @returns {Array<{ id: string, message: string, surface: string }>}
 */
export function findGrowthPeriodNotes(statement) {
  const text = clean(statement);
  if (!text || !GROWTH_CUE.test(text)) return [];
  const out = [];
  let m;
  const re = new RegExp(GROWTH.source, "gi");
  while ((m = re.exec(text))) {
    const surface = m[0];
    const window = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.index + surface.length + 60));
    if (PERIOD.test(window)) continue;
    // Bare "2x" without growth cue nearby is not a growth figure claim.
    if (/x$|times$/i.test(surface) && !GROWTH_CUE.test(window)) continue;
    out.push({
      id: `growth_period_${m.index}`,
      surface,
      message: `Name the period for this growth figure (${surface}), for example "in the 12 months to October 2010".`,
    });
  }
  return out;
}

export function applyGrowthPeriodNotesToCard(card, { enabled = true } = {}) {
  if (!enabled) return card;
  const statement = clean(card?.statement || card?.text || "");
  const found = findGrowthPeriodNotes(statement);
  if (!found.length) return card;
  const existing = Array.isArray(card.houseStyleConcerns) ? card.houseStyleConcerns : [];
  const ids = new Set(existing.map((row) => row?.id || row?.message));
  const added = [];
  for (const note of found) {
    if (ids.has(note.id) || ids.has(note.message)) continue;
    added.push({
      id: note.id,
      ruleId: "growth_period",
      kind: "house_growth_period",
      message: note.message,
      surface: note.surface,
      severity: "note",
    });
  }
  if (!added.length) return card;
  return {
    ...card,
    houseStyleConcerns: [...existing, ...added],
  };
}

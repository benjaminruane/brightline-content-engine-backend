/**
 * B364. Read the source's own name from its opening, then resolve a
 * first-person subject in a supporting passage to that party.
 * Never applied to the draft. Stand down when the opening is ambiguous.
 */

function asText(value) {
  return typeof value === "string" ? value : "";
}

function sourceText(source) {
  if (typeof source === "string") return source;
  if (source && typeof source.text === "string") return source.text;
  return "";
}

function normalizeSelfName(name) {
  return asText(name).replace(/\s+/g, " ").trim().toLowerCase();
}

// AUTHOR-NAME-BLIND: this regex reads the name the source document uses of
// itself in its opening (Name announces / reports). The authoring
// organisation is the party being identified. Excluding it would leave
// first-person source subjects unresolved.
const SELF_NAME_RE =
  /((?:\d+[A-Za-z][A-Za-z0-9]*|[A-Z][A-Za-z0-9.&'-]+)(?:\s+(?:plc|PLC|Ltd|Limited|Inc|AG|SA|NV|LLP|llp|Group|Holdings|Partners|[A-Z][A-Za-z0-9.&'-]+)){0,5})\s+(?:announces|announced|reports|reported)\b/g;

const OPENING_CHARS = 1500;

/**
 * The name the source uses of itself in its opening, or null.
 * One hit required. Several different names stand down.
 */
export function readSourceSelfName(text) {
  const raw = asText(text);
  if (!raw.trim()) return null;
  const bullet = raw.indexOf("\u2022");
  const cut = bullet >= 0 && bullet < OPENING_CHARS + 200 ? bullet : OPENING_CHARS;
  const window = raw.slice(0, Math.max(cut, 0));
  const found = [];
  const seen = new Set();
  const re = new RegExp(SELF_NAME_RE.source, "g");
  let m;
  while ((m = re.exec(window))) {
    const name = asText(m[1]).replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = normalizeSelfName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(name);
  }
  if (found.length !== 1) return null;
  return found[0];
}

/**
 * One self-name shared by every source that identifies itself, or null.
 * A source with no opening hit is ignored. Two different hits stand down.
 */
export function sourceSelfNameFromSources(sources) {
  const hits = [];
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    const name = readSourceSelfName(sourceText(source));
    if (!name) continue;
    const key = normalizeSelfName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(name);
  }
  if (hits.length !== 1) return null;
  return hits[0];
}

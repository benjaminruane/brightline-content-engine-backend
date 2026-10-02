/**
 * B366. A country or region is not a party. Currency codes are not parties.
 * A geography token followed by an organisation word is a party.
 * Bounded lists. Exact match after lowercasing.
 */

function asText(value) {
  return typeof value === "string" ? value : "";
}

export function normalizePartyKey(value) {
  return asText(value)
    .replace(/['’]s$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const GEOGRAPHY_SINGLETONS = new Set(
  [
    "uk",
    "us",
    "usa",
    "eu",
    "eea",
    "emea",
    "apac",
    "latam",
    "europe",
    "asia",
    "africa",
    "america",
    "americas",
    "china",
    "india",
    "japan",
    "france",
    "germany",
    "italy",
    "spain",
    "canada",
    "australia",
    "britain",
    "england",
    "scotland",
    "ireland",
    "wales",
    "switzerland",
    "singapore",
    "nordics",
    "nordic",
  ].map((w) => w.toLowerCase())
);

export const GEOGRAPHY_MULTI = [
  "united kingdom",
  "united states",
  "hong kong",
  "new york",
  "european union",
  "middle east",
  "latin america",
  "north america",
  "south america",
  "asia pacific",
].map((w) => w.toLowerCase());

export const CURRENCY_CODES = new Set(
  [
    "gbp",
    "eur",
    "usd",
    "jpy",
    "chf",
    "aud",
    "cad",
    "nzd",
    "sek",
    "nok",
    "dkk",
    "cny",
    "hkd",
    "sgd",
    "inr",
    "krw",
    "mxn",
    "brl",
    "zar",
    "pln",
    "aed",
    "sar",
    "try",
  ].map((w) => w.toLowerCase())
);

export const ORGANISATION_WORDS = new Set(
  [
    "government",
    "govt",
    "group",
    "plc",
    "ltd",
    "limited",
    "inc",
    "incorporated",
    "corp",
    "corporation",
    "company",
    "bank",
    "fund",
    "partners",
    "holdings",
    "holding",
    "authority",
    "ministry",
    "commission",
    "department",
    "office",
    "agency",
    "council",
    "parliament",
    "treasury",
    "administration",
    "board",
    "committee",
    "llp",
    "nv",
    "sa",
    "ag",
  ].map((w) => w.toLowerCase())
);

export const LEADING_ARTICLES = new Set(["the", "a", "an"]);

export function isCurrencyCode(name) {
  return CURRENCY_CODES.has(normalizePartyKey(name));
}

export function isOrganisationWord(word) {
  return ORGANISATION_WORDS.has(normalizePartyKey(word));
}

export function isGeographyName(name) {
  const key = normalizePartyKey(name);
  if (!key) return false;
  if (GEOGRAPHY_SINGLETONS.has(key)) return true;
  return GEOGRAPHY_MULTI.includes(key);
}

export function isBareNonParty(name) {
  return isGeographyName(name) || isCurrencyCode(name);
}

/**
 * If tokens at start form a geography followed by one or more organisation
 * words, return { length, key }. Otherwise null.
 */
export function geographyPartyAt(tokens, start) {
  const list = Array.isArray(tokens) ? tokens : [];
  if (start < 0 || start >= list.length) return null;
  const words = list.map((t) => normalizePartyKey(typeof t === "string" ? t : t?.word || t?.raw || ""));
  let geoLen = 0;
  let geoKey = "";
  const multi = [...GEOGRAPHY_MULTI].sort((a, b) => b.split(" ").length - a.split(" ").length);
  for (const phrase of multi) {
    const parts = phrase.split(" ");
    if (start + parts.length > words.length) continue;
    if (words.slice(start, start + parts.length).join(" ") === phrase) {
      geoLen = parts.length;
      geoKey = phrase;
      break;
    }
  }
  if (!geoLen && GEOGRAPHY_SINGLETONS.has(words[start])) {
    geoLen = 1;
    geoKey = words[start];
  }
  if (!geoLen) return null;
  let orgLen = 0;
  while (start + geoLen + orgLen < words.length && isOrganisationWord(words[start + geoLen + orgLen])) {
    orgLen += 1;
  }
  if (orgLen === 0) return null;
  const orgKey = words.slice(start + geoLen, start + geoLen + orgLen).join(" ");
  return {
    length: geoLen + orgLen,
    key: `${geoKey} ${orgKey}`.trim(),
  };
}

/**
 * Organisation words immediately after `name` in `afterName`.
 * Returns the raw suffix including the leading space, or "".
 */
export function organisationSuffixRaw(afterName) {
  const rest = asText(afterName);
  if (!rest) return "";
  const re = /\s+([A-Za-z]+)/g;
  let taken = "";
  let m;
  while ((m = re.exec(rest))) {
    if (m.index !== taken.length) break;
    if (!isOrganisationWord(m[1])) break;
    taken += m[0];
  }
  return taken;
}

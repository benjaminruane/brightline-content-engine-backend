/**
 * B364. A correction follows house style before it is offered.
 * Applies only to the offered replacement token, never to the source quote.
 * Digits and scale words are preserved. Glyph currencies become ISO codes.
 */

const MONTHS_FULL = {
  jan: "January",
  january: "January",
  feb: "February",
  february: "February",
  mar: "March",
  march: "March",
  apr: "April",
  april: "April",
  may: "May",
  jun: "June",
  june: "June",
  jul: "July",
  july: "July",
  aug: "August",
  august: "August",
  sep: "September",
  sept: "September",
  september: "September",
  oct: "October",
  october: "October",
  nov: "November",
  november: "November",
  dec: "December",
  december: "December",
};

function asText(value) {
  return typeof value === "string" ? value : "";
}

function expandMonth(word) {
  return MONTHS_FULL[String(word || "").toLowerCase()] || word;
}

/**
 * House-style form of an offered replacement. Idempotent on ISO currency
 * and on dates already in DD FullMonth YYYY.
 *
 * Applied: unambiguous currency glyphs to ISO (GBP, EUR, USD from US$);
 * percent-word to %; US, abbreviated, or ISO dates to DD FullMonth YYYY;
 * curly quotes to straight; em/en dash to hyphen.
 * Not applied: thousand_separator (would change 3,291 to 3'291 against
 * the source digits the card must keep); number_spelling; english_variant;
 * oxford_comma; defined_term; first_person; register; bare $ and yen glyph
 * (not a unique ISO code); slash dates (MDY and DMY collide).
 */
export function houseStyleOfferedToken(raw) {
  let t = asText(raw).trim();
  if (!t) return t;

  t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/[\u2014\u2013]/g, "-");

  if (/^£\s*/.test(t)) t = t.replace(/^£\s*/, "GBP ");
  else if (/^€\s*/.test(t)) t = t.replace(/^€\s*/, "EUR ");
  else if (/^US\s*\$\s*/i.test(t)) t = t.replace(/^US\s*\$\s*/i, "USD ");

  t = t.replace(/\s*(?:percent|per\s+cent)\b/i, "%");

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = monthNames[Number(iso[2]) - 1];
    const day = Number(iso[3]);
    if (month && day >= 1 && day <= 31) {
      t = `${day} ${month} ${iso[1]}`;
    }
  } else {
    const us = t.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/i
    );
    if (us) {
      t = `${us[2]} ${expandMonth(us[1])} ${us[3]}`;
    } else {
      const abbrev = t.match(
        /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})$/i
      );
      if (abbrev) t = `${abbrev[1]} ${expandMonth(abbrev[2])} ${abbrev[3]}`;
    }
  }

  return t.replace(/\s+/g, " ").trim();
}

export function offeredTokenLicensedByExcerptTokens(offeredRaw, excerptTokenRaws) {
  const offered = asText(offeredRaw);
  if (!offered) return false;
  const list = Array.isArray(excerptTokenRaws) ? excerptTokenRaws : [];
  for (const raw of list) {
    const t = asText(raw);
    if (t === offered) return true;
    if (houseStyleOfferedToken(t) === offered) return true;
  }
  return false;
}

/**
 * B540. A draft is brought into the house style the review scans,
 * before the review sees it.
 */
import { houseVoiceIsThirdPerson, houseVoiceSlug } from "../prompt-library/house-voice.mjs";
import { normalizePgHouseStyleCharacters } from "../prompt-library/house-characters.mjs";
import { applyNumberSpelling } from "./number-spelling.mjs";
import { applyListCommas } from "./list-comma-scan.mjs";
import { replaceFirstPerson } from "./first-person-replace.mjs";
import { quotationRanges } from "./mechanics-scan.mjs";
import { applyAccountSpelling } from "./account-spelling.mjs";

function applyPercentSign(text) {
  const ranges = quotationRanges(text);
  return text.replace(/(\d[\d.,]*)\s+per\s?cent\b/gi, (full, number, offset) => {
    const end = offset + full.length;
    if (ranges.some(([from, to]) => offset >= from && end <= to)) return full;
    return `${number}%`;
  });
}

export function applyDraftHouseStyle(text, options = {}) {
  if (typeof text !== "string") return text;
  let out = applyListCommas(applyPercentSign(applyNumberSpelling(normalizePgHouseStyleCharacters(text), options)));
  const spelling = options.houseStyle?.spelling;
  if (spelling === "US" || spelling === "UK") out = applyAccountSpelling(out, spelling);
  const name = typeof options.authoringOrganisation === "string" ? options.authoringOrganisation.trim() : "";
  const outputType = options.outputType;
  if (name && outputType && houseVoiceSlug(outputType) && houseVoiceIsThirdPerson(outputType)) {
    out = replaceFirstPerson(out, name).text;
  }
  return out;
}

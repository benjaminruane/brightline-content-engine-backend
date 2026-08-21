import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { splitDraftIntoCandidatesV2 } from "../lib/extract-statements.mjs";

const EM = "\u2014";
const EN = "\u2013";

describe("splitDraftIntoCandidatesV2", () => {
  test("EUR 1.3 million does not split at the decimal point", () => {
    const { candidates } = splitDraftIntoCandidatesV2("The ticket was EUR 1.3 million.");
    assert.equal(candidates.length, 1);
    assert.match(candidates[0], /EUR 1\.3 million/);
  });

  test("em-dash parenthetical is not a sentence boundary", () => {
    const sentence =
      `The exit of NorTech Industries ${EM} which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR ${EM} is the largest realisation in the Fund's history and the principal driver of the Fund's current returns trajectory.`;
    assert.ok(sentence.length > 240);
    const { candidates } = splitDraftIntoCandidatesV2(sentence);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0], sentence);
    assert.equal(candidates[0].includes("which closed in January 2026"), true);
    assert.equal(candidates[0].startsWith("which "), false);
  });

  test("en-dash and spaced hyphen are not sentence boundaries", () => {
    const en =
      `The category ${EN} software that helps clinicians make better, faster, more consistent treatment decisions at the point of care ${EN} is at a structural inflection point driven by three forces that have been building for several years across European health systems and adjacent care settings.`;
    const hyphen =
      "The category - software that helps clinicians make better, faster, more consistent treatment decisions at the point of care - is at a structural inflection point driven by three forces that have been building for several years across European health systems and adjacent care settings.";
    assert.ok(en.length > 240);
    assert.ok(hyphen.length > 240);
    assert.equal(splitDraftIntoCandidatesV2(en).candidates.length, 1);
    assert.equal(splitDraftIntoCandidatesV2(hyphen).candidates.length, 1);
  });

  test("full stops still split sentences", () => {
    const { candidates } = splitDraftIntoCandidatesV2(
      "Meridian European Industrials Fund IV continues to perform strongly. As of 31 December 2025, the Fund's net IRR stands at 19.7 percent."
    );
    assert.equal(candidates.length, 2);
  });

  test("question marks and exclamation marks still split", () => {
    const { candidates } = splitDraftIntoCandidatesV2(
      "What happens next? We proceed. This is material!"
    );
    assert.equal(candidates.length, 3);
  });

  test("overlong semicolon lists can still split", () => {
    const text =
      "Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges. Helvetia Precision Components, acquired in June 2025, is six months into the hold and tracking modestly ahead of underwriting; the recently-acquired Lumen Specialty Chemicals is on track with its 100-day plan; Brightway Industrial Coatings has had a strong 2025 with revenue and EBITDA growing 14 percent and 21 percent respectively.";
    const { candidates } = splitDraftIntoCandidatesV2(text);
    assert.ok(candidates.some((c) => /recently-acquired Lumen/.test(c)));
    assert.ok(candidates.length >= 2);
  });
});

/**
 * B580. The passage is what Review relied on, then the figure lines.
 * Reasons stay grammatical. An unstated point shows the closest sentence.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardReason } from "../lib/qc/card-reason.mjs";
import { alsoRelevant, factPassage } from "../lib/qc/fact-passages.mjs";
import { passageForCard } from "../lib/qc/passage-trim.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const patria = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b580/patria-clean-after-b579.json"), "utf8"));
const gem = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b580/gemspring-dirty-after-b579.json"), "utf8"));
const card = (pack, index) => pack.statements[index].qcCard;

test("gemspring passages are the sentences Review relied on", () => {
  const s1 = factPassage(card(gem, 0)).passage;
  assert.match(s1, /The speed of the raise stands out/);
  assert.equal(s1.includes("..."), false);

  const s2 = factPassage(card(gem, 1)).passage;
  assert.match(s2, /has closed Gemspring Capital Fund IV at \$3\.5 billion\./);
  assert.match(s2, /well above its \$3 billion target/);
  assert.equal(s2.includes("... ..."), false);
  assert.equal(s2.includes("..."), false);

  const s5 = factPassage(card(gem, 4)).passage;
  assert.match(s5, /largest single investor/);
  assert.doesNotMatch(s5, /Westport, Connecticut-based middle-market private equit/);
});

test("patria-clean figure passages stay, without bullet marks", () => {
  const s2 = factPassage(card(patria, 1));
  assert.match(s2.passage, /862\.5p/);
  assert.match(s2.passage, /2\.7%/);
  assert.deepEqual(s2.lineIds, ["L77", "L78"]);

  const s3 = factPassage(card(patria, 2));
  assert.match(s3.passage, /10 new investments and commitments totalling £175\.9 million/);
  assert.match(s3.passage, /Five new primary fund commitments/);
  assert.match(s3.passage, /One secondary investment/);
  assert.match(s3.passage, /Three new direct investments/);
  assert.equal(s3.passage.includes("·"), false);
  assert.equal(s3.passage.includes("•"), false);

  const s4 = factPassage(card(patria, 3));
  assert.match(s4.passage, /£125\.6 million/);
  assert.match(s4.passage, /£95\.6 million/);
  assert.deepEqual(s4.lineIds, ["L22"]);

  const s5 = factPassage(card(patria, 4));
  assert.match(s5.passage, /£824\.9 million/);
  assert.match(s5.passage, /39\.4%/);
  assert.match(s5.passage, /£276\.7 million/);
  assert.match(s5.passage, /9\.7%/);
  assert.deepEqual(s5.lineIds, ["L27", "L28", "L29", "L71"]);
});

test("the two mechanical reasons read as sentences", () => {
  const s2 = cardReason(card(patria, 1));
  const s5 = cardReason(card(patria, 4));
  for (const reason of [s2, s5]) {
    assert.match(reason, /^The source states/);
    assert.match(reason, /\.$/);
    assert.doesNotMatch(reason, /confirms/i);
    assert.doesNotMatch(reason, /return's figures/);
  }
  assert.match(s2, /matching the statement/);
  assert.match(s5, /as stated/);
  assert.match(s2, /862\.5p/);
  assert.match(s2, /2\.7%/);
  assert.match(s5, /outstanding commitments/);
  assert.match(s5, /net gearing/);
});

test("an unstated point shows the closest source sentence", () => {
  const source = patria.sources[0].text;
  const s4 = card(patria, 3);
  const also = alsoRelevant(s4, source);
  assert.match(also, /slowed the pace of the M&A/);
  const shown = passageForCard(s4, source);
  assert.equal(shown.also, also);
  assert.equal(shown.alsoHeading, "Also relevant");
  assert.doesNotMatch(shown.passage, /pace of the M&A/);
});

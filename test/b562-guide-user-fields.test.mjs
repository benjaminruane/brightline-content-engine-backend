/**
 * B562. Reader copy sits beside the model text. The model text is unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { STYLE_GUIDE } from "../lib/style-guide/guide.mjs";
import { WRITING_PRINCIPLES } from "../lib/style-guide/principles.mjs";
import { PRINCIPLE_READER, READER_COPY } from "../lib/style-guide/reader-copy.mjs";
import { renderDraftStyleSection, renderHouseStylePage, renderPrinciples } from "../lib/style-guide/render.mjs";

const WITH_EXAMPLE = [
  "em_dash",
  "percentage_notation",
  "country_abbreviation",
  "oxford_comma",
  "currency_format",
  "period_placement",
  "derived_figure",
  "year_range",
  "names",
  "job_titles",
  "defined_term_capitalisation",
  "year_on_year",
  "general_partner",
  "returns_form",
  "deal_word",
  "active_voice_preference",
  "hyperbole_vs_qualitative",
  "sentence_structure_clarity",
  "jargon",
];

test("every entry and principle has a summary, and the model text is unchanged", () => {
  const rules = JSON.parse(readFileSync(new URL("./fixtures/b562/rules.json", import.meta.url), "utf8"));
  const principleText = JSON.parse(readFileSync(new URL("./fixtures/b562/principle-text.json", import.meta.url), "utf8"));
  assert.equal(renderDraftStyleSection(null), readFileSync(new URL("./fixtures/b562/draft-style.txt", import.meta.url), "utf8"));
  assert.equal(renderPrinciples({}), readFileSync(new URL("./fixtures/b562/principles.txt", import.meta.url), "utf8"));
  assert.equal(rules.length, STYLE_GUIDE.length);
  for (const row of rules) {
    const entry = STYLE_GUIDE.find((item) => item.id === row.id);
    assert.equal(entry.rule, row.rule);
    const copy = READER_COPY[row.id];
    assert.ok(copy, row.id);
    if (copy.byChoice) {
      for (const option of entry.choice.options) {
        const variant = copy.byChoice[option.id];
        assert.equal(typeof variant.summary, "string");
        assert.ok(variant.summary.trim(), `${row.id} ${option.id}`);
      }
    } else {
      assert.ok(copy.summary.trim(), row.id);
    }
  }
  for (const id of WITH_EXAMPLE) {
    assert.ok(READER_COPY[id].example.length > 0, id);
  }
  assert.equal(principleText.length, WRITING_PRINCIPLES.length);
  for (const row of principleText) {
    const principle = WRITING_PRINCIPLES.find((item) => item.id === row.id);
    assert.equal(principle.text, row.text);
    assert.equal(principle.example, row.example);
    assert.ok(PRINCIPLE_READER[row.id].summary.trim(), row.id);
  }
  const readerBlob = JSON.stringify(READER_COPY) + JSON.stringify(PRINCIPLE_READER);
  assert.equal(readerBlob.includes("\u2014"), false);
  assert.equal(readerBlob.includes("\u2013"), false);
});

test("the page payload uses the choice variant and leaves the model sentences out", () => {
  const uk = renderHouseStylePage({ spelling: "UK", quotes: "double", magnitude: "millions" });
  const spelling = uk.groups.flatMap((group) => group.rules).find((rule) => rule.id === "english_variant");
  assert.equal(spelling.summary, "Use UK spelling.");
  assert.match(spelling.example.join(" "), /organise the programme/);
  const quotes = uk.groups.flatMap((group) => group.rules).find((rule) => rule.id === "smart_quotes");
  assert.equal(quotes.summary, "Use double quotation marks.");
  const amounts = uk.settingsChoices.find((row) => row.id === "magnitude");
  assert.deepEqual(amounts.options.map((option) => option.label), [
    "Show 1,000 million and above in billions",
    "Always show in millions",
  ]);
  assert.equal(amounts.example, "GBP 5,049 million stays as it is.");
  const ids = uk.groups.flatMap((group) => group.rules.map((rule) => rule.id));
  assert.equal(ids.includes("voice"), false);
  assert.equal(ids.includes("banned_words"), false);
  const shown = JSON.stringify({ groups: uk.groups, principles: uk.principles });
  assert.equal(shown.includes("Do not flag"), false);
  assert.equal(shown.includes("Flag any other form"), false);
  assert.equal(shown.includes("A DELETE direction"), false);
  assert.equal(uk.principles.every((row) => row.summary && row.title), true);
});

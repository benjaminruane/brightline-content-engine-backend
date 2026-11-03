/**
 * B468. The header speaks the sentence label. The verdict field is not counted.
 * src/modules/reading/attentionHeader.js is the header.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { shownLabel, shownState } from "../lib/qc/shown-verdict.mjs";
import { attentionHeader } from "../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function pad(id) {
  return String(id).padStart(2, "0");
}

function groups() {
  const out = new Map();
  for (const card of pass.cards) {
    const id = pad(card.fixtureId);
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(card);
  }
  return out;
}

function headerOf(rows) {
  return attentionHeader(rows.map((card) => ({
    sentenceState: shownState(card),
    sentenceLabel: shownLabel(card),
    displayVerdict: card.displayVerdict,
    facts: card.readingFacts || [],
  })));
}

function countIn(line, pattern) {
  const match = String(line || "").match(pattern);
  return match ? Number(match[1]) : 0;
}

describe("B468 header agrees", () => {
  test("draft 19 counts the label the reader sees", () => {
    const rows = groups().get("19");
    assert.equal(rows.length, 14);
    assert.equal(
      headerOf(rows),
      "1 statement conflicts with the source. 1 fact is not in the source, across 1 of your 14 statements. 1 worth a glance",
    );
    const stored = rows.map((card) => card.sentenceLabel);
    assert.equal(stored.filter((label) => label === "Conflicts with the source").length, 0);
    assert.equal(stored.filter((label) => label === "Not in the source").length, 2);
    const shown = rows.map((card) => shownLabel(card));
    assert.equal(shown.filter((label) => label === "Conflicts with the source").length, 1);
    assert.equal(shown.filter((label) => label === "Goes beyond the source").length, 1);
  });

  test("draft 02 still leads with the look", () => {
    const rows = groups().get("02");
    assert.equal(rows.length, 9);
    assert.equal(headerOf(rows), "1 statement needs a look. 1 worth a glance");
  });

  test("every header term is a label count", () => {
    let mismatches = 0;
    for (const [id, rows] of groups()) {
      const line = headerOf(rows);
      const labels = rows.map((card) => shownLabel(card));
      const conflicts = labels.filter((label) => label === "Conflicts with the source").length;
      const looks = labels.filter((label) => label === "Needs a look").length;
      const light = labels.filter((label) => label === "Goes beyond the source" || label === "Partly in the source").length;
      const notInSource = rows.filter((card) => shownLabel(card) === "Not in the source");
      let facts = 0;
      let across = 0;
      for (const card of notInSource) {
        const missing = (card.readingFacts || []).filter((fact) => fact?.status === "not_found").length;
        facts += missing;
        if (missing > 0) across += 1;
      }
      if (countIn(line, /(\d+) statements? conflict/) !== conflicts) mismatches += 1;
      if (countIn(line, /(\d+) statements? needs? a look/) !== looks) mismatches += 1;
      if (countIn(line, /(\d+) worth a glance/) !== light) mismatches += 1;
      if (line.includes("not in the source") && notInSource.length === 0) mismatches += 1;
      if (countIn(line, /(\d+) facts? (?:is|are) not in the source/) !== facts) mismatches += 1;
      if (line.includes("across") && countIn(line, /across (\d+) of your/) !== across) mismatches += 1;
      assert.equal(line.includes("conflict") ? conflicts > 0 : true, true, id);
    }
    assert.equal(mismatches, 0);
  });
});

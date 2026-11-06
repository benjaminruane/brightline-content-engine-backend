/**
 * B479. A sentence has told the reader about a revision when it carries both
 * figures from the revision note. The word lists are gone.
 * lib/qc/reader-reason.mjs is the sentence. The screen copy is src/modules/drafting/readerReason.js.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { readerEvidenceSentence, sourceRecencyForReader } from "../lib/qc/reader-reason.mjs";

const note = "The later source May diligence pack dated 28 May 2025 gives 167 people. The earlier source April memo dated 15 April 2025 gives 142 people.";
const kept = "The April memo gave 142 employees. The May diligence pack puts the figure at 167 people.";
const misfire = "The source says the updated guidance was revised in March, which the statement reflects.";
const oneFigure = "The April memo gave 142 employees.";
const concern = { note: "Check the source date." };

function raised(prose) {
  return {
    statement: "Headcount is 142.",
    sentenceState: "conflicts",
    statementVerdict: { state: "conflicts" },
    displayVerdict: "conflict",
    displayedEvidenceProse: prose,
    supersededSourceNotes: [note],
  };
}

describe("B479 revision by figures", () => {
  test("a sentence that carries both figures is kept", () => {
    assert.equal(readerEvidenceSentence(raised(kept)), kept);
  });

  test("a sentence that names no figures does not count as a revision", () => {
    assert.equal(readerEvidenceSentence(raised(misfire)), note);
  });

  test("a sentence that carries one figure only does not count", () => {
    assert.equal(readerEvidenceSentence(raised(oneFigure)), note);
  });

  test("the stale-source note follows the same two figures", () => {
    assert.deepEqual(sourceRecencyForReader([concern], kept, note), []);
    assert.deepEqual(sourceRecencyForReader([concern], misfire, note), [concern]);
    assert.deepEqual(sourceRecencyForReader([concern], oneFigure, note), [concern]);
  });

  test("recency uses the reason text in hand", () => {
    const assembly = readFileSync(new URL("../lib/qc/assemble-card.mjs", import.meta.url), "utf8");
    assert.equal(assembly.includes("readerEvidenceSentence"), false);
    assert.match(assembly, /sourceRecencyForReader\(/);
  });
});

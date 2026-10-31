import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { elementFound, extractElements } from "../lib/qc/b394-elements.mjs";
import { evidenceLine } from "../lib/qc/evidence-line.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";

function found(statement, source, surface) {
  const elements = extractElements(statement, statement, source);
  const element = elements.find((row) => row.surface === surface);
  assert.ok(element, `no element ${surface}`);
  return elementFound(element, source);
}

describe("B457 form equivalence", () => {
  test("an apostrophe thousands separator matches the comma form", () => {
    const statement = "Customers increased from 5'500 to 10'000.";
    const source = "Customers increased from 5,500 to 10,000.";
    assert.equal(found(statement, source, "5'500"), true);
    assert.equal(found(statement, source, "10'000"), true);
  });

  test("a spelled number matches the numeral, and percent matches the symbol", () => {
    const statement = "The firm made fifteen investments and kept 19 percent.";
    const source = "The firm made 15 investments and kept 19%.";
    assert.equal(found(statement, source, "fifteen"), true);
    assert.equal(found(statement, source, "19 percent"), true);
  });

  test("an ISO amount matches the symbol, including mm for million", () => {
    const statement = "It raised USD 10 million and USD 164'000.";
    const source = "It raised $10mm and $164K.";
    assert.equal(found(statement, source, "USD 10 million"), true);
    assert.equal(found(statement, source, "USD 164'000"), true);
  });

  test("an honorific and a damaged character still find the surname", () => {
    const statement = "The team is led by Mr. Lütke and Mr. Tom Fairfield.";
    const source = "Tobi L\uFFFDtke stayed. Tom Fairfield is CEO.";
    assert.equal(found(statement, source, "Mr. Lütke"), true);
    assert.equal(found(statement, source, "Mr. Tom Fairfield"), true);
  });

  test("a figure that is not the source figure stays missing", () => {
    const statement = "Growth was more than 150%.";
    const source = "Growth was +151% Y/Y.";
    assert.equal(found(statement, source, "150%"), false);
  });

  test("a wording note does not leave the headline saying the figure is absent", () => {
    const facts = [{ status: "not_found", surface: "150%", kind: "figure" }];
    const wording = statementVerdict({
      facts,
      note: { bucket: "wording", text: "The source states +151% Y/Y. The statement says more than 150%, which is the same claim phrased differently." },
      entries: [],
    });
    assert.equal(wording.state, "nothing_raised");
    const quiet = statementVerdict({
      facts,
      note: { bucket: "none", text: "" },
      entries: [],
    });
    assert.equal(quiet.state, "not_in_source");
  });
});

describe("B457 evidence line", () => {
  test("a note is the line", () => {
    const note = "The source states customers increased from 5,500. The statement uses a different separator.";
    assert.equal(evidenceLine({ fileName: "memo.txt", quote: "from 5,500", noteText: note }), note);
  });

  test("nothing to report names the file and quotes the passage", () => {
    const line = evidenceLine({ fileName: "shopify-memo", quote: "customers have increased from 5,500" });
    assert.equal(line, 'shopify-memo states "customers have increased from 5,500".');
    assert.equal(/support/i.test(line), false);
  });

  test("a discarded note is not explained", () => {
    const line = evidenceLine({
      fileName: "note.txt",
      quote: "Urban last-mile logistics is supported.",
      noteText: "A note was written for this sentence and could not be shown.",
    });
    assert.equal(line, 'note states "Urban last-mile logistics is supported.".');
    assert.equal(/could not be shown/.test(line), false);
  });

  test("the span prompt is gone", () => {
    assert.throws(() => readFileSync(new URL("../lib/qc/pipeline-v4/prompts/source-difference.md", import.meta.url)));
    const account = readFileSync(new URL("../lib/qc/source-account.mjs", import.meta.url), "utf8");
    assert.equal(account.includes("callLLM"), false);
    const config = readFileSync(new URL("../lib/qc/model-config.mjs", import.meta.url), "utf8");
    assert.equal(config.includes("source-difference"), false);
  });
});

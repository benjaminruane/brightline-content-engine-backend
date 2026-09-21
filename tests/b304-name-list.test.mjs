/**
 * B304. One joiner for every list of check names.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  CHECK_LIST_ORDER,
  cleanLineFromNames,
  joinCheckNames,
  turnedOffLineFromClass,
  turnedOffLineFromNames,
} from "../lib/qc/review-summary.mjs";

describe("B304 check name list", () => {
  test("joiner: one, two, three and four names", () => {
    assert.equal(joinCheckNames(["A"]), "A");
    assert.equal(joinCheckNames(["A", "B"]), "A and B");
    assert.equal(joinCheckNames(["A", "B", "C"]), "A, B and C");
    assert.equal(joinCheckNames(["A", "B", "C", "D"]), "A, B, C and D");
    assert.equal(joinCheckNames(CHECK_LIST_ORDER), "Evidence, Editorial, Compliance, Source recency and Framing");
  });

  test("turned-off line: one, two and three off, fixed order, singular and plural", () => {
    assert.equal(
      turnedOffLineFromClass({ evidence: "confirmed", editorial: null, compliance: "clean" }),
      "Turned off for this run: Editorial review."
    );
    assert.equal(
      turnedOffLineFromClass({ evidence: "confirmed", editorial: null, compliance: null }),
      "Turned off for this run: Editorial and Compliance reviews."
    );
    assert.equal(
      turnedOffLineFromClass({ evidence: null, editorial: null, compliance: null }),
      "Turned off for this run: Evidence, Editorial and Compliance reviews."
    );
    assert.equal(
      turnedOffLineFromClass({ evidence: null, editorial: "clean", compliance: "clean" }),
      "Turned off for this run: Evidence review."
    );
    assert.equal(
      turnedOffLineFromNames(["Editorial", "Compliance"]),
      "Turned off for this run: Editorial and Compliance reviews."
    );
  });

  test("clean line: one, two, three and four names, fixed order, no review noun", () => {
    assert.equal(cleanLineFromNames(["Source recency"]), "Clean: Source recency.");
    assert.equal(
      cleanLineFromNames(["Source recency", "Framing"]),
      "Clean: Source recency and Framing."
    );
    assert.equal(
      cleanLineFromNames(["Editorial", "Source recency", "Framing"]),
      "Clean: Editorial, Source recency and Framing."
    );
    assert.equal(
      cleanLineFromNames(["Editorial", "Compliance", "Source recency", "Framing"]),
      "Clean: Editorial, Compliance, Source recency and Framing."
    );
    assert.equal(cleanLineFromNames(["Editorial"]).includes("review"), false);
  });

  test("both lines keep a trailing period", () => {
    assert.equal(turnedOffLineFromNames(["Editorial"]).endsWith("."), true);
    assert.equal(cleanLineFromNames(["Framing"]).endsWith("."), true);
  });
});

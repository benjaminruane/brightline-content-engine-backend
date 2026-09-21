/**
 * B299. An absent review setting is not requested. Never `!== false`.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { classifyCard } from "../lib/qc/review-summary.mjs";
import { asReviewOptions, resolveReviewOptionsFromBody } from "../lib/qc/review-options.mjs";

const CLEAN_CARD = {
  displayVerdict: "supported_full",
  editorialVerdict: "clean",
  complianceVerdict: "clean",
};

describe("B299 absent setting is not requested", () => {
  test("asReviewOptions treats an empty object as all off", () => {
    assert.deepEqual(asReviewOptions({}), {
      evidenceEnabled: false,
      editorialEnabled: false,
      complianceEnabled: false,
    });
    assert.deepEqual(asReviewOptions(undefined), {
      evidenceEnabled: false,
      editorialEnabled: false,
      complianceEnabled: false,
    });
  });

  test("classifyCard on absent keys does not read the check as clean", () => {
    const cls = classifyCard(CLEAN_CARD, {});
    assert.equal(cls.evidence, null);
    assert.equal(cls.editorial, null);
    assert.equal(cls.compliance, null);
    assert.equal(cls.cardTone, "neutral");
    assert.equal(
      cls.turnedOffLine,
      "Turned off for this run: Evidence review, Editorial review, Compliance review."
    );
  });

  test("a partial object does not default the missing keys on", () => {
    const cls = classifyCard(CLEAN_CARD, { evidenceEnabled: true });
    assert.equal(cls.evidence, "confirmed");
    assert.equal(cls.editorial, null);
    assert.equal(cls.compliance, null);
    assert.equal(cls.cardTone, "green");
    assert.equal(cls.turnedOffLine, "Turned off for this run: Editorial review, Compliance review.");
  });

  test("the writer logs and stamps false when a key is absent", () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => warns.push(args.map(String).join(" "));
    try {
      const out = resolveReviewOptionsFromBody({});
      assert.deepEqual(out, {
        evidenceEnabled: false,
        editorialEnabled: false,
        complianceEnabled: false,
      });
      const joined = warns.join("\n");
      assert.equal(joined.includes("[REVIEW_OPTIONS] evidenceEnabled is absent"), true);
      assert.equal(joined.includes("[REVIEW_OPTIONS] editorialEnabled is absent"), true);
      assert.equal(joined.includes("[REVIEW_OPTIONS] complianceEnabled is absent"), true);
    } finally {
      console.warn = orig;
    }
  });

  test("the writer keeps an explicit false without treating it as a bug", () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => warns.push(args.map(String).join(" "));
    try {
      const out = resolveReviewOptionsFromBody({
        evidenceEnabled: false,
        editorialEnabled: true,
        complianceEnabled: true,
      });
      assert.deepEqual(out, {
        evidenceEnabled: false,
        editorialEnabled: true,
        complianceEnabled: true,
      });
      assert.equal(warns.length, 0);
    } finally {
      console.warn = orig;
    }
  });

  test("a non-boolean value is loud and not requested", () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => warns.push(args.map(String).join(" "));
    try {
      const out = resolveReviewOptionsFromBody({
        evidenceEnabled: "true",
        editorialEnabled: 1,
        complianceEnabled: null,
      });
      assert.deepEqual(out, {
        evidenceEnabled: false,
        editorialEnabled: false,
        complianceEnabled: false,
      });
      assert.equal(warns.some((row) => row.includes("non-boolean")), true);
    } finally {
      console.warn = orig;
    }
  });
});

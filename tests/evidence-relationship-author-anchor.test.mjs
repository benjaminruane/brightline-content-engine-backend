import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { corePropositionConfirmed } from "../lib/qc/evidence-relationship.mjs";

const withHouse = (name, fn) => {
  const prev = process.env.AUTHORING_ORGANISATION;
  process.env.AUTHORING_ORGANISATION = name;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.AUTHORING_ORGANISATION;
    else process.env.AUTHORING_ORGANISATION = prev;
  }
};

const EXCERPT =
  "Meridian Capital Partners V was established in 2026 and has invested in twelve platforms.";
const confirmed = (s) => corePropositionConfirmed(s, EXCERPT).corePropositionConfirmed;

describe("the corroboration anchor skips the authoring organisation", () => {
  test("the same proposition confirms whether or not the author's name leads it", () => {
    withHouse("Halden Group", () => {
      assert.equal(confirmed("Meridian Capital Partners V was established in 2026."), true);
      assert.equal(
        confirmed("Halden Group invested in Meridian Capital Partners V, which was established in 2026."),
        true
      );
    });
  });

  test("the author alone is no anchor, so the proposition stays unconfirmed", () => {
    withHouse("Halden Group", () => {
      assert.equal(confirmed("Halden Group was established in 2026."), false);
    });
  });

  test("a third party leading the sentence is still the anchor", () => {
    withHouse("Halden Group", () => {
      assert.equal(confirmed("Bellweather Partners was established in 2026."), false);
    });
  });
});

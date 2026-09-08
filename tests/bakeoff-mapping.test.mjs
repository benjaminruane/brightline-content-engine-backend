import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  containmentJoin,
  mapFindingToLabel,
  mapVariantB,
  mostSeriousLabel,
} from "../scripts/diagnostic/bakeoff/map-variant-b.mjs";
import {
  decisionRule,
  isDetected,
  locatabilityFromPassageRows,
  locatabilityFromQuotes,
} from "../scripts/diagnostic/bakeoff/score-bakeoff.mjs";
import { validatePassageAgainstSource } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

describe("containment join", () => {
  test("matches a shorter quote to the frozen statement", () => {
    const stmt = "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.";
    assert.equal(containmentJoin("The Company employs 320 people", stmt), true);
  });

  test("matches a longer quote that contains the frozen statement", () => {
    const stmt = "The base case generates 2.8x MOIC and 23% gross IRR.";
    const quote =
      "Closing line. The base case generates 2.8x MOIC and 23% gross IRR. The hold is five years.";
    assert.equal(containmentJoin(quote, stmt), true);
  });

  test("does not join unrelated strings", () => {
    assert.equal(containmentJoin("Halden Group will support continued growth", "We recommend approval."), false);
  });
});

describe("most-serious-wins", () => {
  test("X over P over N", () => {
    assert.equal(mostSeriousLabel(["no_support", "partially_confirmed", "conflicting"]), "conflicting");
    assert.equal(mostSeriousLabel(["no_support", "partially_confirmed"]), "partially_confirmed");
    assert.equal(mostSeriousLabel(["no_support"]), "no_support");
  });

  test("several findings on one statement take the worst label", () => {
    const statements = [
      { fixtureId: "05", statementText: "Halden Group will support continued growth.", occurrence: 0 },
    ];
    const findings = [
      {
        fixtureId: "05",
        draftQuote: "Halden Group will support continued growth.",
        issueClass: "not_addressed",
        problem: "sources do not mention Halden",
      },
      {
        fixtureId: "05",
        draftQuote: "Halden Group will support continued growth.",
        issueClass: "contrary_fact",
        problem: "source names Westhaven as acquirer",
      },
    ];
    const mapped = mapVariantB({ findings, statements });
    assert.equal(mapped.rows[0].mappedLabel, "conflicting");
    assert.equal(mapped.rows[0].silent, false);
  });
});

describe("does not support without a contrary fact", () => {
  test("never maps to X", () => {
    const a = mapFindingToLabel({
      issueClass: "not_addressed",
      problem: "the sources do not support this intensifier",
    });
    const b = mapFindingToLabel({
      issueClass: "outruns_source",
      problem: "the draft does not support the breadth of the claim",
    });
    const c = mapFindingToLabel({
      issueClass: "",
      problem: "the sources do not support the word exceptional",
    });
    assert.notEqual(a, "conflicting");
    assert.notEqual(b, "conflicting");
    assert.notEqual(c, "conflicting");
    assert.ok(a === "no_support" || a === "partially_confirmed");
    assert.ok(b === "no_support" || b === "partially_confirmed");
    assert.ok(c === "no_support" || c === "partially_confirmed");
  });
});

describe("silence, coverage, locatability, win rule", () => {
  test("a silent variant reports coverage 0 and cannot pass the win rule", () => {
    const statements = [
      { fixtureId: "01", statementText: "We recommend approval.", occurrence: 0 },
      { fixtureId: "01", statementText: "The Company is profitable.", occurrence: 0 },
    ];
    const mapped = mapVariantB({ findings: [], statements });
    assert.equal(mapped.coverageCount, 0);
    assert.ok(mapped.rows.every((r) => r.silent && r.mappedLabel === "confirmed"));
    const loc = locatabilityFromQuotes([]);
    const decision = decisionRule({
      catchK: 0,
      catchN: 11,
      leaveK: 76,
      leaveN: 76,
      locatability: loc,
      flaggedNonC: 0,
    });
    assert.equal(decision.wins, false);
    assert.equal(decision.loses, true);
    assert.equal(decision.verdict, "LOSES");
  });

  test("zero quoted passages fails locatability rather than scoring 100%", () => {
    const loc = locatabilityFromQuotes([]);
    assert.equal(loc.quoted, 0);
    assert.equal(loc.rate, 0);
    assert.equal(loc.pass, false);
    assert.equal(loc.failZeroQuotes, true);
  });

  test("empty passage counts against locatability rather than being dropped", () => {
    const loc = locatabilityFromPassageRows([
      { passage: "exact hit in source", sourceText: "prefix exact hit in source suffix" },
      { passage: "", sourceText: "prefix exact hit in source suffix" },
    ]);
    assert.equal(loc.quoted, 1);
    assert.equal(loc.empty, 1);
    assert.equal(loc.slots, 2);
    assert.equal(loc.located, 1);
    assert.equal(loc.rate, 0.5);
    assert.equal(loc.failZeroQuotes, false);
    assert.equal(loc.pass, false);
  });

  test("all empty passages fail locatability rather than scoring 100%", () => {
    const loc = locatabilityFromPassageRows([{ passage: "", sourceText: "abc" }]);
    assert.equal(loc.quoted, 0);
    assert.equal(loc.rate, 0);
    assert.equal(loc.failZeroQuotes, true);
    assert.equal(loc.pass, false);
  });

  test("detection and agreement are separate", () => {
    assert.equal(isDetected("conflicting"), true);
    assert.equal(isDetected("partially_confirmed"), true);
    assert.equal(isDetected("no_support"), true);
    assert.equal(isDetected("confirmed"), false);
    const detectedWrongLabel = "no_support";
    const ben = "conflicting";
    assert.equal(isDetected(detectedWrongLabel), true);
    assert.notEqual(detectedWrongLabel, ben);
  });
});

describe("validatePassageAgainstSource", () => {
  test("accepts an exact substring and rejects a paraphrase", () => {
    const source = "The total team of 285 people is split approximately as follows.";
    const ok = validatePassageAgainstSource(
      "The total team of 285 people is split approximately as follows.",
      source
    );
    const bad = validatePassageAgainstSource("The company has 285 staff in total.", source);
    assert.equal(ok.accepted, true);
    assert.equal(bad.accepted, false);
  });

  test("empty passage is not accepted", () => {
    const v = validatePassageAgainstSource("", "The total team of 285 people.");
    assert.equal(v.accepted, false);
  });
});

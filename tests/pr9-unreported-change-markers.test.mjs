import { describe, expect, it, vi } from "vitest";

import {
  NO_RECORDED_REASON,
  applyUnreportedChangeMarkers,
  changedRegions,
} from "../lib/pr9-unreported-change-markers.mjs";
import { finalizeSuggestRevisionText, parseSoftenedMarkers } from "../lib/build-revision-prompt.mjs";

const ORIGINAL =
  "The team is well established and highly regarded across the market. " +
  "The fund targets industrial technology businesses in Europe.";

const concernsFor = (statementText, kind = "unsupported") => [
  {
    statementIndex: 0,
    statementText,
    evidence: { kind },
    editorial: [],
    compliance: [],
  },
];

/** parseSoftenedMarkers output for raw model text, the real baseline shape. */
const parsedOf = (raw) => parseSoftenedMarkers(raw);

describe("unreported change markers", () => {
  it("generates a marker for a deletion the model did not mark", () => {
    const raw =
      "The team is well established across the market. " +
      "The fund targets industrial technology businesses in Europe.";
    const log = vi.fn();
    const out = applyUnreportedChangeMarkers(ORIGINAL, parsedOf(raw), {
      concerns: concernsFor(
        "The team is well established and highly regarded across the market."
      ),
      traceId: "t1",
      log,
    });

    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].generated).toBe(true);
    expect(out.markers[0].generatedReason).toBe("unreported_change");
    expect(out.markers[0].note).toContain('Removed "and highly regarded"');
    expect(out.unreportedEvents).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[unreported-change] trace=t1 region=/);
  });

  it("does not add a second marker where the model already declared the change", () => {
    const raw =
      "The team is {{well established||CHANGED: Removed the unsupported ranking. Confirm before publishing.}} across the market. " +
      "The fund targets industrial technology businesses in Europe.";
    const parsed = parsedOf(raw);
    expect(parsed.markers).toHaveLength(1);

    const out = applyUnreportedChangeMarkers(ORIGINAL, parsed, {
      concerns: concernsFor(
        "The team is well established and highly regarded across the market."
      ),
      log: vi.fn(),
    });

    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].generated).toBeUndefined();
    expect(out.unreportedEvents).toHaveLength(0);
  });

  it("generates nothing when house style normalisation is the only difference", () => {
    // Curly quotes change the word sequence, so a post-normalisation baseline
    // would flag this. The raw-output baseline must not.
    const original = 'The team delivered \u201Cstrong growth\u201D last year.';
    const finalized = finalizeSuggestRevisionText(original, {
      originalDraft: original,
      concerns: [],
      log: vi.fn(),
    });

    expect(finalized.revisedDraft).toContain('"strong growth"');
    expect(finalized.revisedDraft).not.toEqual(original);
    expect(finalized.markers).toHaveLength(0);
    expect(finalized.unreportedEvents).toHaveLength(0);
  });

  it("generates nothing when cut punctuation normalisation is the only difference", () => {
    // The dangling conjunction rule deletes the token "and", so this too would
    // be flagged by a post-normalisation baseline.
    const original = "The fund invests widely and.";
    const finalized = finalizeSuggestRevisionText(original, {
      originalDraft: original,
      concerns: [],
      log: vi.fn(),
    });

    expect(finalized.revisedDraft).toBe("The fund invests widely.");
    expect(finalized.markers).toHaveLength(0);
    expect(finalized.unreportedEvents).toHaveLength(0);
  });

  it("gives an unreported change with no overlapping concern the no-recorded-reason note", () => {
    const raw =
      "The team is well established and highly regarded across the market. " +
      "The fund targets businesses in Europe.";
    const out = applyUnreportedChangeMarkers(ORIGINAL, parsedOf(raw), {
      // Concern sits on the FIRST sentence; the edit is in the second.
      concerns: concernsFor(
        "The team is well established and highly regarded across the market."
      ),
      log: vi.fn(),
    });

    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].note).toContain(NO_RECORDED_REASON);
    expect(out.markers[0].note).toContain('Removed "industrial technology"');
  });

  it("coalesces two adjacent unreported changes in one sentence into a single marker", () => {
    const original = "The team is well established and highly regarded across the whole market.";
    const raw = "The team is well established across the market.";
    const out = applyUnreportedChangeMarkers(original, parsedOf(raw), {
      concerns: [],
      log: vi.fn(),
    });

    // Two separate deletions ("and highly regarded", "whole") in one sentence.
    const { regions } = changedRegions(original, raw);
    expect(regions.length).toBeGreaterThan(1);
    expect(out.markers).toHaveLength(1);
  });

  it("generates nothing for a mandated first-person house style substitution", () => {
    const original = "We believe the fund will perform. The team is well established.";
    const raw = "Halden Group believes the fund will perform. The team is well established.";
    const out = applyUnreportedChangeMarkers(original, parsedOf(raw), {
      concerns: [],
      log: vi.fn(),
    });
    expect(out.markers).toHaveLength(0);
    expect(out.unreportedEvents).toHaveLength(0);
  });

  it("still flags a deletion even when the removed text was first person", () => {
    const original = "The team is well established. We recommend approval of the commitment.";
    const raw = "The team is well established.";
    const out = applyUnreportedChangeMarkers(original, parsedOf(raw), {
      concerns: [],
      log: vi.fn(),
    });
    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].note).toContain("Removed");
  });

  it("generates nothing when the model changed nothing", () => {
    const out = applyUnreportedChangeMarkers(ORIGINAL, parsedOf(ORIGINAL), {
      concerns: [],
      log: vi.fn(),
    });
    expect(out.markers).toHaveLength(0);
    expect(out.unreportedEvents).toHaveLength(0);
  });

  it("does not add a second marker over a deterministic removal region", () => {
    const original =
      "The fund targets industrial technology businesses in Europe. " +
      "This relationship enabled deep insight during the diligence phase.";
    // The model keeps the sentence verbatim; code removes it afterwards. The
    // unreported check runs on the model's output, so the removal is invisible
    // to it and cannot be double-marked.
    const finalized = finalizeSuggestRevisionText(original, {
      originalDraft: original,
      deterministicUnsupportedRemoval: true,
      concerns: [
        {
          statementIndex: 1,
          statementText: "This relationship enabled deep insight during the diligence phase.",
          evidence: { kind: "unsupported", verdict: "no_support" },
          editorial: [],
          compliance: [],
        },
      ],
      log: vi.fn(),
    });

    expect(finalized.revisedDraft).not.toContain("enabled deep insight");
    expect(finalized.unreportedEvents).toHaveLength(0);
    expect(finalized.markers.filter((m) => m.generated === true)).toHaveLength(0);
  });
});

describe("unreported change markers, integration with the finalise chain", () => {
  it("carries the generated flag through every downstream stage", () => {
    const raw =
      "The team is well established across the market. " +
      "The fund targets industrial technology businesses in Europe.";
    const finalized = finalizeSuggestRevisionText(raw, {
      originalDraft: ORIGINAL,
      concerns: concernsFor(
        "The team is well established and highly regarded across the market."
      ),
      log: vi.fn(),
    });

    const generated = finalized.markers.filter((m) => m.generated === true);
    expect(generated).toHaveLength(1);
    expect(generated[0].note).toMatch(/Confirm before publishing\.$/);
    expect(generated[0].note).not.toContain("generated");
  });

  it("assigns no region two markers", () => {
    const raw =
      "The team is {{well established||CHANGED: Removed the ranking. Confirm before publishing.}} across the market. " +
      "The fund targets businesses in Europe.";
    const finalized = finalizeSuggestRevisionText(raw, {
      originalDraft: ORIGINAL,
      concerns: concernsFor(
        "The team is well established and highly regarded across the market."
      ),
      log: vi.fn(),
    });

    const sorted = [...finalized.markers].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    }
  });
});

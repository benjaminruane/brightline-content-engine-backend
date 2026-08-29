import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyDeterministicUnsupportedRemoval,
  findCheckableParticulars,
  findStatementTextInDraft,
  matchIsWholeSentence,
  buildDeterministicUnsupportedRemovalCutNote,
  enforceRemovalInvariant,
  REMOVAL_NOTE_PREFIX,
  DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE,
  DETERMINISTIC_UNSUPPORTED_REMOVAL_CUT_NOTE,
} from "../lib/pr9-deterministic-unsupported-removal.mjs";
import {
  finalizeSuggestRevisionText,
  normalizeMarkerNoteText,
} from "../lib/build-revision-prompt.mjs";
import { applyMarkerHonestyCheck, MARKER_INTENT_CUT } from "../lib/pr9-marker-honesty.mjs";

const DEEPEN =
  "Halden Group expects the relationship to deepen over the life of the fund.";
const COINVEST =
  "The GP provided access to co-investments on a no-fee, no-carry basis across Funds III and IV.";
const MARK =
  "Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.";

const EXPECTED_DEEPEN_CUT_NOTE =
  'Removed this sentence: "Halden Group expects the relationship to deepen over the life of the fund." No supplied source backs that claim. Confirm before publishing.';

function unsupportedConcern(statementText, statementIndex = 9) {
  return {
    statementIndex,
    statementText,
    evidence: {
      verdict: "no_support",
      kind: "unsupported",
      excerpt: "",
      reason: "No source addresses this.",
    },
    editorial: [],
    compliance: [],
  };
}

describe("no deletion without a marker", () => {
  test("no anchorable remnant -> sentence KEPT, marker emitted, nothing deleted", () => {
    // Two sentences, the second unsupported. The remnant cannot be re-found in
    // the post-deletion draft, which previously deleted the sentence and
    // returned no marker at all (fc25060).
    const draft =
      "The fund targets industrial technology businesses in Europe. " +
      "This relationship enabled deep insight during the diligence phase.";
    const target = "This relationship enabled deep insight during the diligence phase.";
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(target)],
      { enabled: true }
    );

    assert.equal(result.revisedDraft, draft, "nothing may be deleted");
    assert.equal(result.removalEvents.length, 1);
    assert.equal(result.removalEvents[0].action, "unrecordable_removal_kept");
    assert.equal(result.removalEvents[0].reason, "remnant_lost_after_delete");

    const kept = result.markers.find((m) => m.intent === "KEPT");
    assert.ok(kept, "the kept sentence must carry a marker");
    assert.match(kept.note, /could not be recorded/i);
    assert.equal(result.revisedDraft.slice(kept.start, kept.end), target);
  });

  test("a normal removal is unchanged by the guard", () => {
    const draft = `${COINVEST}\n\n${DEEPEN}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents[0].action, "removed");
    assert.equal(result.markers.filter((m) => m.intent === "CUT").length, 1);
  });

  test("the invariant fires and restores when deletions and markers diverge", () => {
    const preStageDraft = `${COINVEST}\n\n${DEEPEN}`;
    const logged = [];

    // A sentence recorded as deleted, with no removal marker to show for it.
    const result = enforceRemovalInvariant(
      {
        revisedDraft: COINVEST,
        markers: [],
        removalEvents: [{ action: "removed", reason: "unsupported_whole_sentence_removed" }],
      },
      {
        preStageDraft,
        preStageMarkers: [],
        traceId: "unit-invariant",
        log: (m) => logged.push(m),
      }
    );

    assert.equal(result.revisedDraft, preStageDraft, "the pre-stage draft must be restored");
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^\[removal-invariant] trace=unit-invariant/);
    assert.match(logged[0], /deleted=1 markers=0/);
    assert.match(logged[0], /action=restored_pre_stage_draft/);
    assert.ok(
      result.removalEvents.some((e) => e.action === "invariant_violated_restored"),
      "the violation must be reported"
    );
  });

  test("the invariant passes a matched deletion through untouched", () => {
    const logged = [];
    const markers = [
      { start: 0, end: 3, intent: "CUT", note: `${REMOVAL_NOTE_PREFIX}: "x." No supplied source backs that claim.` },
    ];
    const result = enforceRemovalInvariant(
      {
        revisedDraft: COINVEST,
        markers,
        removalEvents: [{ action: "removed" }],
      },
      { preStageDraft: "SHOULD NOT BE USED", preStageMarkers: [], log: (m) => logged.push(m) }
    );
    assert.equal(result.revisedDraft, COINVEST);
    assert.equal(logged.length, 0);
  });
});

describe("applyDeterministicUnsupportedRemoval", () => {
  test("whole-sentence unsupported, previous neighbour available -> removed, CUT on previous", () => {
    const draft = `${COINVEST}\n\n${DEEPEN}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.match(result.revisedDraft, /no-fee, no-carry/);
    assert.equal(result.removalEvents.length, 1);
    assert.equal(result.removalEvents[0].action, "removed");
    assert.equal(result.removalEvents[0].remnantSide, "previous");
    const cut = result.markers.find((m) => m.intent === "CUT");
    assert.ok(cut);
    assert.equal(result.revisedDraft.slice(cut.start, cut.end), cut ? result.removalEvents[0].remnantText : "");
    assert.equal(cut.note, EXPECTED_DEEPEN_CUT_NOTE);
    assert.match(cut.note, /no supplied source/i);
    assert.doesNotMatch(cut.note, /author'?s point|materiality|style/i);
    // Offsets: remnant is last word of coinvest, still inside draft.
    assert.ok(cut.start >= 0 && cut.end <= result.revisedDraft.length);
    // Honesty must not fire cut_but_text_present on the new marker.
    const honest = applyMarkerHonestyCheck(draft, result, { traceId: "unit-cut" });
    assert.equal(
      honest.honestyEvents.some((e) => e.contradiction === "cut_but_text_present"),
      false
    );
    assert.equal(honest.markers.find((m) => m.intent === "CUT")?.intent, MARKER_INTENT_CUT);
  });

  test("whole-sentence unsupported, first sentence of draft -> CUT on next remnant", () => {
    const draft = `${DEEPEN}\n\n${COINVEST}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN, 0)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents[0].remnantSide, "next");
    const cut = result.markers.find((m) => m.intent === "CUT");
    assert.ok(cut);
    assert.equal(result.revisedDraft.includes(result.revisedDraft.slice(cut.start, cut.end)), true);
  });

  test("phrase-level unsupported -> untouched", () => {
    const draft = `Alpha ${DEEPEN} Beta still here.`;
    // Match deepen as a phrase inside a longer sentence.
    const match = findStatementTextInDraft(draft, DEEPEN);
    assert.ok(match);
    assert.equal(matchIsWholeSentence(draft, match), false);
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft, draft);
    assert.equal(result.removalEvents[0].action, "skipped");
    assert.equal(result.removalEvents[0].reason, "not_whole_sentence");
  });

  test("kind partial and kind conflict -> untouched", () => {
    const draft = `${MARK}\n\n${DEEPEN}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [
        {
          statementIndex: 4,
          statementText: MARK,
          evidence: { kind: "conflict", verdict: "conflicting", excerpt: "", reason: "x" },
          editorial: [],
          compliance: [],
        },
        {
          statementIndex: 2,
          statementText: DEEPEN,
          evidence: { kind: "partial", verdict: "partially_confirmed", excerpt: "", reason: "y" },
          editorial: [],
          compliance: [],
        },
      ],
      { enabled: true }
    );
    assert.equal(result.revisedDraft, draft);
    assert.equal(result.removalEvents.length, 0);
    assert.equal(result.markers.length, 0);
  });

  test("single-sentence draft -> not removed, loud empty-draft note", () => {
    const draft = DEEPEN;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), true);
    assert.equal(result.removalEvents[0].action, "empty_draft_kept");
    const kept = result.markers.find((m) => m.intent === "KEPT");
    assert.ok(kept);
    const expected = normalizeMarkerNoteText(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE);
    assert.equal(kept.note, expected);
    assert.equal(
      expected,
      "No supplied source supports this. It has been kept only because removing it would leave the draft empty. Confirm before publishing."
    );
    // Survives applyNormalizeMarkerNotes path (idempotent).
    assert.equal(normalizeMarkerNoteText(kept.note), kept.note);
  });

  test("statementText no longer matches because model rewrote it -> no-op with skip reason", () => {
    const draft = `Halden Group hopes the partnership grows over time.\n\n${COINVEST}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft, draft);
    assert.equal(result.removalEvents[0].action, "skipped");
    assert.equal(result.removalEvents[0].reason, "statement_text_no_match");
  });

  test("both neighbours already marked -> no-op with skip reason", () => {
    const mid = "Middle sentence about something confirmed.";
    const draft = `${MARK}\n\n${DEEPEN}\n\n${mid}`;
    // Mark every word in both neighbour sentences so no free remnant remains.
    const markers = [];
    for (const sent of [MARK, mid]) {
      const start = draft.indexOf(sent);
      const re = /\S+/g;
      let m;
      const body = draft.slice(start, start + sent.length);
      while ((m = re.exec(body)) !== null) {
        let s = start + m.index;
        let e = s + m[0].length;
        while (e > s && /[.!?]/.test(draft[e - 1])) e -= 1;
        markers.push({
          start: s,
          end: e,
          note: "Occupied. Confirm before publishing.",
          intent: "KEPT",
        });
      }
    }
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft, draft);
    assert.equal(result.removalEvents[0].action, "skipped");
    assert.equal(result.removalEvents[0].reason, "both_neighbours_marked");
  });

  test("whole-sentence neighbour marker is carved so CUT still anchors", () => {
    const draft = `${COINVEST}\n\n${DEEPEN}`;
    const markers = [
      {
        start: 0,
        end: COINVEST.length,
        note: "Changed coinvest terms. Confirm before publishing.",
        intent: "CHANGED",
      },
    ];
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents[0].action, "removed");
    const cut = result.markers.find((m) => m.intent === "CUT");
    assert.ok(cut);
    const changed = result.markers.find((m) => m.intent === "CHANGED");
    assert.ok(changed);
    assert.ok(changed.end <= cut.start);
  });

  test("previous neighbour has one marked word but another free -> still removes", () => {
    const draft = `${COINVEST}\n\n${DEEPEN}`;
    const occupied = "IV";
    const start = draft.lastIndexOf(occupied);
    const markers = [
      {
        start,
        end: start + occupied.length,
        note: "Changed coinvest terms. Confirm before publishing.",
        intent: "CHANGED",
      },
    ];
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers },
      [unsupportedConcern(DEEPEN)],
      { enabled: true }
    );
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents[0].action, "removed");
    assert.equal(result.removalEvents[0].remnantSide, "previous");
    assert.notEqual(result.removalEvents[0].remnantText, "IV");
  });

  test("flag off is a no-op", () => {
    const draft = `${COINVEST}\n\n${DEEPEN}`;
    const result = applyDeterministicUnsupportedRemoval(
      { revisedDraft: draft, markers: [] },
      [unsupportedConcern(DEEPEN)],
      { enabled: false }
    );
    assert.equal(result.revisedDraft, draft);
    assert.equal(result.removalEvents.length, 0);
  });
});

describe("finalizeSuggestRevisionText deterministic removal hook", () => {
  test("removal runs before honesty and cut_but_text_present does not fire", () => {
    const original = `${COINVEST}\n\n${DEEPEN}`;
    // Model left deepen in place with a false CUT wrap (Condition A shape).
    const raw = `${COINVEST}\n\n{{${DEEPEN.replace(/\.$/, "")}||CUT: Removed this expectation - no supplied source backs that claim. Confirm before publishing.}}.`;
    const result = finalizeSuggestRevisionText(raw, {
      originalDraft: original,
      concerns: [unsupportedConcern(DEEPEN)],
      deterministicUnsupportedRemoval: true,
      traceId: "unit-finalize-removal",
    });
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents?.[0]?.action, "removed");
    assert.equal(result.removalEvents?.[0]?.reason, "unsupported_whole_sentence_removed");
    assert.equal(
      (result.honestyEvents || []).some((e) => e.contradiction === "cut_but_text_present"),
      false
    );
    const cut = result.markers.find((m) => m.intent === "CUT");
    assert.ok(cut);
    assert.match(cut.note, /no supplied source/i);
    assert.equal(result.removalEvents[0].removedSentenceText, DEEPEN);
    assert.equal(typeof result.removalEvents[0].originalOffset, "number");
    assert.ok(result.removalEvents[0].originalOffset >= 0);
  });

  test("model marker wrapping the deleted sentence is dropped (no orphan marker)", () => {
    const original = `${COINVEST}\n\n${DEEPEN}`;
    // Model keep-and-flag wrapped the whole deepen sentence; code then deletes it.
    const raw = `${COINVEST}\n\n{{${DEEPEN.replace(/\.$/, "")}||KEPT: Kept deepen — unsupported. Confirm before publishing.}}.`;
    const result = finalizeSuggestRevisionText(raw, {
      originalDraft: original,
      concerns: [unsupportedConcern(DEEPEN)],
      deterministicUnsupportedRemoval: true,
      traceId: "unit-orphan-marker",
    });
    assert.equal(result.revisedDraft.includes("deepen"), false);
    assert.equal(result.removalEvents?.[0]?.action, "removed");
    // No marker may point past the draft or still wrap deepen prose.
    for (const m of result.markers) {
      assert.ok(m.start >= 0 && m.end <= result.revisedDraft.length);
      assert.ok(m.end > m.start);
      assert.equal(/deepen/i.test(result.revisedDraft.slice(m.start, m.end)), false);
    }
    // The only CUT is on a neighbour remnant, not on absent text.
    const cuts = result.markers.filter((m) => m.intent === "CUT");
    assert.equal(cuts.length, 1);
    assert.equal(
      result.revisedDraft.includes(result.revisedDraft.slice(cuts[0].start, cuts[0].end)),
      true
    );
  });
});

describe("empty-draft note vs normalizeMarkerNoteText", () => {
  test("loud register survives normalisation", () => {
    const out = normalizeMarkerNoteText(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE);
    assert.equal(
      out,
      "No supplied source supports this. It has been kept only because removing it would leave the draft empty. Confirm before publishing."
    );
    assert.ok(out.startsWith("No supplied source supports this."));
    assert.match(out, /kept only because removing it would leave the draft empty/i);
  });
});

describe("quoted removal note", () => {
  test("buildDeterministicUnsupportedRemovalCutNote quotes verbatim and survives normalizeMarkerNoteText", () => {
    const note = buildDeterministicUnsupportedRemovalCutNote(DEEPEN);
    assert.equal(note, EXPECTED_DEEPEN_CUT_NOTE);
    assert.equal(normalizeMarkerNoteText(note), note);
    assert.match(note, /Removed this sentence: "/);
    assert.match(note, /No supplied source backs that claim/);
  });

  test("quotes longer than 200 chars are truncated with ellipsis", () => {
    const long = `${"Word ".repeat(50)}end.`;
    const note = buildDeterministicUnsupportedRemovalCutNote(long);
    assert.match(note, /\.\.\." No supplied source backs that claim/);
    assert.equal(normalizeMarkerNoteText(note), note);
  });

  test("legacy CUT note constant still documents the old body", () => {
    assert.match(DETERMINISTIC_UNSUPPORTED_REMOVAL_CUT_NOTE, /Removed this sentence/);
  });
});

describe("the author's own name is not a checkable particular", () => {
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
  const nouns = (t) =>
    findCheckableParticulars(t)
      .filter((p) => p.kind === "proper_noun")
      .map((p) => p.match);

  test("drops the authoring organisation, exactly as it already drops 'we'", () => {
    withHouse("Halden Group", () => {
      assert.deepEqual(nouns("Halden Group expects the relationship to deepen."), []);
      assert.deepEqual(nouns("We expect the relationship to deepen."), []);
    });
  });

  test("keeps a genuine third party, including alongside the author", () => {
    withHouse("Halden Group", () => {
      assert.deepEqual(nouns("Meridian Capital expects the relationship to deepen."), [
        "Meridian Capital",
      ]);
      assert.deepEqual(nouns("Halden Group committed to Meridian Capital Partners V."), [
        "Meridian Capital Partners V",
      ]);
    });
  });
});

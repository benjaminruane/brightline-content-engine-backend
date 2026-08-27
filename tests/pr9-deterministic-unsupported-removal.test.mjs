import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyDeterministicUnsupportedRemoval,
  findStatementTextInDraft,
  matchIsWholeSentence,
  buildDeterministicUnsupportedRemovalCutNote,
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
    assert.equal(
      (result.honestyEvents || []).some((e) => e.contradiction === "cut_but_text_present"),
      false
    );
    const cut = result.markers.find((m) => m.intent === "CUT");
    assert.ok(cut);
    assert.match(cut.note, /no supplied source/i);
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

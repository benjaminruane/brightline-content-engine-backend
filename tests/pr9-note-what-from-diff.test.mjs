import { describe, expect, it } from "vitest";

import {
  CONCERN_KIND_REASONS,
  MAX_LISTED_EDITS,
  NO_CHANGE_CLAUSE,
  QUOTE_MAX_CHARS,
  buildNoteBodyFromDiff,
  concernKind,
  buildWhatClause,
  diffWordSequences,
  extractModelReason,
  quoteFragment,
  renderWhatClause,
} from "../lib/pr9-note-what-from-diff.mjs";
import { markerSpanStatus } from "../lib/pr9-marker-span-status.mjs";
import {
  finalizeSuggestRevisionText,
  normalizeMarkerNoteText,
} from "../lib/build-revision-prompt.mjs";

const words = (s) => s.split(/\s+/).filter(Boolean);

describe("diffWordSequences", () => {
  it("reports a removal only", () => {
    expect(diffWordSequences(words("the well established and highly regarded team"), words("the well established team"))).toEqual([
      { kind: "removed", removed: "and highly regarded", added: "" },
    ]);
  });

  it("reports an addition only", () => {
    expect(diffWordSequences(words("the team"), words("the experienced team"))).toEqual([
      { kind: "added", removed: "", added: "experienced" },
    ]);
  });

  it("reports a replacement when a deletion and insertion are adjacent", () => {
    expect(diffWordSequences(words("returns of 14 per cent"), words("returns of 12 per cent"))).toEqual([
      { kind: "replaced", removed: "14", added: "12" },
    ]);
  });

  it("reports two separate edits in document order", () => {
    const edits = diffWordSequences(
      words("alpha bravo charlie delta echo"),
      words("alpha charlie delta foxtrot echo")
    );
    expect(edits).toEqual([
      { kind: "removed", removed: "bravo", added: "" },
      { kind: "added", removed: "", added: "foxtrot" },
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(diffWordSequences(words("same words here"), words("same words here"))).toEqual([]);
  });
});

describe("renderWhatClause", () => {
  it("renders removal, addition and replacement", () => {
    expect(renderWhatClause([{ kind: "removed", removed: "and highly regarded", added: "" }])).toBe(
      'Removed "and highly regarded"'
    );
    expect(renderWhatClause([{ kind: "added", removed: "", added: "experienced" }])).toBe(
      'Added "experienced"'
    );
    expect(renderWhatClause([{ kind: "replaced", removed: "14", added: "12" }])).toBe(
      'Replaced "14" with "12"'
    );
  });

  it("lists two edits comma separated, in order", () => {
    expect(
      renderWhatClause([
        { kind: "removed", removed: "bravo", added: "" },
        { kind: "added", removed: "", added: "foxtrot" },
      ])
    ).toBe('Removed "bravo", Added "foxtrot"');
  });

  it("counts rather than lists past three edits", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      kind: "removed",
      removed: `w${i}`,
      added: "",
    }));
    expect(four.length).toBeGreaterThan(MAX_LISTED_EDITS);
    expect(renderWhatClause(four)).toBe("Made 4 separate edits to this passage");
  });

  it("says plainly when nothing changed", () => {
    expect(renderWhatClause([])).toBe(NO_CHANGE_CLAUSE);
    expect(renderWhatClause([])).toBe("No change was made");
  });
});

describe("quoteFragment", () => {
  it("truncates a quoted fragment over 80 characters", () => {
    const long = "a".repeat(QUOTE_MAX_CHARS + 25);
    const quoted = quoteFragment(long);
    expect(quoted).toBe(`${"a".repeat(QUOTE_MAX_CHARS)}...`);
    expect(quoted.length).toBe(QUOTE_MAX_CHARS + 3);
  });

  it("leaves a fragment at the limit alone", () => {
    const exact = "b".repeat(QUOTE_MAX_CHARS);
    expect(quoteFragment(exact)).toBe(exact);
  });

  it("strips markers and downgrades embedded double quotes", () => {
    expect(quoteFragment('{{kettle||CHANGED: note}} said "hello"')).toBe("kettle said 'hello'");
  });
});

describe("extractModelReason", () => {
  it("keeps the reason and discards the model's account of what it did", () => {
    expect(
      extractModelReason("Removed the attribution — the source does not name Partners Group. Confirm before publishing.")
    ).toBe("the source does not name Partners Group");
  });

  it("handles a hyphen separator as well as an em dash", () => {
    expect(extractModelReason("Removed X - no source backs it.")).toBe("no source backs it");
  });

  it("takes the reason after a semicolon, which the model uses instead of a dash", () => {
    expect(
      extractModelReason(
        "Removed the 'top quartile' ranking; the source does not provide a quartile comparison."
      )
    ).toBe("the source does not provide a quartile comparison");
  });

  it("keeps a connective that introduces the reason, since dropping it mangles the clause", () => {
    expect(extractModelReason("Changed 'has returned' to 'is marked at' to match the source language.")).toBe(
      "to match the source language"
    );
    expect(extractModelReason("Removed the claim because the source is silent on it.")).toBe(
      "because the source is silent on it"
    );
  });

  it("prefers whichever reason marker comes first", () => {
    expect(extractModelReason("Removed X - because the source is silent.")).toBe(
      "because the source is silent"
    );
  });

  it("returns nothing when the note is only an account of what it did", () => {
    expect(extractModelReason("Removed 'highly regarded' and the explicit attribution.")).toBe("");
    expect(extractModelReason("")).toBe("");
  });
});

describe("buildNoteBodyFromDiff", () => {
  const original = "The team is well established and highly regarded across the market.";
  const revised = "The team is well established across the market.";

  it("pairs the generated what with the model's why", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed the whole claim — no supplied source backs it. Confirm before publishing.",
    });
    expect(out.changed).toBe(true);
    expect(out.body).toBe('Removed "and highly regarded" - no supplied source backs it');
  });

  it("emits the what clause alone when the model gave no reason", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed 'and highly regarded' and the attribution.",
    });
    expect(out.body).toBe('Removed "and highly regarded"');
  });

  it("says no change was made, and still carries the reason", () => {
    const unchanged = "The team is well established and highly regarded across the market.";
    const out = buildNoteBodyFromDiff({
      original,
      revised: unchanged,
      start: unchanged.indexOf("well established"),
      end: unchanged.indexOf(" across"),
      note: "Removed the attribution — the source never says this. Confirm before publishing.",
    });
    expect(out.changed).toBe(false);
    expect(out.body).toBe("No change was made - the source never says this");
  });
});

describe("concern reason fallback", () => {
  const original = "The team is well established and highly regarded across the market.";
  const revised = "The team is well established across the market.";
  const concernFor = (kindPatch) => [
    { statementIndex: 0, statementText: original, editorial: [], compliance: [], ...kindPatch },
  ];

  it("prefers the model's own reason over the fallback", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed it — the source is silent on this point.",
      concerns: concernFor({ evidence: { kind: "unsupported" } }),
    });
    expect(out.reasonSource).toBe("model");
    expect(out.body).toBe('Removed "and highly regarded" - the source is silent on this point');
  });

  it("falls back to the concern class when the model buried its reason", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed the unsupported 'highly regarded' ranking.",
      concerns: concernFor({ evidence: { kind: "unsupported" } }),
    });
    expect(out.reasonSource).toBe("concern");
    expect(out.body).toBe('Removed "and highly regarded" - no supplied source backs this claim');
  });

  it("uses the right class wording per concern kind", () => {
    const kinds = {
      unsupported: "no supplied source backs this claim",
      conflict: "a source states otherwise",
      partial: "the source backs only part of this",
    };
    for (const [kind, expected] of Object.entries(kinds)) {
      const out = buildNoteBodyFromDiff({
        original,
        revised,
        start: revised.indexOf("well established"),
        end: revised.indexOf(" across"),
        note: "Removed the ranking.",
        concerns: concernFor({ evidence: { kind } }),
      });
      expect(out.reason).toBe(expected);
    }
  });

  it("reads editorial and compliance kinds too", () => {
    expect(concernKind({ editorial: [{ kind: "soften" }] })).toBe("soften");
    expect(concernKind({ compliance: [{ kind: "compliance_strip" }] })).toBe("compliance_strip");
    expect(CONCERN_KIND_REASONS.soften).toBe("overstated against the source");
  });

  it("ignores craft, which never earns a marker", () => {
    expect(concernKind({ editorial: [{ kind: "craft" }] })).toBeNull();
  });

  it("emits the what clause alone when no concern can be traced", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed the ranking.",
      concerns: [{ statementText: "A sentence that is not in this draft.", editorial: [] }],
    });
    expect(out.reasonSource).toBe("none");
    expect(out.body).toBe('Removed "and highly regarded"');
  });

  it("gives a no-change marker on silence the quiet register, closer and all", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised: original,
      start: original.indexOf("well established"),
      end: original.indexOf(" across"),
      note: "Removed the unsupported ranking.",
      concerns: concernFor({ evidence: { kind: "unsupported" } }),
    });
    expect(out.changed).toBe(false);
    expect(out.register).toBe("QUIET");
    expect(normalizeMarkerNoteText(out.body)).toBe(
      "No supplied source speaks to this either way."
    );
  });

  it("gives a no-change marker on a checkable element the loud register", () => {
    const statement = "The fund returned 2.4 times gross MOIC across 17 exits.";
    const out = buildNoteBodyFromDiff({
      original: statement,
      revised: statement,
      start: statement.indexOf("2.4 times"),
      end: statement.indexOf(" across"),
      note: "Kept the multiple.",
      concerns: [
        {
          statementIndex: 0,
          statementText: statement,
          editorial: [],
          compliance: [],
          evidence: { kind: "unsupported" },
        },
      ],
    });
    expect(out.register).toBe("LOUD");
    expect(normalizeMarkerNoteText(out.body)).toBe(
      "No supplied source states this. Do not publish it without one."
    );
  });

  it("leaves a conflict on the ordinary register, because a source spoke", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised: original,
      start: original.indexOf("well established"),
      end: original.indexOf(" across"),
      note: "Kept the wording.",
      concerns: concernFor({
        evidence: { kind: "conflict", sourcePassage: "the team is newly assembled" },
      }),
    });
    expect(out.register).toBeUndefined();
    expect(normalizeMarkerNoteText(out.body)).toBe(
      "No change was made - a source states otherwise. Confirm before publishing."
    );
  });

  it("does not stamp a register note over a span that actually changed", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: revised.indexOf("well established"),
      end: revised.indexOf(" across"),
      note: "Removed the unsupported ranking.",
      concerns: concernFor({ evidence: { kind: "unsupported" } }),
    });
    expect(out.changed).toBe(true);
    expect(out.register).toBeUndefined();
    expect(out.body).toContain('Removed "and highly regarded"');
  });
});

describe("a note accounts only for its own span", () => {
  // The honesty comparator's window runs to the next aligned token, which can
  // be a sentence away when the following sentence was deleted too. The note
  // must not inherit that reach; the honesty check still must.
  it("does not report a deletion that happened in the NEXT sentence", () => {
    const original = "Alpha bravo charlie. Delta echo foxtrot.";
    const revised = "Alpha bravo charlie.";
    const out = buildWhatClause(original, revised, 0, "Alpha bravo charlie.".length);
    expect(out.clause).not.toContain("Delta echo foxtrot");
    expect(out.changed).toBe(false);
    expect(out.clause).toBe(NO_CHANGE_CLAUSE);
    // The honesty comparator is untouched: the cut is still visible to it.
    expect(markerSpanStatus(original, revised, 0, "Alpha bravo charlie.".length)).toBe("CHANGED");
  });

  it("reproduces the 986-1057 leak: the replacement is reported, 'We recommend' is not", () => {
    const original =
      "This relationship enabled deep insight during the diligence phase. We recommend approval.";
    const revised = "This relationship provided valuable insights during the diligence phase.";
    const start = 0;
    const end = revised.length;
    const out = buildWhatClause(original, revised, start, end);
    expect(out.clause).toContain('Replaced "enabled deep insight" with "provided valuable insights"');
    expect(out.clause).not.toContain("We recommend");
  });

  it("still accounts for a marker that genuinely straddles two sentences", () => {
    const original = "Alpha bravo charlie. Delta echo foxtrot.";
    const revised = "Alpha bravo charlie. Delta echo.";
    const out = buildWhatClause(original, revised, 0, revised.length);
    expect(out.changed).toBe(true);
    expect(out.clause).toContain("foxtrot.");
  });
});

describe("an editorial change takes its reason from the editorial concern", () => {
  // The 1059-1111 defect: a voice-consistency fix on a statement that also
  // carried an evidence gap was explained with "no supplied source backs this
  // claim". True of the statement, false of the change.
  const statementText = "We believe the strategy is sound.";
  const original = `${statementText} Other text follows here.`;
  const revised = "Halden Group believes the strategy is sound. Other text follows here.";
  const span = { start: 0, end: "Halden Group believes the strategy is sound.".length };

  const concerns = [
    {
      statementText,
      evidence: { kind: "unsupported" },
      editorial: [{ kind: "craft", rule: "first_person_plural", note: "", suggestedDirection: "" }],
    },
  ];

  it("explains a first-person fix with house style, not with the evidence gap", () => {
    const out = buildNoteBodyFromDiff({
      original,
      revised,
      start: span.start,
      end: span.end,
      note: "CHANGED: Rewrote the opening - no supplied source backs this claim.",
      concerns,
    });
    expect(out.reasonSource).toBe("editorial");
    expect(out.reason).toBe(
      "house style names the organisation rather than using first person"
    );
    expect(out.body).not.toContain("no supplied source backs this claim");
    expect(out.body).toContain('Replaced "We believe" with "Halden Group believes"');
  });

  it("leaves an evidence-driven change explained by the evidence concern", () => {
    const evOriginal = "Revenue grew 22% last year. Other text follows here.";
    const evRevised = "Revenue grew 18% last year. Other text follows here.";
    const out = buildNoteBodyFromDiff({
      original: evOriginal,
      revised: evRevised,
      start: 0,
      end: "Revenue grew 18% last year.".length,
      note: "CHANGED: Corrected the rate.",
      concerns: [
        {
          statementText: "Revenue grew 22% last year.",
          evidence: { kind: "unsupported" },
          editorial: [
            { kind: "craft", rule: "first_person_plural", note: "", suggestedDirection: "" },
          ],
        },
      ],
    });
    expect(out.reasonSource).not.toBe("editorial");
  });
});

describe("interaction with normalizeMarkerNoteText", () => {
  it("survives normalization with the quotation intact", () => {
    const body = 'Removed "and highly regarded" - no supplied source backs it';
    expect(normalizeMarkerNoteText(body)).toBe(
      'Removed "and highly regarded" - no supplied source backs it. Confirm before publishing.'
    );
  });

  it("produces the exact no-change string a user sees", () => {
    expect(normalizeMarkerNoteText("No change was made - the source never says this")).toBe(
      "No change was made - the source never says this. Confirm before publishing."
    );
  });

  it("produces the exact no-change string when there is no reason", () => {
    expect(normalizeMarkerNoteText("No change was made")).toBe(
      "No change was made. Confirm before publishing."
    );
  });

  it("is idempotent, so a second pass cannot double the closer", () => {
    const once = normalizeMarkerNoteText('Removed "x" - because');
    expect(normalizeMarkerNoteText(once)).toBe(once);
  });
});

describe("wired into finalizeSuggestRevisionText", () => {
  const originalDraft = "The team is well established and highly regarded across the market.";

  it("regenerates the note from the diff, discarding the model's narration", () => {
    const raw =
      "The team is {{well established||CHANGED: Removed 'highly regarded' and the attribution — no source backs either. Confirm before publishing.}} across the market.";
    const out = finalizeSuggestRevisionText(raw, { originalDraft });
    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].note).toBe(
      'Removed "and highly regarded" - no source backs either. Confirm before publishing.'
    );
  });

  it("surfaces a marker that changed nothing rather than letting it claim an edit", () => {
    const raw =
      "The team is {{well established and highly regarded||CHANGED: Removed the attribution — the source never says this. Confirm before publishing.}} across the market.";
    const out = finalizeSuggestRevisionText(raw, { originalDraft });
    expect(out.markers).toHaveLength(1);
    expect(out.markers[0].note).toContain("No change was made");
    expect(out.markers[0].note).toContain("the source never says this");
  });

  it("leaves the deterministic removal note untouched", async () => {
    const { buildDeterministicUnsupportedRemovalCutNote } = await import(
      "../lib/pr9-deterministic-unsupported-removal.mjs"
    );
    const note = buildDeterministicUnsupportedRemovalCutNote("We recommend approval.");
    expect(note).toContain("Removed this sentence:");
    expect(note).not.toContain("No change was made");
  });
});

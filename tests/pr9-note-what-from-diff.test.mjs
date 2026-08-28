import { describe, expect, it } from "vitest";

import {
  MAX_LISTED_EDITS,
  NO_CHANGE_CLAUSE,
  QUOTE_MAX_CHARS,
  buildNoteBodyFromDiff,
  buildWhatClause,
  diffWordSequences,
  extractModelReason,
  quoteFragment,
  renderWhatClause,
} from "../lib/pr9-note-what-from-diff.mjs";
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

describe("buildWhatClause uses the honesty comparator's window", () => {
  it("sees an adjacent deletion even when the remnant is byte-identical", () => {
    const original = "Alpha bravo charlie. Delta echo foxtrot.";
    const revised = "Alpha bravo charlie.";
    const out = buildWhatClause(original, revised, 0, "Alpha bravo charlie.".length);
    expect(out.changed).toBe(true);
    expect(out.clause).toBe('Removed "Delta echo foxtrot."');
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

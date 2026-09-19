/**
 * B229: constructive feedback omits a note when the card has no finding text.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { collectMarginNotes } from "../lib/qc/constructive-feedback.mjs";

describe("B229 feedback omit empty notes", () => {
  test("a not-clean card with blank findings does not invent generic notes", () => {
    const notes = collectMarginNotes(
      [
        {
          text: "Returns were strong.",
          qcCard: {
            displayVerdict: "not_supported",
            supportState: "not_supported",
            evidenceSummary: "",
            reasoningParagraph: "",
            editorialVerdict: "concern",
            editorialConcerns: [{ note: "", suggestedDirection: "" }],
            complianceVerdict: "concern",
            complianceConcerns: [],
          },
        },
      ],
      { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true },
      "Returns were strong."
    );
    const invented = notes.filter((n) =>
      [
        "Sources do not confirm this statement.",
        "Editorial concern on this sentence.",
        "Compliance concern on this sentence.",
      ].includes(n.cardNote)
    );
    assert.equal(invented.length, 0);
    assert.equal(
      notes.filter((n) => n.kind === "evidence" || n.kind === "editorial" || n.kind === "compliance").length,
      0
    );
  });
});

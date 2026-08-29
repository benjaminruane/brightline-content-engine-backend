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

  test("where the author is the only name, a source that does not mention it confirms nothing", () => {
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

describe("the author is the anchor when it is the only name", () => {
  // Corpus F03:S5. Skipping the author left no anchor at all, so a statement
  // about the client's own action that the source spells out could not confirm.
  test("a source that names the client corroborates the client's own action", () => {
    withHouse("Partners Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Partners Group's investment will support continued growth through increased waste volumes, the acquisition of additional biomethane plants, and operational improvements.",
          "Leveraging its entrepreneurial governance approach to asset transformation, Partners Group will support management and Suma Capital on implementing value creation initiatives. These initiatives include increasing waste volumes, acquiring new biomethane plants, and introducing operational efficiencies."
        ).corePropositionConfirmed,
        true
      );
    });
  });

  test("a co-actor named after the relation does not count as a different actor", () => {
    // "Suma Capital" trails the verb in the excerpt above; it is being supported,
    // not doing the supporting. Reading it as a competing actor would refuse
    // legitimate support.
    withHouse("Partners Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Partners Group will support the management team.",
          "Partners Group will support management and Suma Capital on value creation."
        ).corePropositionConfirmed,
        true
      );
    });
  });
});

describe("a source crediting a different actor refuses confirmation", () => {
  // Corpus F05. A competitor's press release, claimed as the client's own deal.
  test("a named competitor in subject position blocks the anchor's own name", () => {
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium machined parts, from Westhaven Capital.",
          "Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint"
        ).corePropositionConfirmed,
        false
      );
    });
  });

  test("an unattributed 'we' is somebody else when the excerpt never names the author", () => {
    // The live false green. The excerpt names no organisation at all, so a
    // named-actor-only test would miss it.
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Halden Group will support continued growth in commercial aerospace and an accelerated expansion of Norwell's space applications business.",
          '"We are excited to partner with the Norwell management team to support continued growth and capability expansion."'
        ).corePropositionConfirmed,
        false
      );
    });
  });

  test("the same 'we' confirms once the excerpt attributes it to the author", () => {
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Halden Group will support continued growth in commercial aerospace and an accelerated expansion of Norwell's space applications business.",
          'Halden Group said: "We are excited to partner with the Norwell management team to support continued growth."'
        ).corePropositionConfirmed,
        true
      );
    });
  });

  test("an unquoted 'we' is the client's own memo, not a stranger", () => {
    // Measuring the first cut of this rule against the corpus refused several
    // hundred supported statements, because an unquoted "we" is simply how an
    // internal document reads. The quotation marks carry the signal, not the "we".
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "We have invested EUR 480 million of equity for a 78% controlling stake.",
          "We seek approval to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG."
        ).corePropositionConfirmed,
        true
      );
    });
  });

  test("a loose relation collision does not invent an actor", () => {
    // Corpus F09:S4. The confirmation overlap pairs "establish" with "is" on a
    // substring, which conjured a relation nobody in the statement performs and
    // then found the outgoing CEO performing it.
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and commercial priorities identified at IC.",
          "The CEO transition has gone better than expected. Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team."
        ).corePropositionConfirmed,
        true
      );
    });
  });

  test("a junk anchor stands the actor test down rather than refusing everything", () => {
    // "We" matches the Title-Case shape, so the anchor is sometimes a function
    // word. Comparing real names against it makes every one of them a rival.
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "We are pleased to inform you that Meridian Industrials Fund IV has completed its exit.",
          'We are pleased to inform you that Meridian Industrials Fund IV ("Fund IV") has completed the sale of its final asset.'
        ).corePropositionConfirmed,
        true
      );
    });
  });

  test("a name trailing the relation is not treated as the actor", () => {
    withHouse("Halden Group", () => {
      assert.equal(
        corePropositionConfirmed(
          "Meridian Capital Partners V was established in 2026.",
          "Meridian Capital Partners V was established in 2026 by Bellweather Advisors."
        ).corePropositionConfirmed,
        true
      );
    });
  });
});

import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { EVENT_TYPE } from "../lib/event-type.js";
import {
  CONTEXT_SOURCE_LINE,
  LAYER_ORDER,
  composeLayers,
} from "../lib/prompt-library/compose.mjs";

const savedOrg = process.env.AUTHORING_ORGANISATION;
delete process.env.AUTHORING_ORGANISATION;

afterAll(() => {
  if (savedOrg === undefined) delete process.env.AUTHORING_ORGANISATION;
  else process.env.AUTHORING_ORGANISATION = savedOrg;
});

test("layers stay in one order", () => {
  const facts = composeLayers({
    outputType: "REPORTING_COMMENTARY",
    visibility: "complete",
    eventType: "SPECIAL_TOPIC",
    transactionDate: "March 2026",
    investment: "Example",
    specialInstructions: "",
    sources: [{ label: "Memo", text: "Revenue grew.", role: "facts" }],
    authoringOrganisation: null,
  });
  assert.deepEqual(
    facts.map((layer) => layer.id),
    LAYER_ORDER
  );
  assert.equal(facts.find((layer) => layer.id === "source-roles").text, "");

  const context = composeLayers({
    outputType: "REPORTING_COMMENTARY",
    visibility: "complete",
    eventType: "NEW_DIRECT_INVESTMENT",
    sources: [{ label: "Memo", text: "Revenue grew.", role: "context" }],
  });
  assert.deepEqual(
    context.map((layer) => layer.id),
    LAYER_ORDER
  );
  assert.equal(context.find((layer) => layer.id === "source-roles").text, CONTEXT_SOURCE_LINE);
});

test("every text type module exports the shape", async () => {
  const withScaffold = new Set(["NEW_DIRECT_INVESTMENT", "NEW_PRIMARY_COMMITMENT"]);
  for (const key of Object.values(EVENT_TYPE)) {
    const mod = await import(`../lib/prompt-library/text-types/${key}.mjs`);
    assert.equal(typeof mod.label, "string");
    assert.ok(mod.label.length > 0, key);
    assert.ok(Array.isArray(mod.mustCover), key);
    assert.equal(typeof mod.guidance, "string", key);
    if (withScaffold.has(key)) {
      assert.match(mod.guidance, /Binding constraints \(highest precedence/);
    } else {
      assert.equal(typeof mod.guidance, "string");
      assert.ok(mod.guidance.length > 0, key);
    }
  }
});

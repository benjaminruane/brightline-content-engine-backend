import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { resolveAuthoringOrganisationName } from "../lib/qc/first-person-actor.mjs";

const ENV = "AUTHORING_ORGANISATION";

afterEach(() => {
  delete process.env[ENV];
});

test("a set server name is ignored, and the request argument is the only name", () => {
  process.env[ENV] = "Halden Group";
  assert.equal(resolveAuthoringOrganisationName(), null);
  assert.equal(resolveAuthoringOrganisationName(""), null);
  assert.equal(resolveAuthoringOrganisationName("   "), null);
  assert.equal(resolveAuthoringOrganisationName("Northwind Capital"), "Northwind Capital");
  assert.equal(resolveAuthoringOrganisationName(`  ${"N".repeat(130)}  `).length, 120);
});

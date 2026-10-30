/**
 * B447. The craft note is the only JSON call that requires a note.
 * Every other call keeps the permissive schema.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { anthropicJsonInputSchema } from "../lib/observability.js";
import { writerJsonSchemaForSpan, writerText } from "../lib/qc/reading-review.mjs";

describe("B447 writer note schema", () => {
  test("a call that passes no schema keeps the permissive object", () => {
    assert.deepEqual(anthropicJsonInputSchema(undefined), {
      type: "object",
      additionalProperties: true,
    });
    assert.deepEqual(anthropicJsonInputSchema(null), {
      type: "object",
      additionalProperties: true,
    });
  });

  test("the writer spans require a note, and the sentence note does not", () => {
    const schema = writerJsonSchemaForSpan("b404-writer");
    assert.deepEqual(schema, writerJsonSchemaForSpan("b404-writer-retry"));
    assert.equal(schema.properties.note.type, "array");
    assert.equal(schema.properties.note.minItems, 2);
    assert.equal(schema.properties.note.items.type, "string");
    assert.deepEqual(schema.required, ["note"]);
    assert.equal(writerJsonSchemaForSpan("b404-note"), undefined);
    assert.equal(anthropicJsonInputSchema(schema), schema);
  });

  test("an empty tool object is not a note, and a note string is", () => {
    assert.equal(writerText("{}"), "");
    assert.equal(writerText('{"note":""}'), "");
    assert.equal(writerText('{"note":"The opening is buried."}'), "The opening is buried.");
  });

  test("a schema that is not an object is refused", () => {
    assert.throws(() => anthropicJsonInputSchema("note"), /jsonSchema must be an object/);
  });
});

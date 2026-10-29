# B447

The probe in `scripts/diagnostic/b447/PROBE.md` showed fixtures 01 and 02 satisfying the writer tool with {}. That string is valid JSON, so the schema retry did not run, and writerText found no note key. The fix gives that call a schema with a required `note` string. No other JSON call passes a schema, so each keeps `{ type: "object", additionalProperties: true }`. The prompt, the craft-note ban, and the per-sentence note path are unchanged.

This run is the writer step only, on the twenty drafts from the B446 fixtures. No pipeline.

Withheld: 0 of 20. B446 was 15 of 20.
Calls 20. Discounted USD 0.328855. Input 31661. Output 6822. Cached input 0. Unpriced 0.
Ceiling USD 5. Not crossed.
Opus records no cached input on this path, so discounted USD is the list figure.

## Each draft

- Fixture 01: shown.
- Fixture 02: shown.
- Fixture 03: shown.
- Fixture 04: shown.
- Fixture 05: shown.
- Fixture 06: shown.
- Fixture 07: shown.
- Fixture 08: shown.
- Fixture 09: shown.
- Fixture 10: shown.
- Fixture 11: shown.
- Fixture 12: shown.
- Fixture 13: shown.
- Fixture 14: shown.
- Fixture 15: shown.
- Fixture 16: shown.
- Fixture 17: shown.
- Fixture 18: shown.
- Fixture 19: shown.
- Fixture 20: shown.

## Still withheld

None.


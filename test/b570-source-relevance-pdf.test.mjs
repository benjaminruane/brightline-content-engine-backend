/**
 * B570. The relevance check uses the text the server extracts from each source.
 * Leave out sends only the matching source to Generate. Use anyway sends both.
 * The model is mocked, so this spends no tokens.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import generate from "../api/generate.js";
import sourceRelevance from "../api/source-relevance.js";
import { methodologyWithSourceUse } from "../lib/source-relevance.mjs";

const GP_NAME = "20251113-GPI_30th-anniversary.pdf";
const CP_NAME = "ClearPoint Neuro Reports First Quarter 2026 Results | Newswire.pdf";
const GP_TEXT = "GP Industries Limited reported a higher margin in batteries.";
const CP_TEXT = "ClearPoint Neuro reported first quarter results.";

const GP_PDF = readFileSync(new URL("./fixtures/b570/gp-industries.pdf", import.meta.url));
const CP_PDF = readFileSync(new URL("./fixtures/b570/clearpoint-neuro.pdf", import.meta.url));

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function postReq(body) {
  return { method: "POST", headers: { origin: "http://localhost:5173" }, body };
}

function pdfSource(id, name, bytes) {
  return {
    id,
    name,
    title: name,
    mimeType: "application/pdf",
    contentBase64: bytes.toString("base64"),
    role: "facts",
  };
}

const gpSource = pdfSource("gp", GP_NAME, GP_PDF);
const clearSource = pdfSource("cp", CP_NAME, CP_PDF);

function promptText(spy) {
  return JSON.stringify(spy.mock.calls);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("GP Industries matches the GP PDF and lists ClearPoint as not mentioning it", async () => {
  const res = createRes();
  await sourceRelevance(postReq({ name: "GP Industries", sources: [gpSource, clearSource] }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.skipped, false);
  assert.deepEqual(res.body.missing.map((source) => source.name), [CP_NAME]);
  assert.deepEqual(res.body.unread, []);
  assert.match(res.body.message, new RegExp(`These sources do not mention GP Industries: ${CP_NAME.replace(/[|]/g, "\\|")}`));
  assert.match(res.body.message, /Leave them out of this draft\?/);
  assert.equal(res.body.message.includes(GP_NAME), false);
});

test("a source whose text cannot be read is listed, not treated as a mention", async () => {
  const res = createRes();
  await sourceRelevance(
    postReq({
      name: "GP Industries",
      sources: [
        gpSource,
        {
          id: "scan",
          name: "scan.pdf",
          mimeType: "application/pdf",
          contentBase64: Buffer.from("not a pdf").toString("base64"),
          role: "facts",
        },
      ],
    }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.missing, []);
  assert.deepEqual(res.body.unread.map((source) => source.name), ["scan.pdf"]);
  assert.match(res.body.message, /We could not read scan\.pdf to check it\./);
  assert.match(res.body.message, /Leave them out of this draft\?/);
});

test("pasted text uses the same check, and an empty name skips it", async () => {
  const pasted = createRes();
  await sourceRelevance(
    postReq({
      name: "GP Industries",
      sources: [
        { id: "notes", name: "notes.txt", mimeType: "text/plain", text: CP_TEXT, role: "facts" },
        { id: "gp-note", name: "gp.txt", mimeType: "text/plain", text: GP_TEXT, role: "context" },
      ],
    }),
    pasted
  );
  assert.deepEqual(pasted.body.missing.map((source) => source.id), ["notes"]);
  assert.deepEqual(pasted.body.unread, []);

  const skipped = createRes();
  await sourceRelevance(postReq({ name: "  ", sources: [clearSource] }), skipped);
  assert.equal(skipped.body.skipped, true);
  assert.deepEqual(skipped.body.missing, []);
  assert.deepEqual(skipped.body.unread, []);
});

function mockDraft() {
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  return vi.spyOn(observability, "callLLM").mockResolvedValue({
    text: JSON.stringify({ draftText: "GP Industries reported a higher margin in batteries." }),
  });
}

async function generateFrom(sources) {
  const res = createRes();
  await generate(
    postReq({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      visibility: "complete",
      investment: "GP Industries",
      transactionDate: "2025-11",
      sources,
    }),
    res
  );
  return res;
}

test("Leave out generates from the GP PDF only and the note lists ClearPoint as left out", async () => {
  const checked = createRes();
  await sourceRelevance(postReq({ name: "GP Industries", sources: [gpSource, clearSource] }), checked);
  const leftOutIds = [...checked.body.missing, ...checked.body.unread].map((source) => source.id);
  const used = [gpSource, clearSource].filter((source) => !leftOutIds.includes(source.id));
  assert.deepEqual(used.map((source) => source.id), ["gp"]);

  const llmSpy = mockDraft();
  const res = await generateFrom(used);
  assert.equal(res.body?.ok, true, res.body?.error || "generate failed");
  const prompt = promptText(llmSpy);
  assert.equal(prompt.includes(GP_TEXT), true);
  assert.equal(prompt.includes("ClearPoint"), false);
  const note = methodologyWithSourceUse(
    res.body.methodologyNote,
    used,
    checked.body.missing
  );
  assert.match(note, /Sources used: 20251113-GPI_30th-anniversary\.pdf\./);
  assert.match(note, /Left out: ClearPoint Neuro Reports First Quarter 2026 Results \| Newswire\.pdf\./);
});

test("Use anyway generates from both PDFs", async () => {
  const llmSpy = mockDraft();
  const res = await generateFrom([gpSource, clearSource]);
  assert.equal(res.body?.ok, true, res.body?.error || "generate failed");
  const prompt = promptText(llmSpy);
  assert.equal(prompt.includes(GP_TEXT), true);
  assert.equal(prompt.includes(CP_TEXT), true);
  const note = methodologyWithSourceUse(res.body.methodologyNote, [gpSource, clearSource], []);
  assert.match(note, /20251113-GPI_30th-anniversary\.pdf/);
  assert.match(note, /ClearPoint Neuro Reports First Quarter 2026 Results \| Newswire\.pdf/);
  assert.match(note, /Left out: none\./);
});

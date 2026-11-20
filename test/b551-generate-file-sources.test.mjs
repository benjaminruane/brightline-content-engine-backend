/**
 * B551. Generate and Rewrite read a PDF as text. File bytes never reach the prompt.
 * A provider token-limit error is a plain sentence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import generate from "../api/generate.js";
import rewrite from "../api/rewrite.js";
import { SOURCE_NOT_READ, SOURCE_TOO_LONG } from "../lib/draft-sources.mjs";

const PDF = readFileSync(
  new URL("../scripts/diagnostic/delivery-check/b163/inputs/berkshire-2022-shareholder-letter.pdf", import.meta.url)
);
const PDF_BASE64 = PDF.toString("base64");

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
  return {
    method: "POST",
    headers: { origin: "http://localhost:5173" },
    body,
  };
}

function promptText(spy) {
  return JSON.stringify(spy.mock.calls);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B551 file sources", () => {
  test("a Generate request with a PDF puts the extracted text in the prompt and not the file bytes", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
      text: JSON.stringify({ draftText: "The firm invested in the Berkshire position." }),
    });
    const res = createRes();
    await generate(
      postReq({
        eventType: "NEW_DIRECT_INVESTMENT",
        outputType: "reporting_commentary",
        visibility: "complete",
        investment: "Berkshire",
        transactionDate: "2022-02",
        sources: [
          {
            id: "pdf-1",
            name: "berkshire-2022.pdf",
            mimeType: "application/pdf",
            contentBase64: PDF_BASE64,
            role: "facts",
          },
        ],
      }),
      res
    );
    const prompt = promptText(llmSpy);
    assert.equal(llmSpy.mock.calls.length >= 1, true);
    assert.equal(prompt.includes("Berkshire"), true);
    assert.equal(prompt.includes(PDF_BASE64.slice(0, 80)), false);
    assert.equal(prompt.includes("contentBase64"), false);
    assert.equal(res.body?.error || "", "");
  });

  test("a Rewrite request with a PDF puts the extracted text in the prompt and not the file bytes", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
      text: JSON.stringify({ draftText: "The firm invested in the Berkshire position." }),
    });
    const res = createRes();
    await rewrite(
      postReq({
        text: "A short draft about the letter.",
        instructions: "Use the source.",
        eventType: "NEW_DIRECT_INVESTMENT",
        outputType: "reporting_commentary",
        visibility: "complete",
        sources: [
          {
            id: "pdf-1",
            name: "berkshire-2022.pdf",
            mimeType: "application/pdf",
            contentBase64: PDF_BASE64,
            role: "facts",
          },
        ],
      }),
      res
    );
    const prompt = promptText(llmSpy);
    assert.equal(llmSpy.mock.calls.length >= 1, true);
    assert.equal(prompt.includes("Berkshire"), true);
    assert.equal(prompt.includes(PDF_BASE64.slice(0, 80)), false);
    assert.equal(prompt.includes("contentBase64"), false);
  });

  test("a provider token-limit error is a plain sentence on Generate and Rewrite", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
    const raw = "400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 367657 tokens";
    const body = {
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      visibility: "complete",
      sources: [{ id: "t1", name: "memo.txt", text: "The firm invested USD 5 million in Shopify.", role: "facts" }],
    };

    vi.spyOn(observability, "callLLM").mockRejectedValue(new Error(raw));
    const generated = createRes();
    await generate(postReq(body), generated);
    assert.equal(generated.statusCode, 400);
    assert.equal(generated.body?.error, SOURCE_TOO_LONG);
    assert.equal(String(generated.body?.error).includes("272000"), false);
    assert.equal(String(generated.body?.error).includes("Input tokens exceed"), false);

    vi.spyOn(observability, "callLLM").mockRejectedValue(new Error(raw));
    const rewritten = createRes();
    await rewrite(postReq({ ...body, text: "A draft.", instructions: "Shorten it." }), rewritten);
    assert.equal(rewritten.statusCode, 400);
    assert.equal(rewritten.body?.error, SOURCE_TOO_LONG);
    assert.equal(String(rewritten.body?.error).includes("Input tokens exceed"), false);
  });

  test("a file that cannot be read is a plain sentence and the model is not called", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
      text: JSON.stringify({ draftText: "Should not be used." }),
    });
    const res = createRes();
    await generate(
      postReq({
        eventType: "NEW_DIRECT_INVESTMENT",
        outputType: "reporting_commentary",
        visibility: "complete",
        sources: [
          {
            id: "bad",
            name: "broken.pdf",
            mimeType: "application/pdf",
            contentBase64: Buffer.from("this is not a pdf").toString("base64"),
            role: "facts",
          },
        ],
      }),
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.error, SOURCE_NOT_READ);
    assert.equal(llmSpy.mock.calls.length, 0);
  });
});

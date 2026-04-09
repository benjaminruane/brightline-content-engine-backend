import OpenAI from "openai";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(200).json({ ok: true, description: "" });

  const source = req.body && typeof req.body === "object" ? req.body : {};
  const mimeType = typeof source?.mimeType === "string" ? source.mimeType.trim() : "";
  const sourceName = typeof source?.name === "string" ? source.name : "Untitled source";
  const sourceType = typeof source?.type === "string" ? source.type : "file";
  let llmInput = "";

  if (mimeType === "application/pdf") {
    try {
      const prep = await prepareUploadedSourcesForPipeline([
        {
          id: "summarize_source",
          name: sourceName,
          title: sourceName,
          type: sourceType,
          mimeType,
          contentBase64: typeof source?.contentBase64 === "string" ? source.contentBase64 : "",
        },
      ]);
      const extractedText = typeof prep?.sources?.[0]?.text === "string" ? prep.sources[0].text.trim() : "";
      if (extractedText.length < 50) {
        return res.status(200).json({ ok: true, description: "" });
      }
      llmInput = extractedText.slice(0, 2000);
    } catch {
      return res.status(200).json({ ok: true, description: "" });
    }
  } else {
    const text = typeof source?.text === "string" ? source.text.trim() : "";
    if (!text) return res.status(200).json({ ok: true, description: "" });
    llmInput = text.slice(0, 2000);
  }

  if (!llmInput) return res.status(200).json({ ok: true, description: "" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: true, description: "" });

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a document analyst. Summarise what this document is in exactly 2 short sentences, maximum 30 words per sentence. Be factual and specific. Cover document type, subject matter, and key content. Do not use filler phrases. Do not start with 'This document'. Do not describe file format or technical metadata.",
        },
        { role: "user", content: llmInput },
      ],
      max_tokens: 180,
    });
    const description = typeof completion?.choices?.[0]?.message?.content === "string"
      ? completion.choices[0].message.content.trim()
      : "";
    return res.status(200).json({ ok: true, description });
  } catch {
    return res.status(200).json({ ok: true, description: "" });
  }
}

import OpenAI from "openai";

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

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(200).json({ ok: true, description: "" });

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
            "You are a document analyst. Summarise what this document is in 2-3 concise sentences. Be factual and specific. Cover document type, subject matter, and key content. Do not use filler phrases. Do not start with 'This document'.",
        },
        { role: "user", content: text.slice(0, 2000) },
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

import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function safeBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeUsedFor(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length <= 20) return trimmed;
  return tokens.slice(0, 20).join(" ");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(200).json({ ok: true, usedFor: "" });

  const body = safeBody(req);
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim() : "";
  const snippet = typeof body?.snippet === "string" ? body.snippet.trim() : "";
  const draftText = typeof body?.draftText === "string" ? body.draftText.trim().slice(0, 1000) : "";

  if (!sourceName || !snippet || !draftText || !process.env.OPENAI_API_KEY) {
    return res.status(200).json({ ok: true, usedFor: "" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a document analyst. In one concise sentence of maximum 20 words, describe how the source document was used in producing the draft text. Begin with a verb (e.g. 'Provided', 'Supplied', 'Contributed'). Be specific to the actual content used. Do not use filler phrases.",
        },
        {
          role: "user",
          content: `Source name: ${sourceName}\nSnippet: ${snippet}\nDraft excerpt: ${draftText}`,
        },
      ],
    });

    const usedFor = normalizeUsedFor(completion?.choices?.[0]?.message?.content || "");
    return res.status(200).json({ ok: true, usedFor });
  } catch {
    return res.status(200).json({ ok: true, usedFor: "" });
  }
}

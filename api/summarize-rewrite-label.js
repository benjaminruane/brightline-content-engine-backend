// A8.2: Short LLM summary of rewrite instructions (fire-and-forget from client; non-blocking for save).
import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function stripTrailingPunctuation(s) {
  return typeof s === "string" ? s.replace(/[.!?,;:]+$/g, "").trim() : "";
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const instruction =
    typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!instruction) {
    return res.status(200).json({ ok: true, label: "" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ok: true, label: "" });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `Summarise this rewrite instruction in 5–8 words from the writer's perspective. Be concrete and specific. Examples: 'Shortened text to 30 words', 'Expanded focus on investment thesis', 'Sharpened wording and removed marketing language'. Return only the summary, no punctuation at the end.

Instruction:
${instruction}`,
        },
      ],
      max_tokens: 80,
    });
    const raw = completion?.choices?.[0]?.message?.content;
    const label = stripTrailingPunctuation(typeof raw === "string" ? raw.trim() : "");
    return res.status(200).json({ ok: true, label: label || "" });
  } catch (err) {
    return res.status(200).json({ ok: true, label: "" });
  }
}

import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: false, narrative: "" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const summary = body.qcSummary && typeof body.qcSummary === "object" ? body.qcSummary : {};
  const notSupportedStatements = Array.isArray(body.notSupportedStatements) ? body.notSupportedStatements : [];
  const editorialConcerns = Array.isArray(body.editorialConcerns) ? body.editorialConcerns : [];
  const complianceConcerns = Array.isArray(body.complianceConcerns) ? body.complianceConcerns : [];
  const signoffVerdict =
    summary.signoffVerdict === "Ready for signoff" ||
    summary.signoffVerdict === "Needs targeted revision" ||
    summary.signoffVerdict === "Needs significant work"
      ? summary.signoffVerdict
      : "Needs targeted revision";

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a senior investment content editor reviewing a draft for signoff readiness. Return one narrative paragraph only, 100-200 words, direct and authoritative, no bullet points, no headers, no system language.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              instructions: [
                "Assess what is working and what needs fixing with specific references to claims and issues.",
                "Use direct, constructive editorial language in a senior FT-style voice.",
                `Conclude explicitly with one of these exact labels: ${signoffVerdict}.`,
              ],
              draftText,
              qcSummary: summary,
              notSupportedStatements,
              editorialConcerns,
              complianceConcerns,
            },
            null,
            2
          ),
        },
      ],
      max_tokens: 350,
    });
    const narrative = typeof completion?.choices?.[0]?.message?.content === "string" ? completion.choices[0].message.content.trim() : "";
    return res.status(200).json({ ok: true, narrative });
  } catch {
    return res.status(200).json({ ok: false, narrative: "" });
  }
}

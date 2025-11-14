// ---------- Output Type Guidelines ----------
const OUTPUT_TYPE_PROMPTS = {
  investor_commentary: `Audience: existing investors (LPs). Tone: concise, factual, professional. Avoid hype.
Include: period performance, drivers, material changes, portfolio actions, risk/mitigants, cautious outlook.`,

  detailed_investor_note: `Audience: existing investors and internal stakeholders. Tone: thorough, neutral, compliance-safe.
Include: context, factual analysis, key metrics, caveats, assumptions.`,

  press_release: `Audience: media & public. Tone: clear, objective, third-person. Avoid forward-looking promises.
Include: headline, dateline, who/what/when/where/why, quotes, boilerplate.`,

  linkedin_post: `Audience: professional network. Tone: crisp, accessible, compliance-aware.
Include: short hook, impact bullets, link, hashtags.`
};

// ---------- Prompt Builder ----------
function buildPrompt({ title, outputTypes, notes, publicSearch, sources, text }) {
  const filesText = (sources?.files || [])
    .map((f) => `${f.name}:\n${String(f.text || "").slice(0, 3000)}`)
    .join("\n\n");

  const urlsText = (sources?.urls || [])
    .map((u) => `${u.url}:\n${String(u.text || "").slice(0, 3000)}`)
    .join("\n\n");

  const rawCombinedText = text
    ? `\n\nRaw combined source text (may include all uploaded files and URLs):\n${String(
        text
      ).slice(0, 8000)}`
    : "";

  const sections = (outputTypes || [])
    .map((t) => {
      const guide = OUTPUT_TYPE_PROMPTS[t] || "(no guide)";
      return `### ${t}
Guidelines:
${guide}
Draft (from sources):`;
    })
    .join("\n\n");

  return `Title: ${title || "Untitled"}
Public Domain Search: ${publicSearch ? "ON" : "OFF"}

User notes:
${notes || "(none)"}

Sources (structured):
${filesText}
${urlsText}

${rawCombinedText}

${sections}`;
}

// ---------- Call OpenAI ----------
async function callOpenAI({ modelId, temperature, maxTokens, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Strip "openai:" prefix if present
  const model = (String(modelId || "").replace(/^openai:/, "")) || "gpt-4o-mini";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: typeof temperature === "number" ? temperature : 0.3,
      max_tokens: typeof maxTokens === "number" ? maxTokens : 1200,
      messages: [
        {
          role: "system",
          content:
            "You are a factual, compliance-safe assistant. " +
            "When Public Domain Search is OFF, you must base your answer only on the sources and raw combined source text provided by the user. " +
            "When it is ON, you may also draw on your general knowledge."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI API error: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ---------- API Route ----------
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      modelId,
      temperature,
      maxTokens,
      publicSearch,
      // old name, for compatibility if ever used:
      outputTypes,
      // new name from frontend:
      selectedTypes,
      title,
      notes,
      sources,
      text
    } = req.body || {};

    // Prefer selectedTypes from the frontend, fall back to outputTypes if present
    const effectiveOutputTypes = Array.isArray(selectedTypes) && selectedTypes.length > 0
      ? selectedTypes
      : Array.isArray(outputTypes)
      ? outputTypes
      : [];

    // Optional: light debug log in server logs
    console.log("[/api/generate] body keys:", Object.keys(req.body || {}));

    const prompt = buildPrompt({
      title,
      outputTypes: effectiveOutputTypes,
      notes,
      publicSearch,
      sources,
      text
    });

    const output = await callOpenAI({ modelId, temperature, maxTokens, prompt });

    return res.status(200).json({ output });
  } catch (err) {
    console.error("[/api/generate] error:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}

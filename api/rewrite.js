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
function buildPrompt({ title, outputTypes, rewriteNotes, publicSearch, sources }) {
  const filesText = (sources?.files || [])
    .map(f => `${f.name}:\n${String(f.text || '').slice(0, 3000)}`).join('\n\n');

  const urlsText = (sources?.urls || [])
    .map(u => `${u.url}:\n${String(u.text || '').slice(0, 3000)}`).join('\n\n');

  const sections = (outputTypes || []).map(t => {
    const guide = OUTPUT_TYPE_PROMPTS[t] || '(no guide)';
    return `### ${t}
Guidelines:
${guide}
Revised draft (from sources + revision notes):`;
  }).join('\n\n');

  return `Title: ${title || 'Untitled'}
Public Domain Search: ${publicSearch ? 'ON' : 'OFF'}

Revision notes from user:
${rewriteNotes || '(none)'}

Sources:
${filesText}
${urlsText}

${sections}`;
}

// ---------- Call OpenAI ----------
async function callOpenAI({ modelId, temperature, maxTokens, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = (String(modelId).replace(/^openai:/, '')) || 'gpt-4o-mini';

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: typeof temperature === "number" ? temperature : 0.3,
      max_tokens: typeof maxTokens === "number" ? maxTokens : 1200,
      messages: [
        { role: "system", content: "You are a factual, compliance-safe assistant that only writes from provided sources." },
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
    const { modelId, temperature, maxTokens, publicSearch, outputTypes, title, rewriteNotes, sources } = req.body;

    const prompt = buildPrompt({ title, outputTypes, rewriteNotes, publicSearch, sources });
    const output = await callOpenAI({ modelId, temperature, maxTokens, prompt });

    return res.status(200).json({ output });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}

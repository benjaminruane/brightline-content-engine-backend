import OpenAI from "openai";

const STAGE2_MODEL = "gpt-4o";
const ALLOWED_CLASSIFICATIONS = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const DEFAULT_FAILURE_EXPLANATION = "Match call failed — defaulting to no_support.";

const STAGE2_SYSTEM_PROMPT = `
You classify whether a source supports a statement.
Return ONLY a JSON object:
{
  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>",
  "explanation": "<one to two sentences>"
}

Classification values:
• "confirmed" — source confirms the substance of the statement, including paraphrased or reformatted versions of the same facts
• "partially_confirmed" — source confirms some but not all verifiable facts in the statement; explanation must name what is confirmed and what is not
• "conflicting" — source directly contradicts a specific claim; explanation must name the contradiction
• "no_support" — source does not address the statement

Exact figures confirm. Rounding and formatting differences confirm (e.g. $132mm and $132 million are the same).
Approximate qualifiers in the statement (approximately, roughly, around) widen tolerance.
A stated precise figure in the statement that differs materially from a stated precise figure in the source does not confirm.

Partially confirmed applies only when the source confirms some specific facts in the statement but not others. A source that discusses the same general topic without confirming any specific claim is no_support, not partially_confirmed.

Return a verbatim excerpt from the source that is most relevant to your classification. Maximum 400 characters.
If the relevant text is longer, trim at a sentence boundary and do not paraphrase.
`.trim();

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function trimPassageToLimit(passage, maxChars = 400) {
  const text = typeof passage === "string" ? passage : "";
  if (text.length <= maxChars) return text;

  const candidate = text.slice(0, maxChars);
  let cut = -1;
  for (const marker of [".", "!", "?"]) {
    const idx = candidate.lastIndexOf(marker);
    if (idx > cut) cut = idx;
  }

  if (cut >= 0) {
    return `${candidate.slice(0, cut + 1)}…`;
  }
  return `${candidate.trimEnd()}…`;
}

function normalizeValidResponse(parsed, sourceText) {
  const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const explanationRaw = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  const explanation = explanationRaw || "No explanation provided.";

  const source = typeof sourceText === "string" ? sourceText : "";
  const passageRaw = typeof parsed?.passage === "string" ? parsed.passage : "";
  let passage = trimPassageToLimit(passageRaw, 400);

  if (passage && !source.includes(passage.replace(/…$/, ""))) {
    passage = "";
  }

  return {
    classification,
    passage,
    explanation,
  };
}

function noSupportResult(sourceIndex, sourceLabel, explanation = DEFAULT_FAILURE_EXPLANATION) {
  return {
    sourceIndex,
    sourceLabel,
    classification: "no_support",
    passage: "",
    explanation,
  };
}

async function matchSingleSource(client, statement, sourceText) {
  const userPrompt = `
Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await client.chat.completions.create({
    model: STAGE2_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: STAGE2_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  const raw = completion?.choices?.[0]?.message?.content ?? "";
  return safeJsonParse(raw);
}

export async function matchAllSources(statement, sources) {
  try {
    const safeStatement = typeof statement === "string" ? statement : "";
    const safeSources = Array.isArray(sources) ? sources : [];
    if (!process.env.OPENAI_API_KEY) {
      return safeSources.map((source, index) =>
        noSupportResult(
          index,
          (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`,
          DEFAULT_FAILURE_EXPLANATION
        )
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tasks = safeSources.map(async (source, index) => {
      const sourceText = typeof source?.text === "string" ? source.text : "";
      const sourceLabel =
        (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
      try {
        const first = await matchSingleSource(client, safeStatement, sourceText);
        let normalized = normalizeValidResponse(first, sourceText);
        if (!normalized) {
          const second = await matchSingleSource(client, safeStatement, sourceText);
          normalized = normalizeValidResponse(second, sourceText);
        }

        if (!normalized) {
          console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
          return noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
        }

        return {
          sourceIndex: index,
          sourceLabel,
          classification: normalized.classification,
          passage: normalized.passage,
          explanation: normalized.explanation,
        };
      } catch {
        console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
        return noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
      }
    });

    return await Promise.all(tasks);
  } catch (err) {
    const safeSources = Array.isArray(sources) ? sources : [];
    const message = err?.message || String(err);
    return safeSources.map((source, index) =>
      noSupportResult(
        index,
        (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`,
        `Match call failed — defaulting to no_support. ${message}`
      )
    );
  }
}

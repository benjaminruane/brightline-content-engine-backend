import OpenAI from "openai";
import { extractStatements as extractStatementsV2 } from "../../extract-statements.mjs";

const STAGE1_MODEL = "gpt-4o";
const STAGE1_SYSTEM_PROMPT = `
You split a draft into complete sentences.
Return ONLY a JSON object in the form:
{ "statements": ["sentence one", "sentence two", "..."] }

Constraints:
• Do not split within a sentence
• Do not merge sentences
• Do not rephrase any sentence
• Do not introduce any content not present in the draft
• Preserve all numbers, percentages, currency figures, and proper nouns exactly as they appear
• Return every sentence in the draft — omit nothing
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

function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function getTrimmedDraftWithOffset(draftText) {
  const raw = typeof draftText === "string" ? draftText : "";
  const trimmed = raw.trim();
  const offset = raw.indexOf(trimmed);
  return {
    raw,
    trimmed,
    offset: offset >= 0 ? offset : 0,
  };
}

function mapWithExactAndTolerantSearch(draftText, statementTexts) {
  const { trimmed, offset } = getTrimmedDraftWithOffset(draftText);
  const out = [];
  let cursor = 0;
  let invalid = false;

  for (const statementText of statementTexts) {
    const statement = typeof statementText === "string" ? statementText.trim() : "";
    if (!statement) {
      invalid = true;
      break;
    }

    const exactIndex = trimmed.indexOf(statement, cursor);
    if (exactIndex >= 0) {
      out.push({
        text: statement,
        startChar: offset + exactIndex,
        endChar: offset + exactIndex + statement.length,
      });
      cursor = exactIndex + statement.length;
      continue;
    }

    const expectedStart = Math.max(0, cursor - 10);
    const expectedEnd = Math.min(trimmed.length - statement.length, cursor + 10);
    let best = null;

    for (let i = expectedStart; i <= expectedEnd; i++) {
      const candidateSlice = trimmed.slice(i, i + statement.length);
      if (candidateSlice.length !== statement.length) continue;
      const distance = levenshteinDistance(candidateSlice, statement);
      if (distance <= 5) {
        if (!best || distance < best.distance) {
          best = { index: i, distance, text: candidateSlice };
        }
      }
    }

    if (!best) {
      invalid = true;
      break;
    }

    out.push({
      text: best.text,
      startChar: offset + best.index,
      endChar: offset + best.index + best.text.length,
    });
    cursor = best.index + best.text.length;
  }

  return { statements: out, invalid };
}

function mapWithExactSearchOnly(draftText, statementTexts) {
  const { trimmed, offset } = getTrimmedDraftWithOffset(draftText);
  const out = [];
  let cursor = 0;

  for (const statementText of statementTexts) {
    const statement = typeof statementText === "string" ? statementText.trim() : "";
    if (!statement) continue;

    let idx = trimmed.indexOf(statement, cursor);
    if (idx < 0) idx = trimmed.indexOf(statement);
    if (idx < 0) continue;

    out.push({
      text: statement,
      startChar: offset + idx,
      endChar: offset + idx + statement.length,
    });
    cursor = idx + statement.length;
  }

  return out;
}

function fallbackExtract(draftText) {
  const splitResult = extractStatementsV2({
    mode: "draft",
    text: typeof draftText === "string" ? draftText : "",
    opts: { engine: "v2" },
  });
  const candidates = Array.isArray(splitResult?.candidates) ? splitResult.candidates : [];
  if (candidates.length === 0) {
    throw new Error("stage1: fallback splitter returned empty result");
  }

  const mapped = mapWithExactSearchOnly(draftText, candidates);
  if (mapped.length === 0) {
    throw new Error("stage1: fallback splitter returned empty result");
  }
  if (mapped.length !== candidates.length) {
    throw new Error("stage1: fallback splitter returned empty result");
  }

  return { statements: mapped, source: "fallback" };
}

export async function extractStatements(draftText) {
  try {
    const safeDraft = typeof draftText === "string" ? draftText : "";
    if (!safeDraft.trim()) {
      return fallbackExtract(safeDraft);
    }

    if (!process.env.OPENAI_API_KEY) {
      return fallbackExtract(safeDraft);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: STAGE1_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: STAGE1_SYSTEM_PROMPT },
        { role: "user", content: safeDraft },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);
    const statements = Array.isArray(parsed?.statements)
      ? parsed.statements.filter((s) => typeof s === "string" && s.trim())
      : [];

    if (statements.length === 0) {
      return fallbackExtract(safeDraft);
    }

    const mapped = mapWithExactAndTolerantSearch(safeDraft, statements);
    if (mapped.invalid) {
      console.warn("stage1: LLM split failed validation — falling back to deterministic splitter");
      return fallbackExtract(safeDraft);
    }

    return { statements: mapped.statements, source: "llm" };
  } catch (err) {
    try {
      const fallback = fallbackExtract(draftText);
      return {
        ...fallback,
        error: err?.message || String(err),
      };
    } catch (fallbackErr) {
      return {
        statements: [],
        source: "fallback",
        error: fallbackErr?.message || err?.message || String(err),
      };
    }
  }
}

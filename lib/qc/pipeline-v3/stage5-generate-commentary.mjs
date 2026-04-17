import OpenAI from "openai";

const STAGE5_MODEL = "gpt-4o";
const STAGE5_SYSTEM_PROMPT = `
You are a senior financial editor reviewing a draft
document against source evidence. Write commentary for
the writer in plain, direct language. Be specific —
reference the actual claim and the actual source content.
Be actionable — tell the writer exactly what the issue
is and what to do. Never use system language such as
'entity', 'canonical claim', 'corpus', or 'classification'.
Never write generic filler such as 'the source discusses
related subject matter'. Write one to three sentences only.
`.trim();

function getPreferredSourceLabel(excerptResult) {
  const primaryLabel =
    typeof excerptResult?.primaryExcerpt?.sourceLabel === "string"
      ? excerptResult.primaryExcerpt.sourceLabel.trim()
      : "";
  if (primaryLabel) return primaryLabel;

  const conflictLabel =
    typeof excerptResult?.conflictExcerpt?.sourceLabel === "string"
      ? excerptResult.conflictExcerpt.sourceLabel.trim()
      : "";
  if (conflictLabel) return conflictLabel;

  return "uploaded sources";
}

function fallbackByVerdict(verdictResult, excerptResult) {
  const verdict = typeof verdictResult?.verdict === "string" ? verdictResult.verdict : "not_supported";
  const sourceLabel = getPreferredSourceLabel(excerptResult);

  if (verdict === "confirmed") {
    return { commentary: `Supported by ${sourceLabel}.`, source: "fallback" };
  }
  if (verdict === "partially_confirmed") {
    return {
      commentary: `Partially supported by ${sourceLabel}. Check the draft against the source.`,
      source: "fallback",
    };
  }
  if (verdict === "conflicting") {
    return {
      commentary: `Conflicting evidence found in ${sourceLabel}. Review before publishing.`,
      source: "fallback",
    };
  }
  return {
    commentary: "No source found for this claim. Add a source or revise the statement.",
    source: "fallback",
  };
}

function buildUserPrompt(statement, verdictResult, excerptResult) {
  const safeStatement = typeof statement === "string" ? statement : "";
  const verdict = typeof verdictResult?.verdict === "string" ? verdictResult.verdict : "not_supported";

  const primaryExcerptBlock =
    excerptResult?.primaryExcerpt &&
    typeof excerptResult.primaryExcerpt.sourceLabel === "string" &&
    typeof excerptResult.primaryExcerpt.passage === "string" &&
    excerptResult.primaryExcerpt.passage
      ? `Supporting excerpt (${excerptResult.primaryExcerpt.sourceLabel}): ${excerptResult.primaryExcerpt.passage}`
      : "";

  const conflictExcerptBlock =
    excerptResult?.conflictExcerpt &&
    typeof excerptResult.conflictExcerpt.sourceLabel === "string" &&
    typeof excerptResult.conflictExcerpt.passage === "string" &&
    excerptResult.conflictExcerpt.passage
      ? `Conflicting excerpt (${excerptResult.conflictExcerpt.sourceLabel}): ${excerptResult.conflictExcerpt.passage}`
      : "";

  const blocks = [
    `Statement: ${safeStatement}`,
    `Verdict: ${verdict}`,
    primaryExcerptBlock,
    conflictExcerptBlock,
    `Instructions by verdict:
- confirmed: explain what in the source confirms the
  statement. Name the specific figures or facts.
- partially_confirmed: name what is confirmed and what
  is not. Be precise about the gap.
- conflicting: name what the conflicting source says
  and exactly how it contradicts the statement. If a
  primary excerpt is also present, note what it confirms.
  Tell the writer what to check or reconcile.
- not_supported: tell the writer that no uploaded source
  addresses this claim and what they should do.`,
  ].filter(Boolean);

  return blocks.join("\n\n");
}

export async function generateCommentary(statement, verdictResult, excerptResult) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return fallbackByVerdict(verdictResult, excerptResult);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const userPrompt = buildUserPrompt(statement, verdictResult, excerptResult);
    const completion = await client.chat.completions.create({
      model: STAGE5_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: STAGE5_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const commentary = (completion?.choices?.[0]?.message?.content ?? "").trim();
    if (!commentary) {
      return fallbackByVerdict(verdictResult, excerptResult);
    }

    return {
      commentary,
      source: "llm",
    };
  } catch (err) {
    const fallback = fallbackByVerdict(verdictResult, excerptResult);
    return {
      ...fallback,
      error: err?.message || String(err),
    };
  }
}

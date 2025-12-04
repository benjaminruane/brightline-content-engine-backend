// utils/scoreDraft.js
//
// A lightweight LLM evaluator that produces a 0–1 reliability score.
// We query the model with a strict JSON-return instruction. If the model
// ever returns invalid JSON, we gracefully fallback to 0.5.

import OpenAI from "openai";

export async function scoreDraft(text, model = "gpt-4o-mini") {
  if (!text || typeof text !== "string") return 0.5;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: 200,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a scoring engine. Return ONLY strict JSON: {\"score\": <number 0-1>} with no commentary."
        },
        {
          role: "user",
          content: `Score the reliability and factual soundness of the following draft. Only return JSON.\n\n---\n${text}\n---`
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const json = JSON.parse(raw);
    if (typeof json.score === "number") {
      return Math.min(1, Math.max(0, json.score));
    }
  } catch (err) {
    console.error("scoreDraft error:", err);
  }

  // fallback
  return 0.5;
}

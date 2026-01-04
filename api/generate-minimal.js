import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";

export default async function handler(req, res) {
  res.status(200).json({ ok: true, step: "web-helper" });
}

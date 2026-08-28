/**
 * Dated snapshots only. Never a floating alias.
 *
 * A floating alias lets the provider promote a new snapshot behind the same
 * name, which moves verdicts with no deploy and no signal. Each string below
 * is the snapshot its former alias already resolved to when pinned on
 * 2026-08-28, so pinning changed no behaviour:
 *
 *   gpt-4o      -> gpt-4o-2024-08-06
 *   gpt-4o-mini -> gpt-4o-mini-2024-07-18
 *   gpt-5.1     -> gpt-5.1-2025-11-13
 *
 * Adding a model here means adding its price to PRICING in
 * lib/observability.js, which is keyed on the exact string and silently
 * reports zero cost for anything it does not recognise.
 *
 * See scripts/diagnostic/model-pinning-options.md.
 */
export const STAGE_MODELS = {
  "stage1-splitting": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "stage1b-claim-spans": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "stage2-matching": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "stage5-commentary": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "editorial-review": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "editorial-style-review": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "compliance-review": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "style-review": { provider: "openai", model: "gpt-4o-2024-08-06" },

  "claim-extraction": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "claim-verifier": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "writing-generate": { provider: "openai", model: "gpt-5.1-2025-11-13" },
  "writing-rewrite": { provider: "openai", model: "gpt-5.1-2025-11-13" },
  adapt: { provider: "openai", model: "gpt-5.1-2025-11-13" },
  "ask-query": { provider: "openai", model: "gpt-5.1-2025-11-13" },
  "query-sources": { provider: "openai", model: "gpt-5.1-2025-11-13" },
  "summarize-source": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "summarize-source-usage": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "summarize-rewrite-label": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "synthesize-review": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "constructive-feedback": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "constructive-feedback-craft": { provider: "openai", model: "gpt-4o-2024-08-06" },
  "output-scoring": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "editorial-duplication-judge": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
  "framing-fidelity-judge": { provider: "openai", model: "gpt-4o-mini-2024-07-18" },
};

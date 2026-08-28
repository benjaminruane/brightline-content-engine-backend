#!/usr/bin/env node
/**
 * List every dated snapshot the production key can currently see behind each
 * aliased model in STAGE_MODELS.
 *
 * Reads the provider, not memory and not the documentation. Guessing a model
 * string has already cost this project two diagnostic passes.
 *
 * Zero inference calls. GET /v1/models is free.
 *
 * Usage: node scripts/diagnostic/list-model-snapshots.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { STAGE_MODELS } from "../../lib/qc/model-config.mjs";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { DIAG_ROOT } from "./lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const OUT_PATH = path.join(DIAG_ROOT, "model-snapshots.json");

/** A dated snapshot ends in -YYYY-MM-DD, or for some families -YYYYMMDD. */
const DATE_SUFFIX_RE = /-(\d{4}-\d{2}-\d{2}|\d{8})$/;

export function hasDateSuffix(id) {
  return typeof id === "string" && DATE_SUFFIX_RE.test(id);
}

/** Aliases actually configured in the pipeline, deduplicated. */
function configuredAliases() {
  return [...new Set(Object.values(STAGE_MODELS).map((row) => row.model))].sort();
}

/**
 * Snapshots that belong to an alias: the alias itself plus anything that is
 * the alias followed by a date. Deliberately strict, so gpt-4o does not
 * swallow gpt-4o-mini.
 */
function snapshotsForAlias(alias, models) {
  const exact = models.filter((m) => m.id === alias);
  const dated = models.filter((m) => {
    if (!m.id.startsWith(`${alias}-`)) return false;
    const tail = m.id.slice(alias.length + 1);
    return /^(\d{4}-\d{2}-\d{2}|\d{8})$/.test(tail);
  });
  const related = models.filter(
    (m) => m.id.startsWith(`${alias}-`) && !dated.includes(m) && m.id !== alias
  );
  return { exact, dated, related };
}

function iso(created) {
  return Number.isFinite(created) ? new Date(created * 1000).toISOString() : null;
}

async function fetchModels(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`GET /v1/models failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return Array.isArray(body?.data) ? body.data : [];
}

/**
 * Ask the provider what a single model id reports about itself. Some
 * deployments expose deprecation metadata here; most do not.
 */
async function fetchModelDetail(apiKey, id) {
  const res = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return { id, error: `${res.status}` };
  return res.json();
}

/**
 * What does the alias actually serve right now?
 *
 * The chat completion response echoes the concrete model id the request was
 * routed to, so a one-token call resolves the alias from the provider itself.
 * This is authoritative. It is NOT inferred from the system fingerprint,
 * which is a different identifier and does not give you the snapshot name.
 *
 * @returns {Promise<{ resolvedModel: ?string, systemFingerprint: ?string, error: ?string }>}
 */
async function probeAliasResolution(apiKey, alias) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: alias,
        messages: [{ role: "user", content: "hi" }],
        // Reasoning models spend tokens before emitting text and error out on
        // a budget of 1, so the probe needs headroom. Still a fraction of a cent.
        max_completion_tokens: 512,
      }),
    });
    const body = await res.json();
    if (!res.ok) return { resolvedModel: null, systemFingerprint: null, error: body?.error?.message ?? `${res.status}` };
    return {
      resolvedModel: typeof body?.model === "string" ? body.model : null,
      systemFingerprint: typeof body?.system_fingerprint === "string" ? body.system_fingerprint : null,
      error: null,
    };
  } catch (err) {
    return { resolvedModel: null, systemFingerprint: null, error: err?.message ?? "unknown" };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[snapshots] OPENAI_API_KEY is unset. Cannot query the provider.");
    process.exit(1);
  }

  const models = await fetchModels(apiKey);
  console.log(`[snapshots] provider returned ${models.length} models visible to this key`);

  const aliases = configuredAliases();
  const report = { queriedAt: new Date().toISOString(), totalModelsVisible: models.length, aliases: {} };

  for (const alias of aliases) {
    const { exact, dated, related } = snapshotsForAlias(alias, models);
    const detail = exact.length ? await fetchModelDetail(apiKey, alias) : null;
    const resolution = exact.length ? await probeAliasResolution(apiKey, alias) : null;

    report.aliases[alias] = {
      resolution,
      aliasVisible: exact.length > 0,
      aliasCreated: exact.length ? iso(exact[0].created) : null,
      aliasDetail: detail,
      datedSnapshots: dated
        .map((m) => ({ id: m.id, created: iso(m.created), ownedBy: m.owned_by }))
        .sort((a, b) => String(a.created).localeCompare(String(b.created))),
      relatedNonDated: related.map((m) => ({ id: m.id, created: iso(m.created) })),
    };

    console.log(`\n=== ${alias} ===`);
    console.log(`alias visible to key: ${exact.length > 0}`);
    console.log(`alias created:        ${report.aliases[alias].aliasCreated ?? "—"}`);
    console.log(
      `alias resolves to:    ${
        resolution?.resolvedModel ?? `not determinable (${resolution?.error ?? "no probe"})`
      }  [fingerprint ${resolution?.systemFingerprint ?? "none returned"}]`
    );
    console.log(`dated snapshots (${dated.length}):`);
    for (const s of report.aliases[alias].datedSnapshots) {
      console.log(`  ${s.id.padEnd(34)} created ${s.created}`);
    }
    if (related.length) {
      console.log(`related non-dated ids (${related.length}):`);
      for (const s of report.aliases[alias].relatedNonDated) {
        console.log(`  ${s.id.padEnd(34)} created ${s.created}`);
      }
    }
    // Deprecation metadata is reported only if the provider actually returns
    // it. Absence is reported as absence, not filled in from documentation.
    const deprecationKeys = Object.keys(detail || {}).filter((k) => /deprecat|retire|sunset/i.test(k));
    console.log(
      `deprecation metadata on the API: ${
        deprecationKeys.length ? deprecationKeys.join(", ") : "none returned"
      }`
    );
  }

  await writeFile(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\n[snapshots] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";
import { classifyExtractedSources, relevanceStepCopy, subjectForms } from "../lib/source-relevance.mjs";

function named(source) {
  if (typeof source?.name === "string" && source.name.trim()) return source.name.trim();
  if (typeof source?.title === "string" && source.title.trim()) return source.title.trim();
  return "Untitled source";
}

/**
 * B570. Classify sources against the investment or fund name using the text
 * the server extracts. No model call. A source that cannot be read is unread.
 */
async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = typeof body.name === "string" ? body.name : "";
  const requested = Array.isArray(body.sources) ? body.sources : [];
  if (!subjectForms(name).length) {
    return res.status(200).json({ ok: true, skipped: true, missing: [], unread: [], message: "" });
  }

  let prepared;
  try {
    prepared = await prepareUploadedSourcesForPipeline(requested);
  } catch (err) {
    console.error("[source-relevance] sources were not read", err?.message || err);
    const unread = requested.map((source) => ({ id: source?.id ?? null, name: named(source) }));
    return res.status(200).json({
      ok: true,
      skipped: false,
      missing: [],
      unread,
      message: relevanceStepCopy({ name: name.trim(), missing: [], unread }),
    });
  }

  const extracted = Array.isArray(prepared?.sources) ? prepared.sources : [];
  const report = classifyExtractedSources(extracted, name);
  if (prepared?.error) {
    const rest = requested.slice(extracted.length).map((source) => ({
      id: source?.id ?? null,
      name: named(source),
    }));
    report.unread = [...report.unread, ...rest];
    report.message = relevanceStepCopy({
      name: name.trim(),
      missing: report.missing,
      unread: report.unread,
    });
    console.error(
      "[source-relevance] a source was not read",
      prepared.error?.message || prepared.error?.code || "extraction failed"
    );
  }

  return res.status(200).json({ ok: true, ...report });
}

export default withCors(handler, {});

import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { renderDocx } from "../lib/export/render-docx.mjs";
import { renderPdf } from "../lib/export/render-pdf.mjs";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const format = body?.format === "docx" ? "docx" : body?.format === "pdf" ? "pdf" : "";
    if (!format) return res.status(400).json({ ok: false, error: "export: the format is missing" });
    const document = body?.document;
    if (!document || typeof document !== "object") {
      return res.status(400).json({ ok: false, error: "export: the document is missing" });
    }
    const sections = body?.sections && typeof body.sections === "object" ? body.sections : {};
    const filename = typeof body?.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : `export.${format}`;
    const buffer = format === "pdf" ? await renderPdf(document, sections) : await renderDocx(document, sections);
    res.setHeader("Content-Type", format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    const message = err?.message || "Export failed";
    const status = message.startsWith("export:") ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
}

export default withCors(handler, {});

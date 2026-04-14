import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = typeof body.name === "string" ? body.name : "draft-upload";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "text/plain";
  const text = typeof body.text === "string" ? body.text : "";
  const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
  const isText = mimeType === "text/plain" || /\.txt$/i.test(name);

  if (isText) {
    return res.status(200).json({ ok: true, text });
  }

  try {
    const prepared = await prepareUploadedSourcesForPipeline([
      {
        id: "assess_draft_upload",
        name,
        title: name,
        type: "file",
        mimeType,
        contentBase64,
      },
    ]);
    const extractedText = typeof prepared?.sources?.[0]?.text === "string" ? prepared.sources[0].text : "";
    return res.status(200).json({ ok: true, text: extractedText || "" });
  } catch (err) {
    return res.status(200).json({ ok: false, text: "", error: err?.message || "Could not extract draft text" });
  }
}

// api/import-web-helper-test.js
import { deriveQueryFromAsk } from "../lib/web.js";

export default async function handler(req, res) {
  const q = deriveQueryFromAsk({
    question: "CEO of Shopify?",
    title: "",
    draftText: "Shopify is a SaaS ecommerce platform.",
  });

  res.status(200).json({ ok: true, derived: q });
}

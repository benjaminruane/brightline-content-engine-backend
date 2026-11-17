// api/import-web-helper-test.js
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { deriveQueryFromAsk } from "../lib/web.js";


export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  const q = deriveQueryFromAsk({
    question: "CEO of Shopify?",
    title: "",
    draftText: "Shopify is a SaaS ecommerce platform.",
  });

  res.status(200).json({ ok: true, derived: q });
}

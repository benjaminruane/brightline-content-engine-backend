/**
 * House style for a request. The account's stored choices win.
 * With no account, the request's house style is used, or the new-account default.
 * Banned words are read from the account. A list sent with no account is refused out loud.
 */
import { findAccount } from "../db/accounts.mjs";
import { getSql } from "../db/client.mjs";
import { enterStyleFingerprint } from "../qc/llm-cache.mjs";
import { choicesFromAccountRow, resolveStyleChoices, styleFingerprint } from "./render.mjs";

export async function styleForRequest(account, body) {
  let choices = null;
  if (account?.accountId) {
    try {
      const row = await findAccount(getSql(), account.accountId);
      if (!row) console.error("[style] account was not found", account.accountId);
      else choices = choicesFromAccountRow(row);
    } catch (err) {
      console.error("[style] account style was not read", err?.message || err);
    }
  }
  if (!choices) {
    const sent = body?.houseStyle && typeof body.houseStyle === "object" ? body.houseStyle : null;
    choices = resolveStyleChoices(sent || {});
    if (Array.isArray(body?.bannedWords) && body.bannedWords.length) {
      console.error("[style] banned words were sent without an account and were not applied");
    }
  }
  enterStyleFingerprint(styleFingerprint(choices));
  return choices;
}

/**
 * B619. Email Ben when a friend signs up and when they run their first review.
 * Production only. Missing Resend settings skip. Failures never fail the user request.
 */
import { claimFirstReviewAlert, claimSignupAlert } from "./db/accounts.mjs";
import { appHomeUrl } from "./feedback-email.mjs";

export const ACCOUNT_ALERT_EMAIL_SKIPPED_LINE =
  "Account alert email skipped: Resend settings missing in this environment";

function resendConfig() {
  const key = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const from = typeof process.env.FEEDBACK_EMAIL_FROM === "string" ? process.env.FEEDBACK_EMAIL_FROM.trim() : "";
  const to = typeof process.env.FEEDBACK_EMAIL_TO === "string" ? process.env.FEEDBACK_EMAIL_TO.trim() : "";
  return { key, from, to };
}

export function alertsEnabledInEnv(env = process.env.VERCEL_ENV) {
  return env === "production";
}

function displayWho({ name, email }) {
  const whoName = typeof name === "string" ? name.trim() : "";
  const whoEmail = typeof email === "string" ? email.trim() : "";
  return whoName || whoEmail || "Someone";
}

function whoLine({ name, email }) {
  const whoName = typeof name === "string" ? name.trim() : "";
  const whoEmail = typeof email === "string" ? email.trim() : "";
  if (whoName && whoEmail) return `${whoName} (${whoEmail})`;
  if (whoName) return whoName;
  if (whoEmail) return whoEmail;
  return "Someone";
}

export function signupAlertSubject(account) {
  return `New sign-up: ${displayWho(account)}`;
}

export function signupAlertBody(account) {
  return [
    `${whoLine(account)} signed up to Brightline Content Engine.`,
    "",
    appHomeUrl(),
  ].join("\n");
}

function wordCountFromDraft(draft) {
  const text = typeof draft === "string" ? draft.trim() : "";
  if (!text) return null;
  return text.split(/\s+/).filter(Boolean).length;
}

function textTypeFromState(state) {
  const scenario = typeof state?.scenario === "string" ? state.scenario.trim() : "";
  if (scenario) return scenario;
  const selected = Array.isArray(state?.selectedTypes) ? state.selectedTypes[0] : null;
  return typeof selected === "string" && selected.trim() ? selected.trim() : "";
}

function overallLabelFromState(state) {
  const stamped = state?.analysisResult?.meta?.reviewSummary?.readiness;
  if (typeof stamped === "string" && stamped.trim()) return stamped.trim();
  const nested = state?.analysisResult?.reviewSummary?.readiness;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return "";
}

function reviewRefFromState(state, reviewId) {
  const stamped = typeof state?.reviewReference === "string" ? state.reviewReference.trim() : "";
  if (stamped) return stamped;
  const fromMeta = typeof state?.analysisResult?.meta?.reviewReference === "string"
    ? state.analysisResult.meta.reviewReference.trim()
    : "";
  if (fromMeta) return fromMeta;
  const id = typeof reviewId === "string" ? reviewId.trim() : "";
  return id || "";
}

/** One detail line from present fields only. No draft or source text. */
export function firstReviewDetailLine(state, reviewId) {
  const parts = [];
  const textType = textTypeFromState(state);
  if (textType) parts.push(textType);
  const words = wordCountFromDraft(state?.draftText);
  if (words != null) parts.push(`${words} words`);
  const label = overallLabelFromState(state);
  if (label) parts.push(label);
  const ref = reviewRefFromState(state, reviewId);
  if (ref) parts.push(`Ref ${ref}`);
  return parts.join(" · ");
}

export function firstReviewAlertSubject(account) {
  return `First review: ${displayWho(account)}`;
}

export function firstReviewAlertBody(account, state, reviewId) {
  const lines = [
    `${whoLine(account)} ran their first review.`,
  ];
  const detail = firstReviewDetailLine(state, reviewId);
  if (detail) lines.push(detail);
  lines.push(appHomeUrl());
  return lines.join("\n");
}

export function isCompletedReviewState(state) {
  if (!state || typeof state !== "object") return false;
  const stamped = typeof state.lastAnalysedAt === "string" ? state.lastAnalysedAt.trim() : "";
  return Boolean(stamped);
}

async function sendResendEmail({ subject, text, fetchImpl, force }) {
  if (!force && process.env.VITEST) return { sent: false, reason: "not_sent_in_test" };
  const { key, from, to } = resendConfig();
  if (!key || !from || !to) {
    console.log(ACCOUNT_ALERT_EMAIL_SKIPPED_LINE);
    return { sent: false, reason: "not_configured" };
  }
  const fetchFn = fetchImpl || fetch;
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) {
      console.warn("[account-alerts] email not sent:", res.status);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[account-alerts] email not sent:", err?.message || err);
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * @param {object} sql
 * @param {{ id: string, email?: string|null, name?: string|null, fetchImpl?: typeof fetch, force?: boolean, env?: string }} input
 */
export async function maybeSendSignupAlert(sql, input = {}) {
  try {
    if (!alertsEnabledInEnv(input.env ?? process.env.VERCEL_ENV)) {
      return { sent: false, reason: "not_production", claimed: false };
    }
    const claimed = await claimSignupAlert(sql, input.id);
    if (!claimed) return { sent: false, reason: "not_claimed", claimed: false };
    const account = {
      name: claimed.name ?? input.name ?? null,
      email: claimed.email ?? input.email ?? null,
    };
    const result = await sendResendEmail({
      subject: signupAlertSubject(account),
      text: signupAlertBody(account),
      fetchImpl: input.fetchImpl,
      force: input.force === true,
    });
    return { ...result, claimed: true };
  } catch (err) {
    console.warn("[account-alerts] signup alert failed", err?.message || err);
    return { sent: false, reason: "error", claimed: false };
  }
}

/**
 * @param {object} sql
 * @param {{
 *   id: string,
 *   email?: string|null,
 *   name?: string|null,
 *   state?: object,
 *   reviewId?: string,
 *   fetchImpl?: typeof fetch,
 *   force?: boolean,
 *   env?: string,
 * }} input
 */
export async function maybeSendFirstReviewAlert(sql, input = {}) {
  try {
    if (!alertsEnabledInEnv(input.env ?? process.env.VERCEL_ENV)) {
      return { sent: false, reason: "not_production", claimed: false };
    }
    if (!isCompletedReviewState(input.state)) {
      return { sent: false, reason: "not_completed", claimed: false };
    }
    const claimed = await claimFirstReviewAlert(sql, input.id);
    if (!claimed) return { sent: false, reason: "not_claimed", claimed: false };
    const account = {
      name: claimed.name ?? input.name ?? null,
      email: claimed.email ?? input.email ?? null,
    };
    const result = await sendResendEmail({
      subject: firstReviewAlertSubject(account),
      text: firstReviewAlertBody(account, input.state, input.reviewId),
      fetchImpl: input.fetchImpl,
      force: input.force === true,
    });
    return { ...result, claimed: true };
  } catch (err) {
    console.warn("[account-alerts] first review alert failed", err?.message || err);
    return { sent: false, reason: "error", claimed: false };
  }
}

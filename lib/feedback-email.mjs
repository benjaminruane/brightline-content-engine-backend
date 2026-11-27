/**
 * B543. Tell Ben about a new piece of feedback. A missing key or a failed
 * send is logged and does not fail the save.
 */
import { allowedOrigins } from "./http/frontend-origins.mjs";

/** App origin used in Ben emails. Same source as feedbackInboxUrl, without the inbox query. */
export function appHomeUrl() {
  const configured = typeof process.env.FEEDBACK_APP_URL === "string" ? process.env.FEEDBACK_APP_URL.trim() : "";
  const origin = configured || allowedOrigins()[0] || "";
  return String(origin).replace(/\/$/, "");
}

export function feedbackInboxUrl() {
  return `${appHomeUrl()}/?feedback=inbox`;
}

export function feedbackEmailBody({ senderName, senderEmail, comment, detailsLine }) {
  const who = senderName || senderEmail || "Someone";
  const from = senderEmail ? `${who} (${senderEmail})` : who;
  const details = typeof detailsLine === "string" && detailsLine.trim() ? detailsLine.trim() : "";
  const wrote = typeof comment === "string" ? comment.trim() : "";
  return [
    `${from} sent feedback.`,
    "",
    wrote,
    "",
    details,
    "",
    "Technical details attached in the app.",
    "",
    feedbackInboxUrl(),
  ].filter((line, index, list) => line !== "" || (index > 0 && list[index - 1] !== "")).join("\n");
}

export function problemEmailText({ name, route, message, build }) {
  const who = String(name || "someone").trim() || "someone";
  const short = String(message || "failed").replace(/\s+/g, " ").trim().slice(0, 120);
  const built = String(build || "unavailable").trim() || "unavailable";
  return `Problem for ${who}: ${route} ${short}, build ${built}`;
}

export const PROBLEM_EMAIL_SKIPPED_LINE = "Problem email skipped: Resend settings missing in this environment";
export const FEEDBACK_EMAIL_SKIPPED_LINE = "Feedback email skipped: Resend settings missing in this environment";
export const EMAIL_NOT_SENT_LABEL = "Email not sent (settings missing)";

export function emailNotSentLabel(row) {
  const skip = row?.emailSkip ?? row?.email_skip;
  return skip === "settings" ? EMAIL_NOT_SENT_LABEL : "";
}

function resendConfig() {
  const key = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const from = typeof process.env.FEEDBACK_EMAIL_FROM === "string" ? process.env.FEEDBACK_EMAIL_FROM.trim() : "";
  const to = typeof process.env.FEEDBACK_EMAIL_TO === "string" ? process.env.FEEDBACK_EMAIL_TO.trim() : "";
  return { key, from, to };
}

/**
 * @param {{ fetchImpl?: typeof fetch, force?: boolean, senderName?: string, senderEmail?: string, comment?: string, detailsLine?: string }} input
 */
export async function sendFeedbackEmail(input = {}) {
  if (!input.force && process.env.VITEST) return { sent: false, reason: "not_sent_in_test" };
  const { key, from, to } = resendConfig();
  if (!key || !from || !to) {
    console.log(FEEDBACK_EMAIL_SKIPPED_LINE);
    return { sent: false, reason: "not_configured" };
  }
  const fetchImpl = input.fetchImpl || fetch;
  const senderName = typeof input.senderName === "string" ? input.senderName.trim() : "";
  const senderEmail = typeof input.senderEmail === "string" ? input.senderEmail.trim() : "";
  const who = senderName || senderEmail || "Someone";
  const payload = {
    from,
    to: [to],
    subject: `Feedback from ${who}`,
    text: feedbackEmailBody(input),
  };
  if (senderEmail) payload.reply_to = senderEmail;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[feedback] email not sent:", res.status);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[feedback] email not sent:", err?.message || err);
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * One short line. No draft and no source text. A missing Resend setting
 * is skipped the same way as feedback.
 */
export async function sendProblemEmail(input = {}) {
  if (!input.force && process.env.VITEST) return { sent: false, reason: "not_sent_in_test" };
  const { key, from, to } = resendConfig();
  if (!key || !from || !to) {
    console.log(PROBLEM_EMAIL_SKIPPED_LINE);
    return { sent: false, reason: "not_configured" };
  }
  const text = problemEmailText(input);
  const fetchImpl = input.fetchImpl || fetch;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject: text, text }),
    });
    if (!res.ok) {
      console.warn("[feedback] email not sent:", res.status);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[feedback] email not sent:", err?.message || err);
    return { sent: false, reason: "send_failed" };
  }
}

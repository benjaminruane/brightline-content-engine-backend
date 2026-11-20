/**
 * B543. Tell Ben about a new piece of feedback. A missing key or a failed
 * send is logged and does not fail the save.
 */
import { allowedOrigins } from "./http/frontend-origins.mjs";

export function feedbackInboxUrl() {
  const configured = typeof process.env.FEEDBACK_APP_URL === "string" ? process.env.FEEDBACK_APP_URL.trim() : "";
  const origin = configured || allowedOrigins()[0];
  return `${origin.replace(/\/$/, "")}/?feedback=inbox`;
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
    feedbackInboxUrl(),
  ].filter((line, index, list) => line !== "" || (index > 0 && list[index - 1] !== "")).join("\n");
}

/**
 * @param {{ fetchImpl?: typeof fetch, force?: boolean, senderName?: string, senderEmail?: string, comment?: string, detailsLine?: string }} input
 */
export async function sendFeedbackEmail(input = {}) {
  if (!input.force && process.env.VITEST) return { sent: false, reason: "not_sent_in_test" };
  const key = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const from = typeof process.env.FEEDBACK_EMAIL_FROM === "string" ? process.env.FEEDBACK_EMAIL_FROM.trim() : "";
  const to = typeof process.env.FEEDBACK_EMAIL_TO === "string" ? process.env.FEEDBACK_EMAIL_TO.trim() : "";
  if (!key || !from || !to) {
    console.warn("[feedback] email not sent: RESEND_API_KEY, FEEDBACK_EMAIL_FROM, or FEEDBACK_EMAIL_TO is missing");
    return { sent: false, reason: "not_configured" };
  }
  const fetchImpl = input.fetchImpl || fetch;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "New Content Engine feedback",
        text: feedbackEmailBody(input),
      }),
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

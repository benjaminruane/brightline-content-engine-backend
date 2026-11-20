import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { feedbackEmailBody, sendFeedbackEmail } from "../lib/feedback-email.mjs";

describe("B543 feedback email", () => {
  test("the email names the sender, quotes the comment, includes the details line, and links to the inbox", () => {
    const body = feedbackEmailBody({
      senderName: "Ada",
      senderEmail: "ada@example.com",
      comment: "The counts were hard to read.",
      detailsLine: "Dear investors... | Investor letter | Other update | 2 words | v1, reviewed: Needs a look | Build dev",
    });
    assert.match(body, /Ada \(ada@example.com\)/);
    assert.match(body, /The counts were hard to read\./);
    assert.match(body, /Dear investors\.\.\./);
    assert.match(body, /feedback=inbox/);
  });

  test("a missing key does not throw, and the caller can still keep the saved feedback", async () => {
    const previous = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await sendFeedbackEmail({ force: true, comment: "Hello" });
    if (previous == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
    assert.equal(result.sent, false);
    assert.equal(result.reason, "not_configured");
  });

  test("a failed send is reported and does not throw", async () => {
    const saved = {
      key: process.env.RESEND_API_KEY,
      from: process.env.FEEDBACK_EMAIL_FROM,
      to: process.env.FEEDBACK_EMAIL_TO,
    };
    process.env.RESEND_API_KEY = "test-key";
    process.env.FEEDBACK_EMAIL_FROM = "from@example.com";
    process.env.FEEDBACK_EMAIL_TO = "to@example.com";
    const result = await sendFeedbackEmail({
      force: true,
      comment: "Hello",
      fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    for (const [name, value] of Object.entries({ RESEND_API_KEY: saved.key, FEEDBACK_EMAIL_FROM: saved.from, FEEDBACK_EMAIL_TO: saved.to })) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
    assert.equal(result.sent, false);
    assert.equal(result.reason, "send_failed");
  });
});

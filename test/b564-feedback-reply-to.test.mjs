/**
 * B564. Reply goes to the friend who sent the feedback.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { feedbackEmailBody, sendFeedbackEmail } from "../lib/feedback-email.mjs";

test("the reply address is the sender, and the subject names them", async () => {
  const saved = {
    key: process.env.RESEND_API_KEY,
    from: process.env.FEEDBACK_EMAIL_FROM,
    to: process.env.FEEDBACK_EMAIL_TO,
  };
  process.env.RESEND_API_KEY = "test-key";
  process.env.FEEDBACK_EMAIL_FROM = "from@example.com";
  process.env.FEEDBACK_EMAIL_TO = "to@example.com";
  let sent;
  const result = await sendFeedbackEmail({
    force: true,
    senderName: "Ada",
    senderEmail: "ada@example.com",
    comment: "The counts were hard to read.",
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200 };
    },
  });
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "test-key";
  assert.equal(result.sent, true);
  assert.equal(sent.reply_to, "ada@example.com");
  assert.equal(sent.subject, "Feedback from Ada");
  assert.match(sent.text, /feedback=inbox/);
  assert.match(feedbackEmailBody({
    senderName: "Ada",
    senderEmail: "ada@example.com",
    comment: "Hello",
  }), /feedback=inbox/);
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: saved.key,
    FEEDBACK_EMAIL_FROM: saved.from,
    FEEDBACK_EMAIL_TO: saved.to,
  })) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
});

test("a sender with no name is still the reply address, and a missing email sets no reply address", async () => {
  const saved = {
    key: process.env.RESEND_API_KEY,
    from: process.env.FEEDBACK_EMAIL_FROM,
    to: process.env.FEEDBACK_EMAIL_TO,
  };
  process.env.RESEND_API_KEY = "test-key";
  process.env.FEEDBACK_EMAIL_FROM = "from@example.com";
  process.env.FEEDBACK_EMAIL_TO = "to@example.com";
  let sent;
  await sendFeedbackEmail({
    force: true,
    senderEmail: "ada@example.com",
    comment: "Hello",
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(sent.subject, "Feedback from ada@example.com");
  assert.equal(sent.reply_to, "ada@example.com");
  let unnamed;
  await sendFeedbackEmail({
    force: true,
    comment: "Hello",
    fetchImpl: async (_url, init) => {
      unnamed = JSON.parse(init.body);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(unnamed.subject, "Feedback from Someone");
  assert.equal(Object.hasOwn(unnamed, "reply_to"), false);
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: saved.key,
    FEEDBACK_EMAIL_FROM: saved.from,
    FEEDBACK_EMAIL_TO: saved.to,
  })) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
});

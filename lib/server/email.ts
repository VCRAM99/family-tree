import "server-only";

import { Resend } from "resend";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sends mail through Resend when RESEND_API_KEY is set.
 * Otherwise prints the message, including verification and reset links, for local development.
 */
export async function sendEmail(email: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[email] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is required when RESEND_API_KEY is set");
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

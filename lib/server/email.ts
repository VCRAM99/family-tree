import "server-only";

import { waitUntil } from "@vercel/functions";
import { Resend } from "resend";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailKind = "verification" | "reset" | "invite" | "suggestion";

/**
 * Sends mail through Resend. Production without a key fails without logging
 * the message. Development without a key prints the message for local use.
 */
export async function sendEmail(email: OutboundEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[email] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
      return false;
    }
    if (process.env.NODE_ENV === "production") {
      throw Object.assign(new Error("RESEND_API_KEY is required"), { name: "MissingApiKey" });
    }
    return false;
  }

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw Object.assign(new Error("EMAIL_FROM is required when RESEND_API_KEY is set"), { name: "MissingFrom" });
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
    const failure = new Error("Could not send email");
    failure.name = result.error.name || "ResendError";
    throw Object.assign(failure, { statusCode: result.error.statusCode });
  }
  return true;
}

/** Keep the serverless invocation alive without blocking the response. */
export function deliverEmail(kind: EmailKind, email: OutboundEmail): void {
  const task = sendEmail(email).then(
    (sent) => {
      if (sent) console.info(`[email] ${kind} sent`);
    },
    (error: unknown) => {
      const name = error instanceof Error ? error.name : "Error";
      const statusCode = typeof error === "object" && error && "statusCode" in error ? String(error.statusCode) : "";
      console.error(`[email] ${kind} failed`, name, statusCode);
    },
  );
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

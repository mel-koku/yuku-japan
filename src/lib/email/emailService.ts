import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

type InquiryEmailData = {
  personName: string;
  personType: string;
  userEmail: string;
  preferredDatesStart?: string;
  preferredDatesEnd?: string;
  groupSize?: number;
  message?: string;
};

/**
 * Send admin notification about a new booking inquiry.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */
export async function sendInquiryNotification(
  data: InquiryEmailData
): Promise<void> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    logger.warn(
      "RESEND_API_KEY not set — skipping admin inquiry notification email"
    );
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const dates =
      data.preferredDatesStart && data.preferredDatesEnd
        ? `${data.preferredDatesStart} to ${data.preferredDatesEnd}`
        : data.preferredDatesStart ?? "Not specified";

    await resend.emails.send({
      from: "Yuku Japan <noreply@yukujapan.com>",
      to: "inquiries@yukujapan.com",
      subject: `New inquiry for ${data.personName} (${data.personType})`,
      text: [
        `New booking inquiry received.`,
        ``,
        `Expert: ${data.personName} (${data.personType})`,
        `From: ${data.userEmail}`,
        `Dates: ${dates}`,
        `Group size: ${data.groupSize ?? "Not specified"}`,
        ``,
        `Message:`,
        data.message || "(no message)",
      ].join("\n"),
    });
  } catch (err) {
    logger.error(
      "Failed to send inquiry notification email",
      err instanceof Error ? err : new Error(String(err))
    );
  }
}

/**
 * Send confirmation email to the user who submitted an inquiry.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */
export async function sendInquiryConfirmation(
  data: InquiryEmailData
): Promise<void> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    logger.warn(
      "RESEND_API_KEY not set — skipping user inquiry confirmation email"
    );
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: "Yuku Japan <noreply@yukujapan.com>",
      to: data.userEmail,
      subject: `Your inquiry for ${data.personName} has been received`,
      text: [
        `Thanks for your interest in booking with ${data.personName}.`,
        ``,
        `We've received your inquiry and will get back to you within 48 hours.`,
        ``,
        `Yuku Japan`,
      ].join("\n"),
    });
  } catch (err) {
    logger.error(
      "Failed to send inquiry confirmation email",
      err instanceof Error ? err : new Error(String(err))
    );
  }
}

type ConciergeInquiryEmailData = {
  name: string;
  email: string;
  message: string | null;
  createdAt: string;
};

/**
 * Send admin notification about a new Yuku Concierge lead.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */
export async function sendConciergeInquiryNotification(
  data: ConciergeInquiryEmailData
): Promise<void> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    logger.warn(
      "RESEND_API_KEY not set — skipping concierge inquiry notification email"
    );
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: "Yuku Japan <noreply@yukujapan.com>",
      to: "concierge@yukujapan.com",
      replyTo: data.email,
      subject: `[Concierge] New inquiry — ${data.name}`,
      text: [
        `New Yuku Concierge inquiry received.`,
        ``,
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Submitted: ${data.createdAt}`,
        ...(data.message ? [``, `Message:`, data.message] : []),
        ``,
        `Reply to this email to contact them directly.`,
      ].join("\n"),
    });
  } catch (err) {
    logger.error(
      "Failed to send concierge inquiry notification email",
      err instanceof Error ? err : new Error(String(err))
    );
  }
}

type ContactEmailData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
};

/**
 * Send contact form notification to the team.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */
export async function sendContactNotification(
  data: ContactEmailData
): Promise<void> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    logger.warn(
      "RESEND_API_KEY not set — skipping contact notification email"
    );
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const attachments = data.attachment
      ? [
          {
            filename: data.attachment.filename,
            content: data.attachment.content,
            contentType: data.attachment.contentType,
          },
        ]
      : undefined;

    await resend.emails.send({
      from: "Yuku Japan <noreply@yukujapan.com>",
      to: "hello@yukujapan.com",
      replyTo: data.email,
      subject: `[Contact] ${data.subject}`,
      text: [
        `New contact form submission.`,
        ``,
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Subject: ${data.subject}`,
        ``,
        `Message:`,
        data.message,
      ].join("\n"),
      attachments,
    });
  } catch (err) {
    logger.error(
      "Failed to send contact notification email",
      err instanceof Error ? err : new Error(String(err))
    );
  }
}

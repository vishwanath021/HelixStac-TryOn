/** True when a production sender is configured. Dev may still show a link on screen. */
export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

export const MAIL_NOT_CONFIGURED =
  "Email is not configured. Set RESEND_API_KEY or SMTP_URL, and EMAIL_FROM. Until then, reset links and magic links are not sent. An operator can set a password with node scripts/create-super-admin.mjs.";

/** Sends one plain-text message. The body can contain a one-time link, so callers must not log it. */
export async function sendMail(to: string, subject: string, text: string) {
  const from = process.env.EMAIL_FROM || "Lookuvi <noreply@localhost>";
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return res.ok;
  }
  const url = process.env.SMTP_URL;
  if (!url) return false;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({ from, to, subject, text });
  return true;
}

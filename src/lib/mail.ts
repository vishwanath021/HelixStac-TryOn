/** Sends one plain-text message. The body can contain a one-time link, so callers must not log it. */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) return false;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env.EMAIL_FROM || "Lookuvi <noreply@localhost>",
    to,
    subject,
    text,
  });
  return true;
}

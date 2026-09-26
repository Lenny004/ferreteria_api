import nodemailer from "nodemailer";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

/**
 * Envía correo si hay SMTP configurado; si no, solo registra en consola (dev).
 * Nunca lanza por fallo de transporte en producción no crítica — el caller decide.
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean }> {
  if (!smtpConfigured()) {
    console.info("[mail] SMTP no configurado — mensaje no enviado", {
      to: input.to,
      subject: input.subject,
    });
    return { sent: false };
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? `<pre>${input.text}</pre>`,
  });
  return { sent: true };
}

export function buildPasswordResetEmail(params: {
  audience: "WEB_USER" | "SHOP_CUSTOMER";
  resetToken: string;
}): { subject: string; text: string } {
  const base =
    params.audience === "SHOP_CUSTOMER"
      ? (process.env.SHOP_APP_URL ?? "http://localhost:3000/tienda")
      : (process.env.ADMIN_APP_URL ?? "http://localhost:3000");
  const path =
    params.audience === "SHOP_CUSTOMER"
      ? `/restablecer-contrasena?token=${params.resetToken}`
      : `/restablecer-contrasena?token=${params.resetToken}`;
  const link = `${base.replace(/\/$/, "")}${path}`;
  return {
    subject: "Restablecer contraseña — Ferreteria",
    text: `Recibimos una solicitud para restablecer tu contraseña.\n\nAbre este enlace (válido 1 hora):\n${link}\n\nSi no solicitaste esto, ignora el mensaje.`,
  };
}

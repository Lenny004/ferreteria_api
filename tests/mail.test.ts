import { afterEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue(undefined);
  const createTransport = vi.fn(() => ({ sendMail }));
  return { createTransport, sendMail };
});

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import { buildPasswordResetEmail, sendMail as sendConfiguredMail } from "../src/lib/mail.js";

const originalEnv = { ...process.env };

/** Restaura las variables de entorno al estado capturado antes de cada prueba. */
function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

afterEach(() => {
  restoreEnvironment();
  vi.clearAllMocks();
});

describe("sendMail", () => {
  it("no crea transporte cuando SMTP_HOST o SMTP_FROM no están configurados", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;

    const result = await sendConfiguredMail({
      to: "destino@example.com",
      subject: "Asunto",
      text: "texto",
    });

    expect(result).toEqual({ sent: false });
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ["465", true],
    ["587", false],
  ])("configura secure según el puerto SMTP %s", async (smtpPort, secure) => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    process.env.SMTP_PORT = smtpPort;

    await sendConfiguredMail({
      to: "destino@example.com",
      subject: "Asunto",
      text: "texto",
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: Number(smtpPort),
      secure,
      auth: undefined,
    });
  });

  it.each([
    ["smtp-user", undefined],
    [undefined, "smtp-pass"],
  ])("omite auth si falta SMTP_USER o SMTP_PASS", async (user, pass) => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    if (user === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = user;
    if (pass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = pass;

    await sendConfiguredMail({
      to: "destino@example.com",
      subject: "Asunto",
      text: "texto",
    });

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("respeta SMTP_SECURE=true y agrega auth solo con usuario y contraseña", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";

    await sendConfiguredMail({
      to: "destino@example.com",
      subject: "Asunto",
      text: "texto",
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: true,
      auth: { user: "smtp-user", pass: "smtp-pass" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@example.com",
      to: "destino@example.com",
      subject: "Asunto",
      text: "texto",
      html: "<pre>texto</pre>",
    });
  });
});

describe("buildPasswordResetEmail", () => {
  it.each([
    ["WEB_USER", "ADMIN_APP_URL", "https://admin.example.com/", "https://admin.example.com/restablecer-contrasena?token=token-web"],
    ["SHOP_CUSTOMER", "SHOP_APP_URL", "https://shop.example.com/", "https://shop.example.com/restablecer-contrasena?token=token-shop"],
  ] as const)("usa la URL de %s sin barra final", (audience, envKey, baseUrl, expectedLink) => {
    process.env[envKey] = baseUrl;

    const email = buildPasswordResetEmail({
      audience,
      resetToken: audience === "WEB_USER" ? "token-web" : "token-shop",
    });

    expect(email.text).toContain(expectedLink);
  });
});

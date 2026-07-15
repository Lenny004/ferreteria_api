import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError, BadRequestError, ConflictError } from "../../shared/errors.js";
import { signAccessToken } from "../../shared/jwt.js";
import { buildPasswordResetEmail, sendMail } from "../../lib/mail.js";

const shopCustomerSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  onboardingCompletedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const shopAuthService = {
  async register(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string | null;
  }) {
    const email = data.email.trim().toLowerCase();
    const existing = await prisma.shopCustomer.findUnique({ where: { email } });
    if (existing) throw new ConflictError("Ya existe una cuenta con ese correo");

    if (data.password.length < 8) {
      throw new BadRequestError("La contraseña debe tener al menos 8 caracteres");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const customer = await prisma.shopCustomer.create({
      data: {
        email,
        passwordHash,
        fullName: data.fullName.trim(),
        phone: data.phone?.trim() || null,
      },
      select: shopCustomerSelect,
    });

    const accessToken = signAccessToken({ userId: customer.id, role: "SHOP" });
    return { accessToken, customer };
  },

  async login(email: string, password: string) {
    const customer = await prisma.shopCustomer.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!customer || !customer.isActive) {
      throw new AppError("INVALID_CREDENTIALS", "Credenciales inválidas", 401);
    }
    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) {
      throw new AppError("INVALID_CREDENTIALS", "Credenciales inválidas", 401);
    }

    const lastLoginAt = new Date();
    await prisma.shopCustomer.update({
      where: { id: customer.id },
      data: { lastLoginAt, updatedAt: lastLoginAt },
    });

    const accessToken = signAccessToken({ userId: customer.id, role: "SHOP" });
    return {
      accessToken,
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
        phone: customer.phone,
        onboardingCompletedAt: customer.onboardingCompletedAt,
        lastLoginAt,
      },
    };
  },

  async me(customerId: string) {
    const customer = await prisma.shopCustomer.findUnique({
      where: { id: customerId },
      select: shopCustomerSelect,
    });
    if (!customer || !customer.isActive) {
      throw new AppError("UNAUTHORIZED", "Sesión inválida", 401);
    }
    return customer;
  },

  async updateProfile(
    customerId: string,
    data: Partial<{ fullName: string; phone: string | null }>,
  ) {
    await this.me(customerId);
    return prisma.shopCustomer.update({
      where: { id: customerId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        updatedAt: new Date(),
      },
      select: shopCustomerSelect,
    });
  },

  async completeOnboarding(customerId: string) {
    await this.me(customerId);
    return prisma.shopCustomer.update({
      where: { id: customerId },
      data: { onboardingCompletedAt: new Date(), updatedAt: new Date() },
      select: shopCustomerSelect,
    });
  },

  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    const customer = await prisma.shopCustomer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.isActive) {
      throw new AppError("UNAUTHORIZED", "Sesión inválida", 401);
    }
    const ok = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!ok) throw new BadRequestError("Contraseña actual incorrecta");
    if (newPassword.length < 8) {
      throw new BadRequestError("La nueva contraseña debe tener al menos 8 caracteres");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.shopCustomer.update({
      where: { id: customerId },
      data: { passwordHash, updatedAt: new Date() },
    });
    return { changed: true };
  },

  async forgotPassword(email: string) {
    const customer = await prisma.shopCustomer.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    // Respuesta genérica para no filtrar existencia de cuentas
    const generic = {
      message:
        "Si el correo existe, recibirás instrucciones para restablecer la contraseña.",
    };
    if (!customer || !customer.isActive) return generic;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.updateMany({
      where: {
        audience: "SHOP_CUSTOMER",
        userId: customer.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: {
        audience: "SHOP_CUSTOMER",
        userId: customer.id,
        tokenHash,
        expiresAt,
      },
    });

    const mail = buildPasswordResetEmail({
      audience: "SHOP_CUSTOMER",
      resetToken: rawToken,
    });
    const { sent } = await sendMail({
      to: customer.email,
      subject: mail.subject,
      text: mail.text,
    });

    if (process.env.NODE_ENV !== "production") {
      return { ...generic, resetToken: rawToken, expiresAt, emailSent: sent };
    }
    return { ...generic, emailSent: sent };
  },

  async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw new BadRequestError("La nueva contraseña debe tener al menos 8 caracteres");
    }
    const tokenHash = hashToken(token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (
      !record ||
      record.audience !== "SHOP_CUSTOMER" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestError("Token de recuperación inválido o expirado");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.shopCustomer.update({
        where: { id: record.userId },
        data: { passwordHash, updatedAt: new Date() },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { reset: true };
  },
};

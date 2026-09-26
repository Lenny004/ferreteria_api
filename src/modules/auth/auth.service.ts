import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError, BadRequestError } from "../../shared/errors.js";
import { signAccessToken } from "../../shared/jwt.js";
import { buildPasswordResetEmail, sendMail } from "../../lib/mail.js";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const webUserPublicSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  employeeId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export const authService = {
  async login(login: string, password: string) {
    const user = await prisma.webUser.findFirst({
      where: {
        OR: [{ email: login }, { username: login }],
      },
    });

    if (!user || !user.isActive) {
      throw new AppError("INVALID_CREDENTIALS", "Credenciales inválidas", 401);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new AppError("INVALID_CREDENTIALS", "Credenciales inválidas", 401);
    }

    const lastLoginAt = new Date();
    await prisma.webUser.update({
      where: { id: user.id },
      data: { lastLoginAt, updatedAt: lastLoginAt },
    });

    const accessToken = signAccessToken({ userId: user.id, role: user.role });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        lastLoginAt,
      },
    };
  },

  async me(userId: string) {
    const user = await prisma.webUser.findUnique({
      where: { id: userId },
      select: webUserPublicSelect,
    });

    if (!user || !user.isActive) {
      throw new AppError("UNAUTHORIZED", "Sesión inválida", 401);
    }

    return user;
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.webUser.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new AppError("UNAUTHORIZED", "Sesión inválida", 401);
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestError("Contraseña actual incorrecta");
    }

    if (newPassword.length < 8) {
      throw new BadRequestError("La nueva contraseña debe tener al menos 8 caracteres");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.webUser.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });

    return { changed: true };
  },

  async forgotPassword(email: string) {
    const generic = {
      message:
        "Si el correo existe, recibirás instrucciones para restablecer la contraseña.",
    };
    const user = await prisma.webUser.findFirst({
      where: { email: email.trim().toLowerCase(), isActive: true },
    });
    if (!user) return generic;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.updateMany({
      where: {
        audience: "WEB_USER",
        userId: user.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: {
        audience: "WEB_USER",
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const mail = buildPasswordResetEmail({
      audience: "WEB_USER",
      resetToken: rawToken,
    });
    const { sent } = await sendMail({
      to: user.email,
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
      record.audience !== "WEB_USER" ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestError("Token de recuperación inválido o expirado");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.webUser.update({
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

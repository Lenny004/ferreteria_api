import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError, BadRequestError } from "../../shared/errors.js";
import { signAccessToken } from "../../shared/jwt.js";

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
};

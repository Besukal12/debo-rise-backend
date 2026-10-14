import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { ConflictError, UnauthorizedError } from "../../core/CustomError.js";
import { checkPassword, hashPassword } from "../../lib/hash.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from "../../lib/token.js";
import {
  changePasswordSchema,
  registerSchema,
  loginSchema,
  updateProfileSchema,
} from "./auth.schema.js";
import { parseHelpImage, uploadHelpImage } from "../help/help.upload.js";
import {
  assertTrustedOrigin,
  validationError,
  setRefreshCookie,
  refreshCookieName,
  clearRefreshCookie,
} from "./auth.service.js";

const currentUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  age: true,
  ageGroup: true,
  educationLevel: true,
  workStatus: true,
  avatarUrl: true,
  schoolOrOrg: true,
  location: true,
  language: true,
  dailyReminders: true,
  helpNotify: true,
  isPrivate: true,
  trackId: true,
  parentConsent: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function RegisterUser(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const data = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existingUser)
    throw new ConflictError("An account with this email already exists");

  const passwordHash = await hashPassword(data.password);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          fullName: data.fullName,
          age: data.age,
          ageGroup: data.age < 18 ? "MINOR" : "ADULT",
          role: "STUDENT",
          educationLevel: data.educationLevel,
          workStatus: data.workStatus,
          guardianName: data.guardianName,
          guardianEmail: data.guardianEmail,
          guardianPhone: data.guardianPhone,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          ageGroup: true,
          parentConsent: true,
          createdAt: true,
        },
      });

      const refreshToken = createRefreshToken(user.id);
      const expiresAt = verifyRefreshToken(refreshToken).expiresAt;

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt,
        },
      });

      return { user, refreshToken };
    });

    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      message: "Registration successful",
      user: result.user,
      accessToken: createAccessToken(result.user.id),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictError("An account with this email already exists");
    throw error;
  }
}

export async function LoginUser(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      passwordHash: true,
      deletedAt: true,
    },
  });

  if (
    !user ||
    user.deletedAt ||
    !(await checkPassword(parsed.data.password, user.passwordHash))
  )
    throw new UnauthorizedError("Email or password is incorrect");

  const refreshToken = createRefreshToken(user.id);
  const expiresAt = verifyRefreshToken(refreshToken).expiresAt;

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    },
  });

  setRefreshCookie(res, refreshToken);
  res.status(200).json({
    message: "Login successful",
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
    accessToken: createAccessToken(user.id),
  });
}

export async function RefreshSession(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);

  const token = req.cookies?.[refreshCookieName];
  if (typeof token !== "string")
    throw new UnauthorizedError("Authentication required");

  const { userId, expiresAt } = verifyRefreshToken(token);
  const tokenHash = hashRefreshToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    clearRefreshCookie(res);
    throw new UnauthorizedError("Authentication required");
  }

  if (
    !stored ||
    stored.userId !== userId ||
    stored.expiresAt <= new Date() ||
    expiresAt <= new Date()
  ) {
    if (!stored) await prisma.refreshToken.deleteMany({ where: { userId } });
    clearRefreshCookie(res);
    throw new UnauthorizedError(
      "Refresh token is invalid or has already been used",
    );
  }

  const nextToken = createRefreshToken(userId);
  const nextExpiry = verifyRefreshToken(nextToken).expiresAt;

  const rotated = await prisma.$transaction(async (tx) => {
    const removed = await tx.refreshToken.deleteMany({
      where: { id: stored.id },
    });
    if (removed.count !== 1) return false;
    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(nextToken),
        expiresAt: nextExpiry,
      },
    });
    return true;
  });

  if (!rotated) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    clearRefreshCookie(res);
    throw new UnauthorizedError("Refresh token has already been used");
  }

  setRefreshCookie(res, nextToken);
  res.status(200).json({ accessToken: createAccessToken(userId) });
}

export async function LogoutUser(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);

  const token = req.cookies?.[refreshCookieName];
  if (typeof token === "string")
    await prisma.refreshToken.deleteMany({
      where: { tokenHash: hashRefreshToken(token) },
    });

  clearRefreshCookie(res);
  res.status(204).end();
}

export async function ChangePassword(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);

  const parsed = changePasswordSchema.safeParse(req.body);

  if (!parsed.success) throw validationError(parsed.error.issues);
  if (!req.auth) throw new UnauthorizedError("Authentication required");

  const user = await prisma.user.findFirst({
    where: { id: req.auth.userId, deletedAt: null },
    select: { id: true, passwordHash: true },
  });

  if (
    !user ||
    !(await checkPassword(parsed.data.currentPassword, user.passwordHash))
  ) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);

  clearRefreshCookie(res);
  res.status(200).json({
    message: "Password changed. Please sign in again on your other devices.",
  });
}

export async function GetCurrentUser(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");

  const user = await prisma.user.findFirst({
    where: { id: req.auth.userId, deletedAt: null },
    select: currentUserSelect,
  });

  if (!user) throw new UnauthorizedError("Authentication required");

  res.status(200).json({ user });
}

export async function UpdateCurrentUser(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const user = await prisma.user.update({
    where: { id: req.auth.userId },
    data: parsed.data,
    select: currentUserSelect,
  });
  res.status(200).json({ user });
}

export async function UploadCurrentUserAvatar(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const image = parseHelpImage(req);
  const avatarUrl = await uploadHelpImage(
    image.buffer,
    image.contentType,
    `debo-rise/avatars/${req.auth.userId}`,
  );

  const user = await prisma.user.update({
    where: { id: req.auth.userId },
    data: { avatarUrl },
    select: currentUserSelect,
  });
  res.status(200).json({ user });
}

import { Request, Response } from "express";
import { env } from "../../config/env.js";
import { BadRequestError, ForbiddenError } from "../../core/CustomError.js";

export const refreshCookieName = "debo_refresh";
export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function assertTrustedOrigin(req: Request): void {
  const origin = req.get("origin");
  if (!origin) return;

  const allowedOrigin = env.WEB_ORIGIN
    ? new URL(env.WEB_ORIGIN).origin
    : new URL(`${req.protocol}://${req.get("host")}`).origin;

  try {
    if (new URL(origin).origin !== allowedOrigin)
      throw new ForbiddenError("Untrusted request origin");
  } catch (error) {
    if (error instanceof ForbiddenError) throw error;
    throw new ForbiddenError("Untrusted request origin");
  }
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshCookieName, token, refreshCookieOptions);
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

export function validationError(
  issues: { path: PropertyKey[]; message: string }[],
): BadRequestError {
  return new BadRequestError(
    "Invalid request data",
    issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

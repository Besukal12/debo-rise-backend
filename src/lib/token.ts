import { createHash, randomUUID } from "node:crypto";
import jwt, { TokenExpiredError as JwtTokenExpiredError } from "jsonwebtoken";
import { env } from "../config/env.js";
import { BadTokenError, TokenExpiredError } from "../core/CustomError.js";

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAccessToken(userId: string): string {
  return jwt.sign({ tokenUse: "access" }, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: "15m" });
}

export function createRefreshToken(userId: string): string {
  return jwt.sign({ tokenUse: "refresh" }, env.JWT_REFRESH_SECRET, { subject: userId, jwtid: randomUUID(), expiresIn: "7d" });
}

function verifyToken(token: string, secret: string, tokenUse: "access" | "refresh") {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string" || payload.tokenUse !== tokenUse) throw new BadTokenError();
    return payload;
  } catch (error) {
    if (error instanceof BadTokenError) throw error;
    if (error instanceof JwtTokenExpiredError) throw new TokenExpiredError();
    throw new BadTokenError();
  }
}

export function verifyAccessToken(token: string): { userId: string } {
  return { userId: verifyToken(token, env.JWT_ACCESS_SECRET, "access").sub as string };
}

export function verifyRefreshToken(token: string): { userId: string; expiresAt: Date } {
  const payload = verifyToken(token, env.JWT_REFRESH_SECRET, "refresh");
  if (typeof payload.exp !== "number") throw new BadTokenError();
  return { userId: payload.sub as string, expiresAt: new Date(payload.exp * 1000) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

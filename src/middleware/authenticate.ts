import type { NextFunction, Request, Response, RequestHandler } from "express";
import type { AgeGroup, Role } from "../generated/prisma/enums.js";
import { prisma } from "../config/prisma.js";
import { ForbiddenError, UnauthorizedError } from "../core/CustomError.js";
import { verifyAccessToken } from "../lib/token.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        ageGroup: AgeGroup;
        parentConsent: boolean;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const match = req.get("authorization")?.match(/^Bearer ([^ ]+)$/i);
  if (!match) throw new UnauthorizedError("Authentication required");

  const { userId } = verifyAccessToken(match[1]);
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true, ageGroup: true, parentConsent: true },
  });

  if (!user) throw new UnauthorizedError("Authentication required");
  req.auth = {
    userId: user.id,
    role: user.role,
    ageGroup: user.ageGroup,
    parentConsent: user.parentConsent,
  };
  next();
}

export function authorizeRoles(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError("Authentication required");
    if (!allowedRoles.includes(req.auth.role))
      throw new ForbiddenError(
        "You do not have permission to perform this action",
      );
    next();
  };
}

export function requireGuardianConsent(): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError("Authentication required");
    
    if (req.auth.ageGroup === "MINOR" && !req.auth.parentConsent) {
      throw new ForbiddenError(
        "Guardian consent must be verified before accessing program content",
      );
    }
    next();
  };
}

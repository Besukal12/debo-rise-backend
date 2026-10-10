import type { Response } from "express";

export enum ErrorType {
  BAD_REQUEST = "BadRequest", CONFLICT = "Conflict", NOT_FOUND = "NotFound",
  UNAUTHORIZED = "Unauthorized", FORBIDDEN = "Forbidden", INTERNAL = "Internal",
  TOKEN_EXPIRED = "TokenExpired", BAD_TOKEN = "BadToken", ACCESS_TOKEN_ERROR = "AccessTokenError",
}

export class AppError extends Error {
  constructor(public readonly type: ErrorType, public readonly statusCode: number, message: string, public readonly details?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static handle(err: AppError, res: Response): void {
    res.status(err.statusCode).json({ type: err.type, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) });
  }
}

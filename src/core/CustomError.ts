import { AppError, ErrorType } from "./AppError.js";
export class BadRequestError extends AppError { constructor(message = "Bad request", details?: unknown) { super(ErrorType.BAD_REQUEST, 400, message, details); } }
export class ConflictError extends AppError { constructor(message = "Conflict") { super(ErrorType.CONFLICT, 409, message); } }
export class NotFoundError extends AppError { constructor(message = "Resource not found") { super(ErrorType.NOT_FOUND, 404, message); } }
export class UnauthorizedError extends AppError { constructor(message = "Unauthorized") { super(ErrorType.UNAUTHORIZED, 401, message); } }
export class ForbiddenError extends AppError { constructor(message = "Forbidden") { super(ErrorType.FORBIDDEN, 403, message); } }
export class InternalError extends AppError { constructor(message = "Internal server error") { super(ErrorType.INTERNAL, 500, message); } }
export class TokenExpiredError extends AppError { constructor(message = "Token expired") { super(ErrorType.TOKEN_EXPIRED, 401, message); } }
export class BadTokenError extends AppError { constructor(message = "Invalid token") { super(ErrorType.BAD_TOKEN, 401, message); } }
export class AccessTokenError extends AppError { constructor(message = "Access token error") { super(ErrorType.ACCESS_TOKEN_ERROR, 401, message); } }

import type { Server, Socket } from "socket.io";
import type { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/AppError.js";
import { verifyAccessToken } from "../../lib/token.js";
import { assertCanAccessHelpRequest } from "./help.service.js";
import {
  HELP_QUEUE_ROOM,
  helpRequestRoom,
  setHelpSocketServer,
} from "./help.events.js";
import { helpRequestIdSchema } from "./help.schema.js";

const staffRoles = new Set(["MENTOR", "SUPPORTER", "CIRCLE_LEAD", "ADMIN"]);

type HelpSocketUser = {
  userId: string;
  role: Role;
};

declare module "socket.io" {
  interface SocketData {
    helpUser: HelpSocketUser;
  }
}

type JoinAcknowledgement = { ok: true } | { ok: false; error: string };

type JoinAcknowledgementCallback = (result: JoinAcknowledgement) => void;

function getAccessToken(socket: Socket): string | undefined {
  const authToken: unknown = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) return authToken;

  const authorization = socket.handshake.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function getRequestId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const parsed = helpRequestIdSchema.safeParse({
    requestId: "requestId" in payload ? payload.requestId : undefined,
  });
  return parsed.success ? parsed.data.requestId : undefined;
}

function sendJoinError(
  error: unknown,
  acknowledge?: JoinAcknowledgementCallback,
): void {
  if (!acknowledge) return;
  acknowledge({
    ok: false,
    error:
      error instanceof AppError
        ? error.message
        : "Could not join help request",
  });
}

export function configureHelpSocket(io: Server): () => void {
  const detachPublisher = setHelpSocketServer(io);

  io.use(async (socket, next) => {
    const token = getAccessToken(socket);
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    let userId: string;
    try {
      ({ userId } = verifyAccessToken(token));
    } catch {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const user = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, role: true, ageGroup: true, parentConsent: true },
      });
      if (!user) {
        next(new Error("Authentication required"));
        return;
      }
      if (user.ageGroup === "MINOR" && !user.parentConsent) {
        next(new Error("Guardian consent is required"));
        return;
      }
      socket.data.helpUser = { userId: user.id, role: user.role };
      next();
    } catch {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.helpUser;

    socket.on(
      "help:request:join",
      async (payload: unknown, acknowledge?: JoinAcknowledgementCallback) => {
        const requestId = getRequestId(payload);
        if (!requestId) {
          sendJoinError(new Error("Invalid help request ID"), acknowledge);
          return;
        }
        try {
          await assertCanAccessHelpRequest(requestId, user.userId, user.role);
          await socket.join(helpRequestRoom(requestId));
          acknowledge?.({ ok: true });
        } catch (error) {
          sendJoinError(error, acknowledge);
        }
      },
    );

    socket.on(
      "help:request:leave",
      async (payload: unknown, acknowledge?: JoinAcknowledgementCallback) => {
        const requestId = getRequestId(payload);
        if (!requestId) {
          sendJoinError(new Error("Invalid help request ID"), acknowledge);
          return;
        }
        try {
          await socket.leave(helpRequestRoom(requestId));
          acknowledge?.({ ok: true });
        } catch {
          acknowledge?.({ ok: false, error: "Could not leave help request" });
        }
      },
    );

    socket.on(
      "help:queue:join",
      async (acknowledge?: JoinAcknowledgementCallback) => {
        if (!staffRoles.has(user.role)) {
          acknowledge?.({
            ok: false,
            error: "You cannot access the help queue",
          });
          return;
        }
        try {
          await socket.join(HELP_QUEUE_ROOM);
          acknowledge?.({ ok: true });
        } catch {
          acknowledge?.({ ok: false, error: "Could not join help queue" });
        }
      },
    );
  });

  return detachPublisher;
}

import type { Server } from "socket.io";

export type HelpEvent =
  | { type: "request.created"; request: unknown }
  | { type: "request.image"; requestId: string; imageUrl: string }
  | { type: "reply.created"; reply: unknown }
  | {
      type: "reply.image";
      replyId: string;
      requestId: string;
      imageUrl: string;
    }
  | { type: "reply.solution"; reply: unknown };

export const HELP_QUEUE_ROOM = "help:queue";

let socketServer: Server | undefined;

export function setHelpSocketServer(io: Server): () => void {
  socketServer = io;
  return () => {
    if (socketServer === io) socketServer = undefined;
  };
}

export function helpRequestRoom(requestId: string): string {
  return `help:request:${requestId}`;
}

export function publishHelpEvent(requestId: string, event: HelpEvent): void {
  if (!socketServer) return;
  if (event.type === "request.created") {
    socketServer.to(HELP_QUEUE_ROOM).emit(event.type, event);
    return;
  }
  socketServer.to(helpRequestRoom(requestId)).emit(event.type, event);
}

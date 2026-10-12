export type HelpEvent =
  | { type: "request.created"; request: unknown }
  | { type: "request.image"; requestId: string; imageUrl: string }
  | { type: "reply.created"; reply: unknown }
  | { type: "reply.image"; replyId: string; requestId: string; imageUrl: string }
  | { type: "reply.solution"; reply: unknown };

type Listener = (event: HelpEvent) => void;

const listenersByRequest = new Map<string, Set<Listener>>();

export function subscribeToHelpRequest(
  requestId: string,
  listener: Listener,
): () => void {
  let listeners = listenersByRequest.get(requestId);
  if (!listeners) {
    listeners = new Set();
    listenersByRequest.set(requestId, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) listenersByRequest.delete(requestId);
  };
}

export function publishHelpEvent(requestId: string, event: HelpEvent): void {
  for (const listener of listenersByRequest.get(requestId) ?? []) {
    listener(event);
  }
}

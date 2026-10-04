import { falRouteHoldMs } from "@/lib/ai/fal-wait";

type ServerLike = {
  requestTimeout: number;
  headersTimeout: number;
  keepAliveTimeout: number;
  timeout: number;
  constructor?: { name?: string };
};

type ListenFn = (this: ServerLike, ...args: unknown[]) => unknown;

type ServerProto = {
  listen?: ListenFn;
  __falHold?: boolean;
};

const HOLD_FLAG = "__falHold";

function applyHold(server: ServerLike, holdMs: number) {
  server.requestTimeout = holdMs;
  server.headersTimeout = holdMs + 1_000;
  server.keepAliveTimeout = holdMs;
  server.timeout = 0;
}

function isNodeServer(handle: unknown): handle is ServerLike {
  if (!handle || typeof handle !== "object") return false;
  const server = handle as ServerLike;
  const name = server.constructor?.name;
  return (name === "Server" || name === "HttpsServer") && "requestTimeout" in server && "headersTimeout" in server;
}

/**
 * Node's HTTP server stops receiving a request after 5 minutes by default.
 * The fal comparison waits up to an hour on one queue id, so this process must stay open that long.
 * This file stays free of node: imports so the edge bundle can ignore it.
 */
export function relaxHttpServerTimeouts() {
  const holdMs = falRouteHoldMs();
  const proc = process as NodeJS.Process & { _getActiveHandles?: () => unknown[] };
  let proto: ServerProto | null = null;
  for (const handle of proc._getActiveHandles?.() ?? []) {
    if (!isNodeServer(handle)) continue;
    applyHold(handle, holdMs);
    proto = Object.getPrototypeOf(handle) as ServerProto;
  }
  if (!proto || proto[HOLD_FLAG] || typeof proto.listen !== "function") return;
  const original = proto.listen;
  proto.listen = function listenWithFalHold(this: ServerLike, ...args: unknown[]) {
    applyHold(this, falRouteHoldMs());
    return original.apply(this, args);
  };
  proto[HOLD_FLAG] = true;
}

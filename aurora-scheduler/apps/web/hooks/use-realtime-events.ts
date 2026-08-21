"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

const WS_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ||
  "http://localhost:3001";

let globalSocket: Socket | null = null;

export function useRealtimeEvents(projectId?: string) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const invalidate = useCallback(
    (keys: string[]) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    [qc]
  );

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(`${WS_URL}/events`, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
      });
    }
    socketRef.current = globalSocket;

    const socket = socketRef.current;

    if (projectId) {
      socket.emit("subscribe", { projectId });
    }

    const handlers: Record<string, () => void> = {
      "job.created": () => invalidate(["jobs"]),
      "job.completed": () => invalidate(["jobs", "queue-stats"]),
      "job.failed": () => invalidate(["jobs", "queue-stats"]),
      "job.dlq": () => invalidate(["jobs", "dlq", "queue-stats"]),
      "job.cancelled": () => invalidate(["jobs"]),
      "job.retried": () => invalidate(["jobs", "dlq"]),
      "queue.paused": () => invalidate(["queues", "queue-stats"]),
      "queue.resumed": () => invalidate(["queues", "queue-stats"]),
      "queue.stats": () => invalidate(["queue-stats"]),
      "worker.heartbeat": () => invalidate(["workers"]),
      "worker.unhealthy": () => invalidate(["workers"]),
      "worker.offline": () => invalidate(["workers"]),
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
      if (projectId) {
        socket.emit("unsubscribe", { projectId });
      }
    };
  }, [projectId, invalidate]);
}

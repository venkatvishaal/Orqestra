"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Play,
  Pause,
  Plus,
  AlertTriangle,
  CheckCircle,
  Activity,
  Settings,
  ChevronRight,
} from "lucide-react";
import { queuesApi } from "@/lib/api";
import Link from "next/link";

function QueueHealthIndicator({ stats }: { stats: any }) {
  const rate = stats?.successRate ?? 100;
  const isPaused = stats?.isPaused;
  if (isPaused)
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          background: "oklch(28% 0.05 70 / 0.4)",
          border: "1px solid oklch(50% 0.12 70 / 0.3)",
          borderRadius: 4,
          color: "oklch(74% 0.2 70)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Pause size={10} /> PAUSED
      </span>
    );
  if (rate >= 95)
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          background: "oklch(25% 0.08 145 / 0.4)",
          border: "1px solid oklch(45% 0.16 145 / 0.3)",
          borderRadius: 4,
          color: "oklch(68% 0.19 145)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <CheckCircle size={10} /> HEALTHY
      </span>
    );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        background: "oklch(25% 0.1 25 / 0.4)",
        border: "1px solid oklch(45% 0.18 25 / 0.3)",
        borderRadius: 4,
        color: "oklch(72% 0.2 25)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <AlertTriangle size={10} /> DEGRADED
    </span>
  );
}

function QueueCard({ queue }: { queue: any }) {
  const qc = useQueryClient();

  const pauseMutation = useMutation({
    mutationFn: () => queuesApi.pause(queue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queues"] }),
  });
  const resumeMutation = useMutation({
    mutationFn: () => queuesApi.resume(queue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queues"] }),
  });

  const { data: statsData } = useQuery({
    queryKey: ["queue-stats", queue.id],
    queryFn: async () => {
      const { data } = await queuesApi.stats(queue.id);
      return data;
    },
    refetchInterval: 5000,
  });

  const stats = statsData;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card"
      style={{ padding: 20 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{queue.name}</h3>
            <QueueHealthIndicator stats={stats ?? { isPaused: queue.isPaused }} />
          </div>
          <p
            style={{
              fontSize: 12,
              color: "oklch(50% 0.04 255)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {queue.id.slice(0, 16)}…
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() =>
              queue.isPaused ? resumeMutation.mutate() : pauseMutation.mutate()
            }
            disabled={pauseMutation.isPending || resumeMutation.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: queue.isPaused
                ? "oklch(25% 0.08 145 / 0.4)"
                : "oklch(28% 0.05 70 / 0.4)",
              border: queue.isPaused
                ? "1px solid oklch(45% 0.16 145 / 0.4)"
                : "1px solid oklch(50% 0.12 70 / 0.4)",
              borderRadius: 6,
              color: queue.isPaused
                ? "oklch(68% 0.19 145)"
                : "oklch(74% 0.2 70)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {queue.isPaused ? (
              <Play size={12} />
            ) : (
              <Pause size={12} />
            )}
            {queue.isPaused ? "Resume" : "Pause"}
          </button>
          <Link
            href={`/queues/${queue.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              background: "oklch(20% 0.03 255)",
              border: "1px solid oklch(30% 0.04 255)",
              borderRadius: 6,
              color: "oklch(65% 0.05 255)",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            <Settings size={12} />
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Depth", value: stats?.depth ?? "—", color: "oklch(65% 0.18 220)" },
          { label: "In-flight", value: stats?.inFlight ?? "—", color: "oklch(72% 0.18 200)" },
          { label: "Completed", value: stats?.completed ?? "—", color: "oklch(68% 0.19 145)" },
          { label: "Failed", value: stats?.failed ?? "—", color: "oklch(62% 0.22 25)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              padding: "8px",
              background: "oklch(17% 0.025 255)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 10, color: "oklch(50% 0.04 255)", marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "oklch(50% 0.04 255)",
        }}
      >
        <span>
          Concurrency: {queue.concurrencyLimit} ·{" "}
          {queue.retryPolicy?.strategy ?? "exponential"} retry ·{" "}
          {queue.retryPolicy?.maxAttempts ?? 3} attempts
        </span>
        <span style={{ color: "oklch(68% 0.19 145)", fontWeight: 600 }}>
          {stats?.successRate ?? 100}% success
        </span>
      </div>
    </motion.div>
  );
}

export default function QueuesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [newQueueName, setNewQueueName] = useState("");
  const [projectId, setProjectId] = useState("");
  const qc = useQueryClient();

  const { data: queues = [], isLoading } = useQuery({
    queryKey: ["queues"],
    queryFn: async () => {
      const stored = localStorage.getItem("project_id");
      if (!stored) return [];
      const { data } = await queuesApi.list(stored);
      return data;
    },
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const pid = localStorage.getItem("project_id") || "";
      const { data } = await queuesApi.create({
        projectId: pid,
        name: newQueueName,
        concurrencyLimit: 5,
        retryPolicy: { strategy: "exponential", baseDelayMs: 2000, maxAttempts: 3 },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queues"] });
      setShowCreate(false);
      setNewQueueName("");
    },
  });

  return (
    <div style={{ padding: "32px", maxWidth: 1200 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Queues
          </h1>
          <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
            Manage job queues, concurrency limits, and retry policies
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "linear-gradient(135deg, oklch(46% 0.22 220), oklch(46% 0.2 260))",
            border: "none",
            borderRadius: 8,
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
          New Queue
        </button>
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "oklch(5% 0.02 255 / 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card"
              style={{ padding: 28, width: 420 }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
                Create Queue
              </h2>
              <input
                placeholder="Queue name (e.g. email-delivery)"
                value={newQueueName}
                onChange={(e) => setNewQueueName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "oklch(92% 0.01 255)",
                  fontSize: 14,
                  marginBottom: 16,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "9px 16px",
                    background: "transparent",
                    border: "1px solid oklch(28% 0.04 255)",
                    borderRadius: 8,
                    color: "oklch(65% 0.05 255)",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!newQueueName || createMutation.isPending}
                  style={{
                    padding: "9px 20px",
                    background: "oklch(46% 0.22 220)",
                    border: "none",
                    borderRadius: 8,
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue grid */}
      {isLoading ? (
        <div
          style={{ textAlign: "center", padding: 48, color: "oklch(50% 0.04 255)" }}
        >
          Loading queues…
        </div>
      ) : queues.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card"
          style={{ padding: 48, textAlign: "center" }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            No queues yet
          </h3>
          <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
            Create your first queue to start scheduling jobs
          </p>
        </motion.div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
            gap: 16,
          }}
        >
          {queues.map((queue: any) => (
            <QueueCard key={queue.id} queue={queue} />
          ))}
        </div>
      )}
    </div>
  );
}

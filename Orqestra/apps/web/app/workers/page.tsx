"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Server, Cpu, Activity, Clock, AlertTriangle, CheckCircle, WifiOff } from "lucide-react";
import { workersApi } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";

function WorkerStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <CheckCircle size={16} style={{ color: "oklch(68% 0.19 145)" }} />;
    case "unhealthy":
      return <AlertTriangle size={16} style={{ color: "oklch(62% 0.22 25)" }} />;
    case "offline":
      return <WifiOff size={16} style={{ color: "oklch(50% 0.04 255)" }} />;
    default:
      return <Activity size={16} style={{ color: "oklch(74% 0.2 70)" }} />;
  }
}

function WorkerCard({ worker }: { worker: any }) {
  const isHealthy = worker.status === "healthy";
  const isUnhealthy = worker.status === "unhealthy";
  const lastBeat = worker.lastHeartbeatAt
    ? formatDistanceToNow(new Date(worker.lastHeartbeatAt), { addSuffix: true })
    : "never";

  const utilizationPct =
    worker.maxConcurrency > 0
      ? Math.round((worker.currentJobCount / worker.maxConcurrency) * 100)
      : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card"
      style={{
        padding: 20,
        borderLeft: `3px solid ${isHealthy ? "oklch(68% 0.19 145)" : isUnhealthy ? "oklch(62% 0.22 25)" : "oklch(38% 0.04 255)"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <WorkerStatusIcon status={worker.status} />
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{worker.hostname}</h3>
            <p style={{ fontSize: 11, color: "oklch(50% 0.04 255)", fontFamily: "var(--font-mono)" }}>
              {worker.id.slice(0, 16)}… · PID {worker.processId ?? "—"}
            </p>
          </div>
        </div>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            background: isHealthy
              ? "oklch(25% 0.08 145 / 0.4)"
              : isUnhealthy
              ? "oklch(25% 0.1 25 / 0.4)"
              : "oklch(20% 0.02 255 / 0.4)",
            border: isHealthy
              ? "1px solid oklch(45% 0.16 145 / 0.4)"
              : isUnhealthy
              ? "1px solid oklch(45% 0.18 25 / 0.4)"
              : "1px solid oklch(30% 0.04 255 / 0.4)",
            color: isHealthy
              ? "oklch(68% 0.19 145)"
              : isUnhealthy
              ? "oklch(72% 0.2 25)"
              : "oklch(55% 0.04 255)",
          }}
        >
          {worker.status}
        </span>
      </div>

      {/* Utilization bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "oklch(55% 0.04 255)", marginBottom: 6 }}>
          <span>Concurrency</span>
          <span style={{ fontWeight: 600, color: "oklch(78% 0.08 255)" }}>
            {worker.currentJobCount}/{worker.maxConcurrency} ({utilizationPct}%)
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: "oklch(20% 0.03 255)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${utilizationPct}%` }}
            transition={{ duration: 0.5 }}
            style={{
              height: "100%",
              borderRadius: 3,
              background:
                utilizationPct > 80
                  ? "oklch(62% 0.22 25)"
                  : utilizationPct > 50
                  ? "oklch(74% 0.2 70)"
                  : "oklch(68% 0.19 145)",
            }}
          />
        </div>
      </div>

      {/* Last heartbeat */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "oklch(50% 0.04 255)" }}>
        <Clock size={12} />
        <span>Last heartbeat: {lastBeat}</span>
        {isUnhealthy && (
          <span style={{ color: "oklch(72% 0.2 25)", marginLeft: 8 }}>
            ⚠ Missed heartbeat — jobs reclaimed
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function WorkersPage() {
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data } = await workersApi.list();
      return data;
    },
    refetchInterval: 5000,
  });

  const healthy = workers.filter((w: any) => w.status === "healthy").length;
  const unhealthy = workers.filter((w: any) => w.status === "unhealthy").length;
  const offline = workers.filter((w: any) => w.status === "offline").length;

  return (
    <div style={{ padding: "32px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Workers</h1>
        <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
          Real-time worker fleet health — heartbeat every 5s
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Healthy", count: healthy, color: "oklch(68% 0.19 145)" },
          { label: "Unhealthy", count: unhealthy, color: "oklch(62% 0.22 25)" },
          { label: "Offline", count: offline, color: "oklch(50% 0.04 255)" },
          { label: "Total", count: workers.length, color: "oklch(65% 0.18 220)" },
        ].map(({ label, count, color }) => (
          <div
            key={label}
            style={{
              padding: "12px 20px",
              background: "oklch(16% 0.025 255)",
              border: "1px solid oklch(24% 0.035 255)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color }}>{count}</span>
            <span style={{ fontSize: 13, color: "oklch(55% 0.04 255)" }}>{label}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 48, color: "oklch(50% 0.04 255)" }}>
          Loading workers…
        </div>
      ) : workers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card"
          style={{ padding: 48, textAlign: "center" }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No workers online</h3>
          <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
            Start the worker service to begin processing jobs
          </p>
        </motion.div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
          {workers.map((worker: any) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}

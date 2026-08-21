"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, RotateCcw, XCircle, Clock, Code2, Terminal } from "lucide-react";
import { jobsApi } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge-${status}`} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
      {status}
    </span>
  );
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const { data } = await jobsApi.get(id);
      return data;
    },
    refetchInterval: 3000,
  });

  const retryMutation = useMutation({
    mutationFn: () => jobsApi.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job", id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => jobsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job", id] }),
  });

  if (isLoading) {
    return (
      <div style={{ padding: 32, color: "oklch(55% 0.04 255)" }}>Loading…</div>
    );
  }

  if (!job) {
    return (
      <div style={{ padding: 32 }}>
        <p>Job not found.</p>
        <Link href="/jobs">← Back to jobs</Link>
      </div>
    );
  }

  const executions = job.executions || [];

  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      {/* Back nav */}
      <Link
        href="/jobs"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "oklch(55% 0.04 255)",
          textDecoration: "none",
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        <ArrowLeft size={14} /> Back to Jobs
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {job.id}
              </h1>
              <StatusBadge status={job.status} />
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "oklch(55% 0.04 255)" }}>
              <span>Type: <strong style={{ color: "oklch(78% 0.08 255)" }}>{job.type}</strong></span>
              <span>Attempts: <strong style={{ color: "oklch(78% 0.08 255)" }}>{job.attempts}/{job.maxAttempts}</strong></span>
              <span>Priority: <strong style={{ color: "oklch(78% 0.08 255)" }}>{job.priority}</strong></span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {["failed", "dlq"].includes(job.status) && (
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 16px",
                  background: "oklch(25% 0.08 145 / 0.5)",
                  border: "1px solid oklch(45% 0.16 145 / 0.5)",
                  borderRadius: 8, color: "oklch(68% 0.19 145)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                <RotateCcw size={14} /> Retry Job
              </button>
            )}
            {["queued", "scheduled"].includes(job.status) && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 16px",
                  background: "oklch(25% 0.1 25 / 0.5)",
                  border: "1px solid oklch(45% 0.18 25 / 0.5)",
                  borderRadius: 8, color: "oklch(72% 0.2 25)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                <XCircle size={14} /> Cancel
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Payload */}
        <motion.div className="glass-card" style={{ padding: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Code2 size={15} style={{ color: "oklch(65% 0.18 220)" }} />
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Payload</h2>
          </div>
          <pre style={{
            background: "oklch(12% 0.02 255)",
            border: "1px solid oklch(24% 0.035 255)",
            borderRadius: 8,
            padding: "14px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "oklch(80% 0.06 255)",
            overflow: "auto",
            maxHeight: 200,
          }}>
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </motion.div>

        {/* Timeline */}
        <motion.div className="glass-card" style={{ padding: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Clock size={15} style={{ color: "oklch(72% 0.18 200)" }} />
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Timeline</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Created", value: job.createdAt },
              { label: "Run at", value: job.runAt },
              { label: "Claimed at", value: job.claimedAt },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "oklch(55% 0.04 255)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {value ? format(new Date(value), "MMM d, HH:mm:ss") : "—"}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Execution history */}
      <motion.div className="glass-card" style={{ padding: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Terminal size={15} style={{ color: "oklch(68% 0.19 145)" }} />
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>
            Execution History ({executions.length} attempts)
          </h2>
        </div>

        {executions.length === 0 ? (
          <p style={{ color: "oklch(50% 0.04 255)", fontSize: 13 }}>
            No executions yet
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {executions.map((exec: any, i: number) => (
              <div
                key={exec.id}
                style={{
                  padding: 16,
                  background: "oklch(14% 0.022 255)",
                  border: "1px solid oklch(24% 0.035 255)",
                  borderRadius: 8,
                  borderLeft: `3px solid ${exec.status === "completed" ? "oklch(68% 0.19 145)" : exec.status === "failed" ? "oklch(62% 0.22 25)" : "oklch(65% 0.18 220)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Attempt #{exec.attemptNumber}
                  </span>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "oklch(55% 0.04 255)" }}>
                    {exec.durationMs && <span>{exec.durationMs}ms</span>}
                    <span>{exec.startedAt ? format(new Date(exec.startedAt), "HH:mm:ss") : "—"}</span>
                  </div>
                </div>
                {exec.errorMessage && (
                  <div style={{
                    padding: "8px 12px",
                    background: "oklch(18% 0.05 25 / 0.5)",
                    border: "1px solid oklch(35% 0.1 25 / 0.3)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: "oklch(72% 0.2 25)",
                  }}>
                    {exec.errorMessage}
                  </div>
                )}
                {exec.result && (
                  <pre style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "oklch(12% 0.02 255)",
                    borderRadius: 6,
                    fontSize: 11,
                    color: "oklch(75% 0.08 255)",
                    overflow: "auto",
                    maxHeight: 100,
                  }}>
                    {JSON.stringify(exec.result, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

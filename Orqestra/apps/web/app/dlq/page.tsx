"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, RotateCcw, AlertTriangle, RefreshCw } from "lucide-react";
import { dlqApi } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";

export default function DLQPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dlq", page],
    queryFn: async () => {
      const { data } = await dlqApi.list({ page, limit });
      return data;
    },
    refetchInterval: 5000,
  });

  const requeueMutation = useMutation({
    mutationFn: (id: string) => dlqApi.requeue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlq"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => dlqApi.purge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlq"] });
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const pages = Math.ceil(total / limit) || 1;

  return (
    <div style={{ padding: "32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle style={{ color: "oklch(74% 0.2 70)" }} />
              Dead Letter Queue
            </h1>
            <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
              Failed jobs that have exhausted all retry attempts. Unresolved issues requiring manual intervention.
            </p>
          </div>
          {isFetching && (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
              <RefreshCw size={14} style={{ color: "oklch(65% 0.18 220)" }} />
            </motion.div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <motion.div className="glass-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Job ID", "Queue ID", "Reason", "Final Error", "Attempts", "Moved At", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 11,
                    color: "oklch(50% 0.04 255)",
                    padding: "14px 16px",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid oklch(22% 0.035 255)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "oklch(50% 0.04 255)" }}>
                  Loading DLQ entries…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "oklch(50% 0.04 255)", fontSize: 14 }}>
                  No dead letter queue entries found. System is healthy! 🎉
                </td>
              </tr>
            ) : (
              items.map((entry: any) => (
                <tr
                  key={entry.id}
                  className="table-row-hover"
                  style={{ borderBottom: "1px solid oklch(19% 0.03 255)" }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/jobs/${entry.jobId}`}
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: "oklch(65% 0.12 220)",
                        textDecoration: "none",
                      }}
                    >
                      {entry.jobId.slice(0, 12)}…
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, fontFamily: "var(--font-mono)", color: "oklch(60% 0.05 255)" }}>
                    {entry.queueId?.slice(0, 8)}…
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "oklch(80% 0.06 255)" }}>
                    {entry.reason}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "oklch(72% 0.2 25)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.finalError}>
                    {entry.finalError || "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, textAlign: "center" }}>
                    {entry.totalAttempts}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "oklch(55% 0.04 255)" }}>
                    {entry.movedAt ? format(new Date(entry.movedAt), "MMM d, HH:mm:ss") : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); requeueMutation.mutate(entry.id); }}
                        disabled={requeueMutation.isPending}
                        title="Requeue Job"
                        style={{
                          padding: "4px 8px",
                          background: "oklch(25% 0.08 145 / 0.4)",
                          border: "1px solid oklch(45% 0.16 145 / 0.3)",
                          borderRadius: 5,
                          color: "oklch(68% 0.19 145)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <RotateCcw size={11} /> Requeue
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); purgeMutation.mutate(entry.id); }}
                        disabled={purgeMutation.isPending}
                        title="Delete Permanently"
                        style={{
                          padding: "4px 8px",
                          background: "oklch(25% 0.1 25 / 0.4)",
                          border: "1px solid oklch(45% 0.18 25 / 0.3)",
                          borderRadius: 5,
                          color: "oklch(72% 0.2 25)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <Trash2 size={11} /> Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              padding: "16px",
              borderTop: "1px solid oklch(22% 0.035 255)",
            }}
          >
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid oklch(28% 0.04 255)",
                borderRadius: 6,
                color: page === 1 ? "oklch(35% 0.04 255)" : "oklch(65% 0.05 255)",
                cursor: page === 1 ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: "oklch(55% 0.04 255)" }}>
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page === pages}
              style={{
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid oklch(28% 0.04 255)",
                borderRadius: 6,
                color: page === pages ? "oklch(35% 0.04 255)" : "oklch(65% 0.05 255)",
                cursor: page === pages ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Next →
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, RefreshCw, XCircle, RotateCcw } from "lucide-react";
import { jobsApi } from "@/lib/api";
import { format } from "date-fns";
import Link from "next/link";

const JOB_STATUSES = [
  "all", "queued", "scheduled", "claimed", "running",
  "completed", "failed", "dlq", "cancelled",
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`badge-${status.toLowerCase()}`}
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

export default function JobsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["jobs", statusFilter, page],
    queryFn: async () => {
      const params: any = { page, limit };
      if (statusFilter !== "all") params.status = statusFilter;
      const { data } = await jobsApi.list(params);
      return data;
    },
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => jobsApi.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => jobsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const jobs = data?.items || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  return (
    <div style={{ padding: "32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Jobs</h1>
            <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
              {total.toLocaleString()} total jobs
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isFetching && (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                <RefreshCw size={14} style={{ color: "oklch(65% 0.18 220)" }} />
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {JOB_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: statusFilter === s
                ? "1px solid oklch(55% 0.22 220 / 0.5)"
                : "1px solid oklch(28% 0.04 255)",
              background: statusFilter === s
                ? "oklch(22% 0.05 220 / 0.6)"
                : "transparent",
              color: statusFilter === s
                ? "oklch(75% 0.18 220)"
                : "oklch(55% 0.04 255)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textTransform: "capitalize",
              transition: "all 0.15s",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <motion.div className="glass-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Job ID", "Type", "Status", "Queue", "Attempts", "Created", "Actions"].map((h) => (
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
                  Loading…
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "oklch(50% 0.04 255)", fontSize: 14 }}>
                  No jobs match the current filter
                </td>
              </tr>
            ) : (
              jobs.map((job: any) => (
                <tr
                  key={job.id}
                  className="table-row-hover"
                  style={{ borderBottom: "1px solid oklch(19% 0.03 255)" }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/jobs/${job.id}`}
                      style={{
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: "oklch(65% 0.12 220)",
                        textDecoration: "none",
                      }}
                    >
                      {job.id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12 }}>{job.type}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge status={job.status} />
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "oklch(60% 0.05 255)", fontFamily: "var(--font-mono)" }}>
                    {job.queueId?.slice(0, 8)}…
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, textAlign: "center" }}>
                    {job.attempts}/{job.maxAttempts ?? "?"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "oklch(55% 0.04 255)" }}>
                    {job.createdAt ? format(new Date(job.createdAt), "MMM d, HH:mm:ss") : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["failed", "dlq"].includes(job.status) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); retryMutation.mutate(job.id); }}
                          title="Retry"
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
                          <RotateCcw size={11} /> Retry
                        </button>
                      )}
                      {["queued", "scheduled"].includes(job.status) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(job.id); }}
                          title="Cancel"
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
                          <XCircle size={11} /> Cancel
                        </button>
                      )}
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

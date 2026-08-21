"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Briefcase,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Server,
  Activity,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { jobsApi, workersApi, dlqApi } from "@/lib/api";
import { format, subMinutes } from "date-fns";

const CARD_ANIMATION = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

// Generate demo throughput data
function generateThroughputData() {
  return Array.from({ length: 20 }, (_, i) => ({
    time: format(subMinutes(new Date(), 20 - i), "HH:mm"),
    completed: Math.floor(Math.random() * 80 + 40),
    failed: Math.floor(Math.random() * 10 + 2),
  }));
}

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
        letterSpacing: "0.05em",
      }}
    >
      {status}
    </span>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
  delay = 0,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  subtitle?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="metric-card"
      {...CARD_ANIMATION}
      transition={{ duration: 0.4, delay }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div>
          <p
            style={{ fontSize: 12, color: "oklch(55% 0.04 255)", marginBottom: 4 }}
          >
            {title}
          </p>
          <p
            style={{ fontSize: 28, fontWeight: 700, color: "oklch(92% 0.01 255)" }}
          >
            {value}
          </p>
          {subtitle && (
            <p style={{ fontSize: 12, color: "oklch(55% 0.04 255)", marginTop: 4 }}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${color}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${color}30`,
          }}
        >
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </motion.div>
  );
}

const throughputData = generateThroughputData();

export default function DashboardPage() {
  const { data: jobsData } = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: async () => {
      const { data } = await jobsApi.list({ limit: 10, page: 1 });
      return data;
    },
  });

  const { data: workers } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data } = await workersApi.list();
      return data;
    },
  });

  const { data: dlqData } = useQuery({
    queryKey: ["dlq"],
    queryFn: async () => {
      const { data } = await dlqApi.list({ limit: 5 });
      return data;
    },
  });

  const jobs = jobsData?.items || [];
  const totalJobs = jobsData?.total || 0;
  const healthyWorkers = workers?.filter((w: any) => w.status === "healthy").length || 0;
  const totalWorkers = workers?.length || 0;
  const dlqCount = dlqData?.total || 0;
  const completedJobs = jobs.filter((j: any) => j.status === "completed").length;
  const failedJobs = jobs.filter((j: any) => j.status === "failed" || j.status === "dlq").length;

  return (
    <div style={{ padding: "32px", maxWidth: 1400 }}>
      {/* Header */}
      <motion.div
        {...CARD_ANIMATION}
        transition={{ duration: 0.4 }}
        style={{ marginBottom: 32 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          System Overview
        </h1>
        <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
          Real-time visibility into your job queues, workers, and execution health
        </p>
      </motion.div>

      {/* Metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <MetricCard
          title="Total Jobs"
          value={totalJobs.toLocaleString()}
          icon={Briefcase}
          color="oklch(65% 0.18 220)"
          subtitle="All time"
          delay={0.05}
        />
        <MetricCard
          title="Healthy Workers"
          value={`${healthyWorkers}/${totalWorkers}`}
          icon={Server}
          color="oklch(68% 0.19 145)"
          subtitle={healthyWorkers === totalWorkers ? "All healthy" : "Some unhealthy"}
          delay={0.1}
        />
        <MetricCard
          title="Completed (recent)"
          value={completedJobs}
          icon={CheckCircle}
          color="oklch(68% 0.19 145)"
          subtitle="Last 10 jobs"
          delay={0.15}
        />
        <MetricCard
          title="Failed (recent)"
          value={failedJobs}
          icon={XCircle}
          color="oklch(62% 0.22 25)"
          subtitle="Last 10 jobs"
          delay={0.2}
        />
        <MetricCard
          title="DLQ"
          value={dlqCount}
          icon={AlertTriangle}
          color="oklch(74% 0.2 70)"
          subtitle="Pending recovery"
          delay={0.25}
        />
      </div>

      {/* Charts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Throughput chart */}
        <motion.div
          className="glass-card"
          {...CARD_ANIMATION}
          transition={{ duration: 0.4, delay: 0.3 }}
          style={{ padding: 20 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                Throughput
              </h2>
              <p style={{ fontSize: 12, color: "oklch(55% 0.04 255)" }}>
                Jobs/min over last 20 minutes
              </p>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
              <span style={{ color: "oklch(68% 0.19 145)" }}>● Completed</span>
              <span style={{ color: "oklch(62% 0.22 25)" }}>● Failed</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={throughputData}>
              <defs>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(68% 0.19 145)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(68% 0.19 145)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(62% 0.22 25)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(62% 0.22 25)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(25% 0.03 255)" />
              <XAxis
                dataKey="time"
                stroke="oklch(40% 0.04 255)"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="oklch(40% 0.04 255)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "oklch(18% 0.03 255)",
                  border: "1px solid oklch(30% 0.05 255)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="oklch(68% 0.19 145)"
                strokeWidth={2}
                fill="url(#completedGrad)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke="oklch(62% 0.22 25)"
                strokeWidth={2}
                fill="url(#failedGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Worker status */}
        <motion.div
          className="glass-card"
          {...CARD_ANIMATION}
          transition={{ duration: 0.4, delay: 0.35 }}
          style={{ padding: 20 }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Activity size={16} style={{ color: "oklch(68% 0.19 145)" }} />
            Worker Fleet
          </h2>
          {workers?.length === 0 && (
            <p style={{ fontSize: 13, color: "oklch(50% 0.04 255)" }}>
              No workers registered
            </p>
          )}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {(workers || []).slice(0, 6).map((worker: any) => (
              <div
                key={worker.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "oklch(17% 0.025 255)",
                  borderRadius: 8,
                  border: "1px solid oklch(24% 0.035 255)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {worker.hostname}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "oklch(50% 0.04 255)" }}
                  >
                    {worker.currentJobCount}/{worker.maxConcurrency} jobs
                  </div>
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      worker.status === "healthy"
                        ? "oklch(68% 0.19 145)"
                        : "oklch(62% 0.22 25)",
                  }}
                />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent jobs */}
      <motion.div
        className="glass-card"
        {...CARD_ANIMATION}
        transition={{ duration: 0.4, delay: 0.4 }}
        style={{ padding: 20 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Recent Jobs</h2>
          <a
            href="/jobs"
            style={{
              fontSize: 12,
              color: "oklch(65% 0.18 220)",
              textDecoration: "none",
            }}
          >
            View all →
          </a>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["ID", "Type", "Status", "Queue", "Created"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 11,
                    color: "oklch(50% 0.04 255)",
                    padding: "0 12px 10px",
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
            {jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    padding: "24px",
                    color: "oklch(50% 0.04 255)",
                    fontSize: 13,
                  }}
                >
                  No jobs yet. Create your first job via the API or the Jobs page.
                </td>
              </tr>
            ) : (
              jobs.map((job: any) => (
                <tr
                  key={job.id}
                  className="table-row-hover"
                  onClick={() => (window.location.href = `/jobs/${job.id}`)}
                >
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: "oklch(65% 0.12 220)",
                      borderBottom: "1px solid oklch(19% 0.03 255)",
                    }}
                  >
                    {job.id.slice(0, 8)}…
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      borderBottom: "1px solid oklch(19% 0.03 255)",
                    }}
                  >
                    {job.type}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid oklch(19% 0.03 255)",
                    }}
                  >
                    <StatusBadge status={job.status} />
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "oklch(65% 0.05 255)",
                      borderBottom: "1px solid oklch(19% 0.03 255)",
                    }}
                  >
                    {job.queueId?.slice(0, 8)}…
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "oklch(55% 0.04 255)",
                      borderBottom: "1px solid oklch(19% 0.03 255)",
                    }}
                  >
                    {job.createdAt
                      ? format(new Date(job.createdAt), "MMM d, HH:mm")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Play, Pause, List, Shield, HelpCircle, Activity } from "lucide-react";
import { queuesApi } from "@/lib/api";
import Link from "next/link";

export default function QueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["queue", id],
    queryFn: async () => {
      const { data } = await queuesApi.get(id);
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["queue-stats", id],
    queryFn: async () => {
      const { data } = await queuesApi.stats(id);
      return data;
    },
    refetchInterval: 3000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => queuesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue", id] });
      qc.invalidateQueries({ queryKey: ["queues"] });
      alert("Queue updated successfully!");
    },
  });

  const [concurrency, setConcurrency] = useState<number | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [rateLimit, setRateLimit] = useState<number | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<string | null>(null);
  const [baseDelay, setBaseDelay] = useState<number | null>(null);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);

  if (isLoading || !queue) {
    return (
      <div style={{ padding: 32, color: "oklch(55% 0.04 255)" }}>Loading queue details…</div>
    );
  }

  // Initialize state once queue data is loaded
  const currentConcurrency = concurrency ?? queue.concurrencyLimit;
  const currentPriority = priority ?? queue.priority;
  const currentRateLimit = rateLimit ?? queue.rateLimitPerSec ?? "";
  const currentDescription = description ?? queue.description ?? "";

  const currentStrategy = strategy ?? queue.retryPolicy?.strategy ?? "exponential";
  const currentBaseDelay = baseDelay ?? queue.retryPolicy?.baseDelayMs ?? 2000;
  const currentMaxAttempts = maxAttempts ?? queue.retryPolicy?.maxAttempts ?? 3;

  const handleSave = () => {
    updateMutation.mutate({
      concurrencyLimit: Number(currentConcurrency),
      priority: Number(currentPriority),
      rateLimitPerSec: currentRateLimit ? Number(currentRateLimit) : null,
      description: currentDescription || null,
      retryPolicy: {
        strategy: currentStrategy,
        baseDelayMs: Number(currentBaseDelay),
        maxAttempts: Number(currentMaxAttempts),
      },
    });
  };

  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      {/* Back nav */}
      <Link
        href="/queues"
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
        <ArrowLeft size={14} /> Back to Queues
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
              Queue Configuration: {queue.name}
            </h1>
            <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
              Fine-tune execution performance and resilience properties
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "oklch(46% 0.22 220)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Save size={16} />
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </motion.div>

      {/* Live Stats Box */}
      <motion.div
        className="glass-card"
        style={{ padding: 20, marginBottom: 24 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={16} style={{ color: "oklch(68% 0.19 145)" }} />
          Live Stats
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Depth (Queued)", value: stats?.depth ?? "—", color: "oklch(65% 0.18 220)" },
            { label: "In-flight", value: stats?.inFlight ?? "—", color: "oklch(72% 0.18 200)" },
            { label: "Completed", value: stats?.completed ?? "—", color: "oklch(68% 0.19 145)" },
            { label: "Failed", value: stats?.failed ?? "—", color: "oklch(62% 0.22 25)" },
            { label: "Dead Letter Queue", value: stats?.dlq ?? "—", color: "oklch(74% 0.2 70)" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                padding: "12px",
                background: "oklch(17% 0.025 255)",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "oklch(50% 0.04 255)", marginTop: 4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Split Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Core Config */}
        <motion.div
          className="glass-card"
          style={{ padding: 20 }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <List size={16} style={{ color: "oklch(65% 0.18 220)" }} />
            Core Settings
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Concurrency Limit
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={currentConcurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              />
              <p style={{ fontSize: 11, color: "oklch(50% 0.04 255)", marginTop: 4 }}>
                Max active claims allowed across the entire worker fleet simultaneously.
              </p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Queue Priority Weight
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={currentPriority}
                onChange={(e) => setPriority(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              />
              <p style={{ fontSize: 11, color: "oklch(50% 0.04 255)", marginTop: 4 }}>
                Higher priority weight queues are polled and claimed first by idle workers.
              </p>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Rate Limit per Second (Optional)
              </label>
              <input
                type="number"
                placeholder="No limit"
                value={currentRateLimit}
                onChange={(e) => setRateLimit(e.target.value ? Number(e.target.value) : null)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Description
              </label>
              <textarea
                value={currentDescription}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                  minHeight: 80,
                  resize: "vertical",
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Retry Config */}
        <motion.div
          className="glass-card"
          style={{ padding: 20 }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={16} style={{ color: "oklch(68% 0.19 145)" }} />
            Retry & Resilience Policy
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Backoff Strategy
              </label>
              <select
                value={currentStrategy}
                onChange={(e) => setStrategy(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              >
                <option value="fixed">Fixed (Constant Delay)</option>
                <option value="linear">Linear Backoff</option>
                <option value="exponential">Exponential Backoff (Double delay each time)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Base Retry Delay (ms)
              </label>
              <input
                type="number"
                min={100}
                value={currentBaseDelay}
                onChange={(e) => setBaseDelay(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "oklch(70% 0.05 255)", marginBottom: 6 }}>
                Maximum Attempt Count
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={currentMaxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "oklch(13% 0.02 255)",
                  border: "1px solid oklch(28% 0.04 255)",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 14,
                }}
              />
              <p style={{ fontSize: 11, color: "oklch(50% 0.04 255)", marginTop: 4 }}>
                If job fails this many times, it is permanently parked in the Dead Letter Queue (DLQ).
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

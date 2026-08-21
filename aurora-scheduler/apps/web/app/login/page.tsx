"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { authApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const fn = mode === "login" ? authApi.login : authApi.register;
      const { data } = await fn(email, password);
      localStorage.setItem("access_token", data.accessToken);
      localStorage.setItem("refresh_token", data.refreshToken);
      localStorage.setItem("user_id", data.user.id);
      localStorage.setItem("user_email", data.user.email);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "10%",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(46% 0.22 220 / 0.12) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "10%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(55% 0.2 280 / 0.1) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card aurora-glow w-full max-w-md p-8 relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background:
                  "linear-gradient(135deg, oklch(55% 0.22 220), oklch(55% 0.2 280))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              ⚡
            </div>
            <span
              className="gradient-text"
              style={{ fontSize: 24, fontWeight: 700 }}
            >
              Aurora Scheduler
            </span>
          </div>
          <p style={{ color: "oklch(55% 0.04 255)", fontSize: 14 }}>
            Distributed job scheduling platform
          </p>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            background: "oklch(13% 0.02 255)",
            borderRadius: 8,
            padding: 4,
            marginBottom: 24,
          }}
        >
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                transition: "all 0.2s",
                background:
                  mode === m
                    ? "oklch(22% 0.05 220)"
                    : "transparent",
                color:
                  mode === m
                    ? "oklch(80% 0.18 220)"
                    : "oklch(55% 0.04 255)",
              }}
            >
              {m === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "oklch(70% 0.05 255)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "oklch(13% 0.02 255)",
                border: "1px solid oklch(28% 0.04 255)",
                borderRadius: 8,
                color: "oklch(92% 0.01 255)",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "oklch(55% 0.22 220)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "oklch(28% 0.04 255)")
              }
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "oklch(70% 0.05 255)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "oklch(13% 0.02 255)",
                border: "1px solid oklch(28% 0.04 255)",
                borderRadius: 8,
                color: "oklch(92% 0.01 255)",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "oklch(55% 0.22 220)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "oklch(28% 0.04 255)")
              }
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "oklch(25% 0.1 25 / 0.3)",
                border: "1px solid oklch(45% 0.18 25 / 0.4)",
                borderRadius: 8,
                color: "oklch(72% 0.2 25)",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px",
              background: loading
                ? "oklch(35% 0.12 220)"
                : "linear-gradient(135deg, oklch(46% 0.22 220), oklch(46% 0.2 260))",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading
              ? "..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        {/* Demo credentials */}
        <div
          style={{
            marginTop: 20,
            padding: "12px",
            background: "oklch(15% 0.03 255)",
            borderRadius: 8,
            border: "1px dashed oklch(32% 0.05 255)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "oklch(55% 0.04 255)",
              marginBottom: 4,
            }}
          >
            Demo credentials
          </p>
          <code style={{ fontSize: 12, color: "oklch(72% 0.12 220)" }}>
            demo@aurora.dev / demo12345
          </code>
        </div>
      </motion.div>
    </div>
  );
}

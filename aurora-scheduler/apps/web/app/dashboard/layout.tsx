"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  List,
  Briefcase,
  Server,
  AlertTriangle,
  Settings,
  LogOut,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queues", label: "Queues", icon: List },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/workers", label: "Workers", icon: Server },
  { href: "/dlq", label: "Dead Letter Queue", icon: AlertTriangle },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useRealtimeEvents();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setUserEmail(localStorage.getItem("user_email") || "");
  }, [router]);

  function logout() {
    localStorage.clear();
    router.push("/login");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        style={{
          background: "oklch(14% 0.022 255)",
          borderRight: "1px solid oklch(22% 0.035 255)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid oklch(22% 0.035 255)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                "linear-gradient(135deg, oklch(55% 0.22 220), oklch(55% 0.2 280))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ⚡
          </div>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="gradient-text"
              style={{ fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}
            >
              Aurora
            </motion.span>
          )}
        </div>

        {/* Live indicator */}
        {sidebarOpen && (
          <div
            style={{
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{ position: "relative", width: 8, height: 8 }}
              className="live-dot"
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "oklch(68% 0.19 145)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: "oklch(55% 0.04 255)",
                letterSpacing: "0.05em",
              }}
            >
              LIVE
            </span>
          </div>
        )}

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${active ? "active" : ""}`}
                title={!sidebarOpen ? label : undefined}
                style={{ justifyContent: sidebarOpen ? "flex-start" : "center" }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {label}
                  </motion.span>
                )}
                {sidebarOpen && active && (
                  <ChevronRight
                    size={14}
                    style={{ marginLeft: "auto", opacity: 0.6 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div
          style={{
            padding: "12px 8px",
            borderTop: "1px solid oklch(22% 0.035 255)",
          }}
        >
          {sidebarOpen && (
            <div
              style={{
                padding: "8px 12px",
                marginBottom: 4,
                borderRadius: 8,
                background: "oklch(17% 0.025 255)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "oklch(50% 0.04 255)",
                  marginBottom: 2,
                }}
              >
                Signed in as
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "oklch(75% 0.05 255)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userEmail}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="nav-item"
            style={{
              width: "100%",
              border: "none",
              cursor: "pointer",
              background: "transparent",
              justifyContent: sidebarOpen ? "flex-start" : "center",
            }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: "absolute",
            right: -12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "oklch(22% 0.04 255)",
            border: "1px solid oklch(30% 0.05 255)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          <ChevronRight
            size={12}
            style={{
              color: "oklch(60% 0.05 255)",
              transform: sidebarOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.25s",
            }}
          />
        </button>
      </motion.aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}

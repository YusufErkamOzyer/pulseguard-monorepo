"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  Database,
  Sparkles,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Layers,
  ShieldCheck,
  Terminal,
  Clock,
  ArrowUpRight,
  Send,
  Zap,
} from "lucide-react";
import {
  API_BASE_URL,
  fetchHealth,
  fetchSystemLogs,
  createSystemLog,
  runAiTest,
  HealthResponse,
  SystemLogRecord,
  AiTestResponse,
} from "@/lib/api";

export default function DashboardPage() {
  // State for Card 1 (Health & DB)
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLatency, setHealthLatency] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false);

  // State for Card 2 (DB Write & Event Table)
  const [logs, setLogs] = useState<SystemLogRecord[]>([]);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [isWritingLog, setIsWritingLog] = useState(false);
  const [customEventType, setCustomEventType] = useState("SYNTHETIC_TRANSACTION");
  const [customMessage, setCustomMessage] = useState("");

  // State for Card 3 (AI Pipeline)
  const [aiPrompt, setAiPrompt] = useState(
    "Verify system readiness for SaaS tenant dispatch pipeline."
  );
  const [aiResult, setAiResult] = useState<AiTestResponse | null>(null);
  const [aiLatency, setAiLatency] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);

  // Auto-refresh interval or initial load
  const loadHealthAndLogs = async () => {
    setIsHealthRefreshing(true);
    const [hRes, lRes] = await Promise.all([fetchHealth(), fetchSystemLogs()]);

    setHealth(hRes.data);
    setHealthLatency(hRes.latencyMs);
    setHealthError(hRes.error);

    if (lRes.data) {
      setLogs(lRes.data.logs);
      setTotalLogs(lRes.data.total);
      setLogsError(null);
    } else {
      setLogsError(lRes.error);
    }

    setIsHealthRefreshing(false);
  };

  useEffect(() => {
    loadHealthAndLogs();
    const interval = setInterval(() => {
      fetchHealth().then((res) => {
        setHealth(res.data);
        setHealthLatency(res.latencyMs);
        setHealthError(res.error);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Write synthetic event to PostgreSQL
  const handleWriteEvent = async () => {
    setIsWritingLog(true);
    setLogsError(null);

    const syntheticMessage =
      customMessage.trim() ||
      `Synthetic enterprise telemetry event logged from Next.js UI at ${new Date().toLocaleTimeString()}`;

    const res = await createSystemLog({
      event_type: customEventType.trim() || "SYNTHETIC_EVENT",
      message: syntheticMessage,
      metadata: {
        origin: "nextjs_dashboard",
        viewport: "client_browser",
        timestamp: new Date().toISOString(),
      },
    });

    if (res.data && res.data.success) {
      setLogs(res.data.logs);
      setTotalLogs(res.data.total);
      setCustomMessage("");
      // Update health log count in sync
      if (health) {
        setHealth({ ...health, total_logs: res.data.total });
      }
    } else {
      setLogsError(res.error || "Failed to persist log to PostgreSQL");
    }
    setIsWritingLog(false);
  };

  // Test AI Engine Pipeline
  const handleTestAi = async () => {
    setIsAiRunning(true);
    setAiError(null);

    const res = await runAiTest(aiPrompt);
    setAiLatency(res.latencyMs);

    if (res.data) {
      setAiResult(res.data);
      // AI probe creates a log record on backend, refresh log list
      fetchSystemLogs().then((lRes) => {
        if (lRes.data) {
          setLogs(lRes.data.logs);
          setTotalLogs(lRes.data.total);
        }
      });
    } else {
      setAiError(res.error || "AI service execution failed");
    }
    setIsAiRunning(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-cyan-500 selection:text-neutral-950">
      {/* Top Enterprise Navigation Bar with SaaS Workflows Placeholders */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
                OPERATION SSS
              </span>
              <span className="ml-2 text-xs font-mono uppercase px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-300">
                Core Skeleton
              </span>
            </div>
          </div>

          {/* Placeholder Navigation: Ready for 3 Phase 1 SaaS Workflows */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              disabled
              className="px-3 py-1.5 text-xs font-medium text-neutral-500 border border-transparent rounded-md cursor-not-allowed flex items-center space-x-1.5"
              title="Phase 1: Domain Workflow 1 (Pending SaaS Vertical Selection)"
            >
              <span>Workflow A</span>
              <span className="text-[10px] bg-neutral-800 text-neutral-500 px-1.5 py-0.2 rounded font-mono">
                Phase 1
              </span>
            </button>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-medium text-neutral-500 border border-transparent rounded-md cursor-not-allowed flex items-center space-x-1.5"
              title="Phase 1: Domain Workflow 2 (Pending SaaS Vertical Selection)"
            >
              <span>Workflow B</span>
              <span className="text-[10px] bg-neutral-800 text-neutral-500 px-1.5 py-0.2 rounded font-mono">
                Phase 1
              </span>
            </button>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-medium text-neutral-500 border border-transparent rounded-md cursor-not-allowed flex items-center space-x-1.5"
              title="Phase 1: Domain Workflow 3 (Pending SaaS Vertical Selection)"
            >
              <span>Workflow C</span>
              <span className="text-[10px] bg-neutral-800 text-neutral-500 px-1.5 py-0.2 rounded font-mono">
                Phase 1
              </span>
            </button>
          </nav>

          {/* Telemetry Header Pill */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-xs font-mono px-3 py-1.5 rounded-full border border-neutral-800 bg-neutral-900">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    health?.status === "operational" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    health?.status === "operational" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </span>
              <span className="text-neutral-300">
                {health?.status === "operational" ? "API LIVE" : "DISCONNECTED"}
              </span>
              {healthLatency !== null && (
                <span className="text-neutral-500 border-l border-neutral-800 pl-2">
                  {healthLatency}ms
                </span>
              )}
            </div>

            <button
              onClick={loadHealthAndLogs}
              disabled={isHealthRefreshing}
              className="p-2 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition disabled:opacity-50"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${isHealthRefreshing ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner / Headline */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-neutral-800/60">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              System Readiness & Telemetry Dashboard
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              SaaS-Agnostic Core Infrastructure Verification &bull; Rails 8 API + PostgreSQL 17 + Gemini AI Layer
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-lg">
            <span className="text-neutral-500">API Endpoint:</span>
            <span className="text-cyan-400 font-semibold">{API_BASE_URL}</span>
          </div>
        </div>

        {/* 3 Core Verification Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ========================================================
              CARD 1: Live Rails 8 API & PostgreSQL Status
             ======================================================== */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-cyan-500/40 transition">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white text-base">Backend & Database</h2>
                    <p className="text-xs text-neutral-400">Card 1: Real-time Health Ping</p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                    health?.status === "operational"
                      ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-400"
                      : "border-red-500/30 bg-red-950/50 text-red-400"
                  }`}
                >
                  {health?.status?.toUpperCase() || "OFFLINE"}
                </span>
              </div>

              {healthError ? (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <div className="font-semibold">Connectivity Error</div>
                    <div className="text-neutral-400 mt-0.5">{healthError}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/60 text-xs">
                    <span className="text-neutral-400 flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-neutral-500" /> Rails Version:
                    </span>
                    <span className="font-mono text-cyan-300 font-semibold">
                      {health?.rails_version || "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/60 text-xs">
                    <span className="text-neutral-400 flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-neutral-500" /> PostgreSQL Connection:
                    </span>
                    <span className="font-mono font-semibold flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {health?.db_connected ? "Connected (Healthy)" : "Disconnected"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/60 text-xs">
                    <span className="text-neutral-400 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-neutral-500" /> Round-Trip Latency:
                    </span>
                    <span className="font-mono font-semibold text-white">
                      {healthLatency !== null ? `${healthLatency} ms` : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950/70 border border-neutral-800/60 text-xs">
                    <span className="text-neutral-400 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" /> AI Service Mode:
                    </span>
                    <span
                      className={`font-mono text-[11px] px-2 py-0.5 rounded font-semibold ${
                        health?.ai_mode === "live_gemini"
                          ? "bg-purple-950/80 text-purple-300 border border-purple-800"
                          : "bg-amber-950/80 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {health?.ai_mode || "—"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>DB Records: {health?.total_logs ?? totalLogs}</span>
              <span>{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "—"}</span>
            </div>
          </div>

          {/* ========================================================
              CARD 2: End-to-End Database Write Test
             ======================================================== */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white text-base">PostgreSQL Read/Write</h2>
                    <p className="text-xs text-neutral-400">Card 2: E2E Transaction Test</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800 text-neutral-300">
                  {totalLogs} Events
                </span>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400">Event Tag</label>
                  <input
                    type="text"
                    value={customEventType}
                    onChange={(e) => setCustomEventType(e.target.value)}
                    placeholder="e.g. USER_PROVISIONED"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400">Telemetry Payload</label>
                  <input
                    type="text"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Custom payload note (optional)"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleWriteEvent}
                  disabled={isWritingLog}
                  className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs tracking-wide shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <Zap className={`h-4 w-4 ${isWritingLog ? "animate-spin" : ""}`} />
                  <span>
                    {isWritingLog ? "Committing to DB..." : "Write Synthetic Event to PostgreSQL"}
                  </span>
                </button>

                {logsError && (
                  <p className="text-xs text-red-400 font-mono pt-1">{logsError}</p>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>Target Table: system_logs</span>
              <span className="text-emerald-400">Zero Refresh Sync</span>
            </div>
          </div>

          {/* ========================================================
              CARD 3: Backend-Only AI Pass Engine Test
             ======================================================== */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-purple-500/40 transition">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/50 text-purple-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white text-base">Backend AI Engine</h2>
                    <p className="text-xs text-neutral-400">Card 3: Resilient Gemini Pass</p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                    aiResult?.mode === "live_gemini"
                      ? "border-purple-500/30 bg-purple-950/50 text-purple-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {aiResult?.mode?.toUpperCase() || "READY"}
                </span>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400">Prompt / Intent</label>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Enter test prompt for backend LLM pipeline..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-purple-500 resize-none font-sans"
                  />
                </div>

                <button
                  onClick={handleTestAi}
                  disabled={isAiRunning}
                  className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs tracking-wide shadow-lg shadow-purple-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <Send className={`h-4 w-4 ${isAiRunning ? "animate-pulse" : ""}`} />
                  <span>
                    {isAiRunning ? "Calling Rails AI Service..." : "Test Rails AI Pipeline"}
                  </span>
                </button>

                {aiError && (
                  <p className="text-xs text-red-400 font-mono pt-1">{aiError}</p>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>Security: Backend-Only Key</span>
              {aiLatency !== null && <span className="text-purple-400">{aiLatency} ms</span>}
            </div>
          </div>
        </div>

        {/* AI Response Output Block if executed */}
        {aiResult && (
          <div className="rounded-xl border border-purple-900/50 bg-neutral-900/60 p-5 shadow-2xl relative">
            <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
              <div className="flex items-center space-x-2 text-xs font-mono">
                <Terminal className="h-4 w-4 text-purple-400" />
                <span className="text-purple-300 font-semibold">
                  AI Pipeline Structured Response
                </span>
                <span className="text-neutral-500">({aiResult.mode})</span>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                {new Date(aiResult.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80 mb-3">
              <div className="text-xs font-mono text-neutral-400 mb-1">actionable_pass_preview:</div>
              <p className="text-sm text-neutral-100 font-sans">
                {aiResult.actionable_pass_preview}
              </p>
            </div>

            <div className="text-[11px] font-mono text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
              <span>Status: <strong className="text-neutral-300">{aiResult.status}</strong></span>
              <span>Mode: <strong className="text-neutral-300">{aiResult.mode}</strong></span>
              {aiResult.model && (
                <span>Model: <strong className="text-neutral-300">{aiResult.model}</strong></span>
              )}
              {aiResult.fallback_reason && (
                <span>Fallback Reason: <strong className="text-amber-400">{aiResult.fallback_reason}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* Live PostgreSQL Event Telemetry Table */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-900/50">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">
                Live PostgreSQL Telemetry Stream (`system_logs`)
              </h3>
              <span className="text-xs font-mono text-neutral-500">
                ({logs.length} most recent)
              </span>
            </div>
            <button
              onClick={() => fetchSystemLogs().then((res) => res.data && setLogs(res.data.logs))}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Poll Now</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-950/80 text-neutral-400 border-b border-neutral-800/60 uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Message</th>
                  <th className="py-3 px-4">Metadata</th>
                  <th className="py-3 px-4">Recorded At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50 text-neutral-300">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      No system logs found in PostgreSQL.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-800/30 transition">
                      <td className="py-3 px-4 text-neutral-500">#{log.id}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-cyan-300 font-semibold">
                          {log.event_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-200 max-w-md truncate">
                        {log.message}
                      </td>
                      <td className="py-3 px-4 text-neutral-400 max-w-xs truncate">
                        {log.metadata ? JSON.stringify(log.metadata) : "—"}
                      </td>
                      <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 py-6 text-center text-xs font-mono text-neutral-600">
        Operation SSS &bull; Phase 0: SaaS-Agnostic Core Infrastructure &bull; Deploy Rule: Day 1
      </footer>
    </div>
  );
}

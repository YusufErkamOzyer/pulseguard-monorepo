"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  Copy,
  ExternalLink,
  Filter,
  Globe,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  TrendingDown,
  X,
  Zap,
} from "lucide-react";
import {
  ServiceRecord,
  AlertRecord,
  NoiseMetrics,
  fetchAlerts,
  fetchAlertMetrics,
  simulateAlertStorm,
} from "@/lib/api";

interface AiopsAlertStreamTabProps {
  services: ServiceRecord[];
  onSelectIncident?: (incidentId: number) => void;
}

export function AiopsAlertStreamTab({
  services,
  onSelectIncident,
}: AiopsAlertStreamTabProps) {
  // Feed & Metrics State
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [metrics, setMetrics] = useState<NoiseMetrics | null>(null);
  const [totalAlertsCount, setTotalAlertsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters State
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Storm Simulation State
  const [selectedStormServiceSlug, setSelectedStormServiceSlug] = useState<string>(
    services[0]?.slug || "cisco-duo-auth"
  );
  const [isSimulatingStorm, setIsSimulatingStorm] = useState<boolean>(false);
  const [stormToast, setStormToast] = useState<{
    show: boolean;
    summary: {
      raw_alerts_ingested: number;
      suppressed_count: number;
      grouped_count: number;
      noise_reduction_ratio: number;
      noise_reduction_percentage: number;
    };
    incidentId?: number;
    incidentTitle?: string;
  } | null>(null);

  // Expanded Metadata drawer / modal
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState<string | null>(null);

  // --- Fetch Alerts & Metrics ---
  const loadAlertStream = useCallback(async () => {
    setIsLoading(true);
    try {
      const [alertsRes, metricsRes] = await Promise.all([
        fetchAlerts({
          service_id: serviceFilter !== "all" ? serviceFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          severity: severityFilter !== "all" ? severityFilter : undefined,
          source: sourceFilter !== "all" ? sourceFilter : undefined,
          limit: 100,
        }),
        fetchAlertMetrics({
          service_id: serviceFilter !== "all" ? serviceFilter : undefined,
        }),
      ]);

      if (alertsRes.data) {
        setAlerts(alertsRes.data.alerts);
        setTotalAlertsCount(alertsRes.data.total || alertsRes.data.alerts.length);
      }
      if (metricsRes.data) {
        setMetrics(metricsRes.data);
      }
    } catch (err) {
      console.error("Failed to load alert stream:", err);
    } finally {
      setIsLoading(false);
    }
  }, [serviceFilter, statusFilter, severityFilter, sourceFilter]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchAlerts({
        service_id: serviceFilter !== "all" ? serviceFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        limit: 100,
      }),
      fetchAlertMetrics({
        service_id: serviceFilter !== "all" ? serviceFilter : undefined,
      }),
    ]).then(([alertsRes, metricsRes]) => {
      if (!ignore) {
        if (alertsRes.data) {
          setAlerts(alertsRes.data.alerts);
          setTotalAlertsCount(alertsRes.data.total || alertsRes.data.alerts.length);
        }
        if (metricsRes.data) {
          setMetrics(metricsRes.data);
        }
        setIsLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [serviceFilter, statusFilter, severityFilter, sourceFilter]);

  const stormServiceSlug = selectedStormServiceSlug || services[0]?.slug || "cisco-duo-auth";

  // --- Simulate Alert Storm Action ---
  const handleSimulateAlertStorm = async () => {
    setIsSimulatingStorm(true);
    setStormToast(null);

    try {
      const res = await simulateAlertStorm({
        service_slug: stormServiceSlug,
        burst_size: 30,
      });

      if (res.data?.success && res.data.storm_summary) {
        setStormToast({
          show: true,
          summary: res.data.storm_summary,
          incidentId: res.data.incident?.id,
          incidentTitle: res.data.incident?.title,
        });

        // Refetch alert feed & metrics to display newly created burst
        await loadAlertStream();
      }
    } catch (err) {
      console.error("Failed to simulate alert storm:", err);
    } finally {
      setIsSimulatingStorm(false);
    }
  };

  // Copy fingerprint helper
  const handleCopyFingerprint = (fp: string) => {
    navigator.clipboard.writeText(fp);
    setCopiedFingerprint(fp);
    setTimeout(() => setCopiedFingerprint(null), 2000);
  };

  // Filter alerts by search query client-side
  const filteredAlerts = useMemo(() => {
    if (!searchQuery.trim()) return alerts;
    const q = searchQuery.toLowerCase();
    return alerts.filter(
      (a) =>
        a.message.toLowerCase().includes(q) ||
        a.fingerprint.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        (a.service_name && a.service_name.toLowerCase().includes(q))
    );
  }, [alerts, searchQuery]);

  // Source icon helper
  const getSourceIcon = (source: string) => {
    switch (source) {
      case "Cisco Catalyst Center":
        return <Shield className="w-3.5 h-3.5 text-blue-400" />;
      case "Datadog":
        return <Activity className="w-3.5 h-3.5 text-purple-400" />;
      case "ThousandEyes":
        return <Globe className="w-3.5 h-3.5 text-amber-400" />;
      case "AWS CloudWatch":
        return <Cloud className="w-3.5 h-3.5 text-orange-400" />;
      case "Kubernetes Event":
        return <Boxes className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <Radio className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Format relative time helper
  const [nowMs] = useState<number>(() => Date.now());
  const formatTimeAgo = (dateStr: string) => {
    const diff = Math.max(0, Math.floor((nowMs - new Date(dateStr).getTime()) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const noiseRatioPercent = metrics
    ? metrics.noise_reduction_percentage !== undefined
      ? metrics.noise_reduction_percentage
      : (metrics.noise_reduction_ratio * 100).toFixed(1)
    : "93.3";

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP AIOPS CONTROL BAR & ALERT STORM SIMULATOR TRIGGER                  */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                AIOps Intelligent Stream &amp; Noise Reduction Engine
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                PagerDuty Operations Cloud Match
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Consolidates high-velocity telemetry across Cisco Catalyst Center, Datadog,
              ThousandEyes, AWS CloudWatch, and Kubernetes. Suppresses cascade noise and groups
              root signals into actionable SEV-1 incidents.
            </p>
          </div>

          {/* Action Trigger: Simulate Alert Storm */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Target Service
              </span>
              <select
                value={stormServiceSlug}
                onChange={(e) => setSelectedStormServiceSlug(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {services.map((svc) => (
                  <option key={svc.id} value={svc.slug}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSimulateAlertStorm}
              disabled={isSimulatingStorm}
              className="group relative flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:via-orange-400 hover:to-rose-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-orange-500/25 transition cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
              <span>
                {isSimulatingStorm
                  ? "Ingesting Burst & Grouping 30 Alarms..."
                  : "⚡ Simulate Alert Storm (30 Alarms)"}
              </span>
            </button>
          </div>
        </div>

        {/* Storm Feedback Toast Banner */}
        {stormToast && (
          <div className="mt-4 p-4 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white flex items-center gap-2">
                  <span>⚡ Alert Storm Ingested Successfully!</span>
                  <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/30">
                    {stormToast.summary.noise_reduction_percentage}% Noise Suppressed
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Ingested <strong>{stormToast.summary.raw_alerts_ingested} raw telemetry alerts</strong>.
                  Consolidated <strong>{stormToast.summary.grouped_count} primary root signals</strong> into{" "}
                  <strong className="text-emerald-300">{stormToast.incidentTitle || "Incident"}</strong>, and
                  suppressed <strong>{stormToast.summary.suppressed_count} cascading duplicate alarms</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {stormToast.incidentId && onSelectIncident && (
                <button
                  onClick={() => onSelectIncident(stormToast.incidentId!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
                >
                  <span>View Incident in Command Center</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setStormToast(null)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. NOISE REDUCTION KPI RIBBON WITH GLOWING RATIO BADGE (>= 90%)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Alerts Ingested */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Total Raw Alerts
            </span>
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white font-mono">
              {metrics?.total_alerts ?? alerts.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Across 5 enterprise telemetry sources
            </div>
          </div>
        </div>

        {/* Card 2: Grouped Alarms */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Grouped Signals
            </span>
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {metrics?.grouped_alerts ?? 0}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">
              Correlated into active SEV-1/SEV-2
            </div>
          </div>
        </div>

        {/* Card 3: Suppressed Cascade Noise */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Suppressed Noise
            </span>
            <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
              <Filter className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-400 font-mono">
              {metrics?.suppressed_noise ?? 0}
            </div>
            <div className="text-[10px] text-purple-400/80 mt-0.5">
              Downstream duplicate cascade drops
            </div>
          </div>
        </div>

        {/* Card 4: Consolidated Incidents */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Consolidated Incidents
            </span>
            <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-400 font-mono">
              {metrics?.consolidated_incidents ?? 1}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">
              Active operational incident queue
            </div>
          </div>
        </div>

        {/* Card 5 (HERO): Noise Reduction Ratio Badge with Pulsating Glow */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 border-2 border-emerald-500/50 rounded-xl p-4 shadow-lg shadow-emerald-500/20 flex flex-col justify-between">
          {/* Ambient background glow */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Noise Reduction Ratio
            </span>
            <div className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-black text-emerald-300 font-mono tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                {noiseRatioPercent}%
              </div>
              <span className="text-[11px] font-bold text-emerald-400 font-mono">
                (&gt;90% SLA)
              </span>
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5">
              Alert storm correlation &amp; noise filter
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LIVE FILTERABLE ALERT FEED TOOLBAR                                     */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search alert message, fingerprint, or source..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Right Action: Service Dropdown + Refresh */}
          <div className="flex items-center gap-2">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Cisco Monitored Services</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </select>

            <button
              onClick={loadAlertStream}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Refresh Stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Pills: Status, Severity, Source */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Status Pills */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Status:</span>
            {(["all", "unprocessed", "grouped", "suppressed_noise"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  statusFilter === st
                    ? "bg-indigo-600 text-white font-bold"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {st === "all"
                  ? "All"
                  : st === "grouped"
                  ? "Grouped"
                  : st === "suppressed_noise"
                  ? "Suppressed"
                  : "Unprocessed"}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden md:block" />

          {/* Severity Pills */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Severity:</span>
            {(["all", "critical", "warning", "info"] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  severityFilter === sev
                    ? sev === "critical"
                      ? "bg-rose-600 text-white font-bold"
                      : sev === "warning"
                      ? "bg-amber-600 text-white font-bold"
                      : "bg-blue-600 text-white font-bold"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {sev.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden md:block" />

          {/* Source Pills */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Source:</span>
            {(
              [
                "all",
                "Cisco Catalyst Center",
                "Datadog",
                "ThousandEyes",
                "AWS CloudWatch",
                "Kubernetes Event",
              ] as const
            ).map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  sourceFilter === src
                    ? "bg-slate-700 text-white font-bold"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {src === "all" ? "All Sources" : src}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. RICH TABLE / CARD FEED RENDERING                                      */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <div className="col-span-2">Source &amp; Severity</div>
          <div className="col-span-2">AIOps Status</div>
          <div className="col-span-5">Service &amp; Telemetry Signal</div>
          <div className="col-span-2">Fingerprint</div>
          <div className="col-span-1 text-right">Age</div>
        </div>

        {/* Loading state */}
        {isLoading && alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
            <p className="text-xs">Loading live telemetry stream from Rails API...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-1">
            <p className="font-semibold text-slate-400">No alerts match current filter criteria.</p>
            <p>Try resetting filters or triggering an alert storm simulation above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredAlerts.map((alert) => {
              const isExpanded = expandedAlertId === alert.id;

              return (
                <div
                  key={alert.id}
                  className={`p-4 transition ${
                    alert.status === "grouped"
                      ? "bg-emerald-950/10 hover:bg-emerald-950/20"
                      : alert.status === "suppressed_noise"
                      ? "bg-slate-950/40 hover:bg-slate-800/30 opacity-90"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <div className="grid grid-cols-12 gap-3 items-start">
                    {/* Source & Severity */}
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-200">
                        {getSourceIcon(alert.source)}
                        <span className="font-semibold truncate">{alert.source}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold w-fit ${
                          alert.severity === "critical"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : alert.severity === "warning"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            alert.severity === "critical"
                              ? "bg-rose-400 animate-pulse"
                              : alert.severity === "warning"
                              ? "bg-amber-400"
                              : "bg-blue-400"
                          }`}
                        />
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>

                    {/* AIOps Status Badge */}
                    <div className="col-span-2 flex flex-col gap-1">
                      {alert.status === "grouped" ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            GROUPED
                          </span>
                          {alert.incident_id && onSelectIncident ? (
                            <button
                              onClick={() => onSelectIncident(alert.incident_id!)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-mono text-left underline"
                            >
                              <span>Incident #{alert.incident_id}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          ) : alert.incident_id ? (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Incident #{alert.incident_id}
                            </span>
                          ) : null}
                        </div>
                      ) : alert.status === "suppressed_noise" ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 w-fit">
                            <Filter className="w-3 h-3 text-slate-500" />
                            SUPPRESSED
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Cascade noise drop
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 w-fit">
                          <Clock className="w-3 h-3 text-amber-400" />
                          UNPROCESSED
                        </span>
                      )}
                    </div>

                    {/* Service & Message */}
                    <div className="col-span-5 space-y-1">
                      <div className="text-[11px] font-bold text-slate-400">
                        {alert.service_name || "Cisco Service"}
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans font-medium">
                        {alert.message}
                      </p>
                      {/* Telemetry metadata toggle */}
                      {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                        <button
                          onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono transition pt-0.5"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>{isExpanded ? "Hide Payload" : "Inspect Telemetry Payload"}</span>
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    {/* Fingerprint */}
                    <div className="col-span-2">
                      <div className="flex items-center gap-1">
                        <span
                          className="font-mono text-[10px] text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800/80 truncate max-w-[140px]"
                          title={alert.fingerprint}
                        >
                          {alert.fingerprint}
                        </span>
                        <button
                          onClick={() => handleCopyFingerprint(alert.fingerprint)}
                          className="p-1 text-slate-500 hover:text-slate-300 rounded transition"
                          title="Copy Fingerprint"
                        >
                          {copiedFingerprint === alert.fingerprint ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Age / Timestamp */}
                    <div className="col-span-1 text-right">
                      <span
                        className="text-[11px] font-mono text-slate-400"
                        title={new Date(alert.created_at).toLocaleString()}
                      >
                        {formatTimeAgo(alert.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded JSON Telemetry Payload Drawer */}
                  {isExpanded && alert.metadata && (
                    <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-lg animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Terminal className="w-3 h-3 text-indigo-400" />
                          Raw Telemetry JSON Payload
                        </span>
                        <span className="text-slate-500 font-mono">
                          ID: #{alert.id} &bull; Created: {alert.created_at}
                        </span>
                      </div>
                      <pre className="text-[11px] font-mono text-indigo-300 bg-slate-900/60 p-2.5 rounded border border-slate-800/80 overflow-x-auto leading-relaxed">
                        {JSON.stringify(alert.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info bar */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-200">{filteredAlerts.length}</strong> of{" "}
            <strong className="text-slate-200">{totalAlertsCount}</strong> telemetry alerts
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            AIOps Stream Auto-correlated via Rails 8 Engine
          </span>
        </div>
      </div>
    </div>
  );
}

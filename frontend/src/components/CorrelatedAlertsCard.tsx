"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertRecord,
  fetchAlerts,
  simulateAlertStorm,
} from "@/lib/api";
import {
  Layers,
  VolumeX,
  Volume2,
  RefreshCw,
  Zap,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CorrelatedAlertsCardProps {
  incidentId: number;
  incidentTitle: string;
  serviceName?: string;
  serviceSlug?: string;
  isResolved?: boolean;
  onAlertsUpdated?: () => void;
}

export function CorrelatedAlertsCard({
  incidentId,
  incidentTitle,
  serviceName,
  serviceSlug,
  isResolved = false,
  onAlertsUpdated,
}: CorrelatedAlertsCardProps) {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<"all" | "grouped" | "suppressed_noise">("all");
  const [isSimulatingStorm, setIsSimulatingStorm] = useState<boolean>(false);
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [stormSuccessMsg, setStormSuccessMsg] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchAlerts({ incident_id: incidentId, limit: 100 });
    if (res.data?.alerts) {
      setAlerts(res.data.alerts);
    }
    setIsLoading(false);
  }, [incidentId]);

  useEffect(() => {
    let ignore = false;
    fetchAlerts({ incident_id: incidentId, limit: 100 }).then((res) => {
      if (!ignore) {
        if (res.data?.alerts) {
          setAlerts(res.data.alerts);
        }
        setIsLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [incidentId]);

  const handleSimulateStorm = async () => {
    setIsSimulatingStorm(true);
    setStormSuccessMsg(null);

    const res = await simulateAlertStorm({
      service_slug: serviceSlug,
      incident_id: incidentId,
      burst_size: 30,
    });

    setIsSimulatingStorm(false);

    if (res.data?.success) {
      setStormSuccessMsg(
        `⚡ Alert storm simulated! Ingested ${res.data.storm_summary.raw_alerts_ingested} alarms with ${res.data.storm_summary.noise_reduction_percentage}% noise suppression.`
      );
      await loadAlerts();
      if (onAlertsUpdated) onAlertsUpdated();
    }
  };

  const groupedCount = alerts.filter((a) => a.status === "grouped").length;
  const suppressedCount = alerts.filter((a) => a.status === "suppressed_noise").length;
  const totalCount = alerts.length;
  const noiseRatioPct =
    totalCount > 0 ? ((suppressedCount / totalCount) * 100).toFixed(1) : "0.0";

  const filteredAlerts = alerts.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case "Cisco Catalyst Center":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "Datadog":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      case "ThousandEyes":
        return "bg-teal-500/10 text-teal-400 border-teal-500/30";
      case "AWS CloudWatch":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "Kubernetes Event":
        return "bg-slate-700/40 text-slate-300 border-slate-600/40";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      case "warning":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default:
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              AIOps Correlated Child Alerts
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {totalCount} Total Signals
              </span>
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            {serviceName ? `${serviceName} • ` : ""}{incidentTitle} • Signal clustering and noise suppression
          </p>
        </div>

        {/* Noise Reduction KPI Badge */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <div className="px-3 py-1.5 bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-lg flex items-center gap-2">
            <VolumeX className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 leading-none">Noise Filtered</div>
              <div className="text-xs font-mono font-bold text-emerald-300">
                {noiseRatioPct}% ({suppressedCount}/{totalCount})
              </div>
            </div>
          </div>

          <button
            onClick={loadAlerts}
            disabled={isLoading}
            title="Refresh alerts"
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Success feedback */}
      {stormSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{stormSuccessMsg}</span>
        </div>
      )}

      {/* Filter Tabs & Quick Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800/80 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
              filter === "all"
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({totalCount})
          </button>

          <button
            onClick={() => setFilter("grouped")}
            className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              filter === "grouped"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Primary Grouped ({groupedCount})
          </button>

          <button
            onClick={() => setFilter("suppressed_noise")}
            className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              filter === "suppressed_noise"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <VolumeX className="w-3 h-3 text-purple-400" />
            Suppressed Noise ({suppressedCount})
          </button>
        </div>

        {/* If active, option to burst alert storm */}
        {!isResolved && (
          <button
            onClick={handleSimulateStorm}
            disabled={isSimulatingStorm}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600/20 to-orange-600/20 hover:from-amber-600/30 hover:to-orange-600/30 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            {isSimulatingStorm
              ? "Ingesting Burst..."
              : totalCount === 0
              ? "⚡ Ingest Alert Storm (30 Alarms)"
              : "+ Re-burst Storm"}
          </button>
        )}
      </div>

      {/* Empty State */}
      {totalCount === 0 && !isLoading ? (
        <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300">
              No Raw Alerts Clustered to This Incident
            </h4>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-1">
              Simulate an alert storm to ingest 30 correlated telemetry signals from Catalyst Center, Datadog, ThousandEyes, and CloudWatch.
            </p>
          </div>
          <button
            onClick={handleSimulateStorm}
            disabled={isSimulatingStorm}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            {isSimulatingStorm ? "Ingesting Burst..." : "Simulate Alert Storm (30 Alarms)"}
          </button>
        </div>
      ) : null}

      {/* Alerts Feed List */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {filteredAlerts.map((alert) => {
          const isExpanded = expandedAlertId === alert.id;
          const hasMetadata = alert.metadata && Object.keys(alert.metadata).length > 0;

          return (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border transition ${
                alert.status === "grouped"
                  ? "bg-slate-900/90 border-emerald-500/30"
                  : "bg-slate-950/60 border-slate-800/80 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  {/* Badge Bar: Status, Source, Severity, Fingerprint */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    {/* Status badge */}
                    {alert.status === "grouped" ? (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Primary Signal
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-medium border border-slate-700/50 flex items-center gap-1">
                        <VolumeX className="w-2.5 h-2.5" />
                        Suppressed Noise
                      </span>
                    )}

                    {/* Source badge */}
                    <span
                      className={`px-1.5 py-0.2 rounded font-medium border ${getSourceBadgeColor(
                        alert.source
                      )}`}
                    >
                      {alert.source}
                    </span>

                    {/* Severity badge */}
                    <span
                      className={`px-1.5 py-0.2 rounded font-black uppercase border ${getSeverityBadge(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>

                    {/* Fingerprint snippet */}
                    <span className="font-mono text-slate-500 text-[9px] truncate max-w-[200px]">
                      {alert.fingerprint}
                    </span>
                  </div>

                  {/* Alert Message */}
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {alert.message}
                  </p>
                </div>

                {/* Right controls: Timestamp & metadata expand */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(alert.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  {hasMetadata && (
                    <button
                      onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                      className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-0.5 transition cursor-pointer"
                    >
                      <span>Details</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Metadata Drawer */}
              {isExpanded && hasMetadata && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                  <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Telemetry Metadata (Payload):
                  </div>
                  <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto">
                    {JSON.stringify(alert.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

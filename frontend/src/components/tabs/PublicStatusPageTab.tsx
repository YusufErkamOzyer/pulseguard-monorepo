"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ServiceRecord,
  StatusUpdateRecord,
  StatusPageResponse,
  fetchStatusPage,
  fetchStatusUpdates,
} from "@/lib/api";
import { UptimeBar90Day } from "@/components/UptimeBar90Day";

interface PublicStatusPageTabProps {
  services: ServiceRecord[];
  onUpdateServiceOnCall: (serviceId: number, newEngineer: string) => Promise<void>;
  onOpenChaosDrill: (serviceId?: number) => void;
  onViewIncident?: (incidentId: number) => void;
}

const PERSONAS = [
  "Alex Rivera (Principal SRE)",
  "Elena Rostova (Staff Platform Eng)",
  "Sarah Chen (VP of Infrastructure)",
];

export function PublicStatusPageTab({
  services,
  onUpdateServiceOnCall,
  onOpenChaosDrill,
  onViewIncident,
}: PublicStatusPageTabProps) {
  const [statusPageData, setStatusPageData] = useState<StatusPageResponse | null>(null);
  const [broadcasts, setBroadcasts] = useState<StatusUpdateRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [serviceUpdateLoading, setServiceUpdateLoading] = useState<number | null>(null);
  const [subscribedToast, setSubscribedToast] = useState<boolean>(false);

  // Load Status Page & Broadcasts
  const loadStatusData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [spRes, suRes] = await Promise.all([
        fetchStatusPage(),
        fetchStatusUpdates({ limit: 20 }),
      ]);

      if (spRes.data) {
        setStatusPageData(spRes.data);
      }
      if (suRes.data) {
        setBroadcasts(suRes.data.status_updates);
      } else if (spRes.data?.recent_broadcasts) {
        setBroadcasts(spRes.data.recent_broadcasts);
      }
    } catch (err) {
      console.error("Failed to load status page data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchStatusPage(),
      fetchStatusUpdates({ limit: 20 }),
    ]).then(([spRes, suRes]) => {
      if (!ignore) {
        if (spRes.data) {
          setStatusPageData(spRes.data);
        }
        if (suRes.data) {
          setBroadcasts(suRes.data.status_updates);
        } else if (spRes.data?.recent_broadcasts) {
          setBroadcasts(spRes.data.recent_broadcasts);
        }
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error("Failed to load status page data:", err);
      if (!ignore) setIsLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);

  // Handle engineer reassignment through parent handler
  const handleEngineerChange = async (serviceId: number, engineer: string) => {
    setServiceUpdateLoading(serviceId);
    try {
      await onUpdateServiceOnCall(serviceId, engineer);
      await loadStatusData();
    } finally {
      setServiceUpdateLoading(null);
    }
  };

  // Determine global status
  const globalStatus =
    statusPageData?.global_status ||
    (services.some((s) => s.status === "outage")
      ? "outage"
      : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational");

  // Fallback 90-day uptimes if not provided in service payload
  const getServiceUptime = (svc: ServiceRecord) => {
    const spService = statusPageData?.services?.find((s) => s.id === svc.id);
    if (spService?.uptime_90d) return spService.uptime_90d;

    const slug = svc.slug.toLowerCase();
    if (slug.includes("duo")) return svc.status === "outage" ? 99.5 : 99.95;
    if (slug.includes("webex")) return svc.status === "degraded" ? 99.8 : 99.92;
    if (slug.includes("meraki")) return 99.98;
    if (slug.includes("appdynamics")) return 99.96;
    if (slug.includes("licensing")) return 99.99;
    return 99.9;
  };

  const overallUptime =
    statusPageData?.metrics?.overall_uptime_90d ||
    (
      services.reduce((acc, s) => acc + getServiceUptime(s), 0) /
      Math.max(services.length, 1)
    ).toFixed(2);

  // Status badge style helper
  const getBroadcastBadge = (statusType: string) => {
    switch (statusType) {
      case "investigating":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Investigating
          </span>
        );
      case "identified":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Identified
          </span>
        );
      case "monitoring":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40">
            Monitoring
          </span>
        );
      case "resolved":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Resolved
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
            {statusType}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* 1. BRANDED PUBLIC STATUS PAGE HEADER (status.cisco.com)                  */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-500/20 text-white">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">
                status.cisco.com
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                Live Public Monitor
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Official Cisco Systems Real-Time Operational Health &amp; Telemetry Status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSubscribedToast(true);
              setTimeout(() => setSubscribedToast(false), 3000);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-blue-400" />
            <span>Subscribe to Updates</span>
          </button>

          <button
            onClick={loadStatusData}
            disabled={isLoading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            title="Refresh Status Page"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {subscribedToast && (
        <div className="p-3 bg-blue-500/20 border border-blue-500/40 rounded-xl text-xs text-blue-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>
              Subscribed! You will receive live incident notifications and recovery updates for all
              5 Cisco cloud services.
            </span>
          </div>
          <button
            onClick={() => setSubscribedToast(false)}
            className="text-blue-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. GLOBAL OPERATIONAL STATUS BANNER                                       */}
      {/* ========================================================================= */}
      <div>
        {globalStatus === "operational" && (
          <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-2 border-emerald-500/40 rounded-2xl p-6 shadow-xl shadow-emerald-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">All Systems Operational</h2>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  All 5 Cisco core cloud services are running nominally with normal latency across
                  all global regions.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-2xl font-black text-emerald-400 font-mono">
                  {overallUptime}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                  90-Day Global Uptime
                </div>
              </div>
            </div>
          </div>
        )}

        {globalStatus === "degraded" && (
          <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 border-2 border-amber-500/50 rounded-2xl p-6 shadow-xl shadow-amber-950/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl animate-pulse">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Active System Degradation</h2>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  One or more Cisco cloud services are experiencing degraded performance or network
                  jitter. SRE teams are actively engaged.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-2xl font-black text-amber-400 font-mono">
                  {overallUptime}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                  90-Day Global Uptime
                </div>
              </div>
            </div>
          </div>
        )}

        {globalStatus === "outage" && (
          <div className="bg-gradient-to-r from-rose-950/70 via-slate-900 to-slate-900 border-2 border-rose-500/50 rounded-2xl p-6 shadow-xl shadow-rose-950/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl animate-pulse">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Active Service Outage</h2>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  Major disruption detected on enterprise services. The Incident Command Center is
                  mobilized with automated AI remediation active.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-2xl font-black text-rose-400 font-mono">
                  {overallUptime}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                  90-Day Global Uptime
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. 5 CISCO MONITORED SERVICES WITH 90-DAY SEGMENTED DAILY UPTIME BARS     */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              Cisco Monitored Services &amp; 90-Day Uptime Telemetry
            </h3>
            <p className="text-xs text-slate-400">
              Daily historical health and service level agreement performance.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {services.filter((s) => s.status === "healthy").length} / {services.length} Healthy
          </span>
        </div>

        <div className="space-y-4">
          {services.map((svc) => {
            const uptime = getServiceUptime(svc);

            return (
              <div
                key={svc.id}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4"
              >
                {/* Service Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {svc.tier}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-white">{svc.name}</h4>
                      <span className="text-[11px] font-mono text-slate-500">{svc.slug}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status Pill */}
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        svc.status === "healthy"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : svc.status === "degraded"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          svc.status === "healthy"
                            ? "bg-emerald-400"
                            : svc.status === "degraded"
                            ? "bg-amber-400"
                            : "bg-rose-500"
                        }`}
                      />
                      {svc.status === "healthy"
                        ? "Operational"
                        : svc.status === "degraded"
                        ? "Degraded Performance"
                        : "Major Outage"}
                    </span>

                    {/* Uptime % */}
                    <span className="text-sm font-black font-mono text-slate-200">
                      {uptime.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* 90-Day Segmented Uptime Bar */}
                <UptimeBar90Day
                  serviceSlug={svc.slug}
                  serviceStatus={svc.status}
                  uptimePercentage={uptime}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PUBLISHED STAKEHOLDER BROADCASTS FEED                                  */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              Published Stakeholder Broadcasts &amp; Customer Incident Log
            </h3>
            <p className="text-xs text-slate-400">
              Public communications drafted with AI and verified by Cisco Incident Commanders.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {broadcasts.length} Broadcasts Recorded
          </span>
        </div>

        {broadcasts.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
            No public stakeholder broadcasts published yet. Responders draft broadcasts via Tab 1
            Command Center.
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((bc) => (
              <div
                key={bc.id}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-2.5 transition hover:border-slate-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {getBroadcastBadge(bc.status_type)}
                    <span className="text-xs font-bold text-slate-300">
                      {bc.service_name || "Cisco Cloud"}
                    </span>
                    {bc.incident_id && onViewIncident && (
                      <button
                        onClick={() => onViewIncident(bc.incident_id!)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-0.5 underline cursor-pointer"
                      >
                        <span>Incident #{bc.incident_id}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {bc.published_at
                        ? new Date(bc.published_at).toLocaleString()
                        : "Recently published"}
                    </span>
                  </div>
                </div>

                <h4 className="text-sm font-bold text-white">{bc.title}</h4>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">{bc.body}</p>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    Published by: <strong className="text-slate-400">{bc.published_by}</strong>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400/80">
                    Verified Customer Broadcast
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. PRESERVED ON-CALL SERVICE MATRIX & CHAOS DRILL TRIGGER                 */}
      {/* ========================================================================= */}
      <div className="pt-6 border-t-2 border-slate-800/80 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                Cisco Services &amp; On-Call Escalation Matrix
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Preserved Operations Matrix
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live on-call engineer reassignment (<code>PATCH /api/v1/services/:id</code>) and chaos
              drill orchestration.
            </p>
          </div>

          <button
            onClick={() => onOpenChaosDrill(undefined)}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-600/20 transition cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Simulate Chaos Drill</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                {/* Header: Tier + Status */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {svc.tier}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                      svc.status === "healthy"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : svc.status === "degraded"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        svc.status === "healthy"
                          ? "bg-emerald-400"
                          : svc.status === "degraded"
                          ? "bg-amber-400 animate-pulse"
                          : "bg-rose-500 animate-pulse"
                      }`}
                    />
                    {svc.status}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-white mb-1">{svc.name}</h4>
                <div className="text-[11px] font-mono text-slate-500 mb-4">{svc.slug}</div>

                {/* Escalation Policy */}
                <div className="mb-4 p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Escalation Policy
                  </span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {svc.escalation_policy || "Standard Tier 1 Escalation"}
                  </span>
                </div>

                {/* On-Call Reassignment Dropdown */}
                <div className="mb-4">
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Current On-Call Lead (Live Reassignment)
                  </label>
                  <select
                    value={svc.on_call_engineer}
                    onChange={(e) => handleEngineerChange(svc.id, e.target.value)}
                    disabled={serviceUpdateLoading === svc.id}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                  >
                    {PERSONAS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Active:{" "}
                  <strong
                    className={
                      (svc.active_incidents_count || 0) > 0
                        ? "text-rose-400 font-bold"
                        : "text-slate-300"
                    }
                  >
                    {svc.active_incidents_count || 0}
                  </strong>
                </span>
                <button
                  onClick={() => onOpenChaosDrill(svc.id)}
                  className="px-2.5 py-1 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded border border-rose-500/30 transition cursor-pointer"
                >
                  Trigger Drill
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Zap,
  BookOpen,
  DollarSign,
  TrendingDown,
  Megaphone,
} from "lucide-react";
import {
  HealthResponse,
  DashboardResponse,
  ServiceRecord,
  IncidentRecord,
  PostmortemRecord,
  fetchHealth,
  fetchDashboard,
  fetchServices,
  updateService,
  fetchIncidents,
  fetchIncident,
  transitionIncident,
  applyAiPass,
  fetchPostmortems,
} from "@/lib/api";
import { SimulateOutageModal } from "@/components/SimulateOutageModal";
import { ProofModal } from "@/components/ProofModal";
import { PostmortemModal } from "@/components/PostmortemModal";
import { CorrelatedAlertsCard } from "@/components/CorrelatedAlertsCard";
import { StakeholderBroadcastModal } from "@/components/StakeholderBroadcastModal";
import { AiopsAlertStreamTab } from "@/components/tabs/AiopsAlertStreamTab";
import { PublicStatusPageTab } from "@/components/tabs/PublicStatusPageTab";

const PERSONAS = [
  "Alex Rivera (Principal SRE)",
  "Elena Rostova (Staff Platform Eng)",
  "Sarah Chen (VP of Infrastructure)",
];

export default function PulseGuardDashboard() {
  // Navigation & Personas
  const [activeTab, setActiveTab] = useState<"command" | "aiops" | "status" | "postmortem">("command");
  const [selectedPersona, setSelectedPersona] = useState<string>(PERSONAS[0]);

  // Telemetry & Health
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [apiLatency, setApiLatency] = useState<number>(0);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Incidents Tab State
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [isApplyingPass, setIsApplyingPass] = useState<boolean>(false);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);
  const [passSuccessMessage, setPassSuccessMessage] = useState<string | null>(null);

  // Services Tab State
  const [services, setServices] = useState<ServiceRecord[]>([]);
  // Postmortems Tab State
  const [postmortems, setPostmortems] = useState<PostmortemRecord[]>([]);
  const [selectedPostmortem, setSelectedPostmortem] = useState<PostmortemRecord | null>(null);
  const [isPostmortemModalOpen, setIsPostmortemModalOpen] = useState<boolean>(false);

  // Unit Economics Calculator State
  const [calcEngineers, setCalcEngineers] = useState<number>(450);
  const [calcIncidentsPerMonth, setCalcIncidentsPerMonth] = useState<number>(340);

  // Modals
  const [isOutageModalOpen, setIsOutageModalOpen] = useState<boolean>(false);
  const [isProofModalOpen, setIsProofModalOpen] = useState<boolean>(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState<boolean>(false);
  const [drillServiceId, setDrillServiceId] = useState<number | undefined>(undefined);

  // --- Initial Data Load ---
  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    const [hRes, dRes, sRes, iRes, pmRes] = await Promise.all([
      fetchHealth(),
      fetchDashboard(),
      fetchServices(),
      fetchIncidents(statusFilter),
      fetchPostmortems(),
    ]);

    if (hRes.data) {
      setHealth(hRes.data);
      setApiLatency(hRes.latencyMs);
    }
    if (dRes.data) {
      setDashboardData(dRes.data);
      if (dRes.data.services) setServices(dRes.data.services);
    }
    if (sRes.data) {
      setServices(sRes.data.services);
    }
    if (iRes.data) {
      setIncidents(iRes.data.incidents);
      // Auto-select first incident if none selected
      if (!selectedIncidentId && iRes.data.incidents.length > 0) {
        setSelectedIncidentId(iRes.data.incidents[0].id);
      }
    }
    if (pmRes.data) {
      setPostmortems(pmRes.data.postmortems);
    }
    setIsLoading(false);
  }, [statusFilter, selectedIncidentId]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchHealth(),
      fetchDashboard(),
      fetchServices(),
      fetchIncidents(statusFilter),
      fetchPostmortems(),
    ]).then(([hRes, dRes, sRes, iRes, pmRes]) => {
      if (!ignore) {
        if (hRes.data) {
          setHealth(hRes.data);
          setApiLatency(hRes.latencyMs);
        }
        if (dRes.data) {
          setDashboardData(dRes.data);
          if (dRes.data.services) setServices(dRes.data.services);
        }
        if (sRes.data) {
          setServices(sRes.data.services);
        }
        if (iRes.data) {
          setIncidents(iRes.data.incidents);
          if (!selectedIncidentId && iRes.data.incidents.length > 0) {
            setSelectedIncidentId(iRes.data.incidents[0].id);
          }
        }
        if (pmRes.data) {
          setPostmortems(pmRes.data.postmortems);
        }
        setIsLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [statusFilter, selectedIncidentId]);

  // Load single incident details when selectedIncidentId changes
  useEffect(() => {
    if (!selectedIncidentId) return;
    let isCurrent = true;

    async function loadDetail() {
      const res = await fetchIncident(selectedIncidentId!);
      if (isCurrent && res.data?.incident) {
        setSelectedIncident(res.data.incident);
      }
    }
    loadDetail();

    return () => {
      isCurrent = false;
    };
  }, [selectedIncidentId]);

  // --- Actions ---

  const handleApplyAiPass = async () => {
    if (!selectedIncident) return;
    setIsApplyingPass(true);
    setPassSuccessMessage(null);

    const res = await applyAiPass(selectedIncident.id, selectedPersona);
    setIsApplyingPass(false);

    if (res.data?.success && res.data.incident) {
      setSelectedIncident(res.data.incident);
      setPassSuccessMessage(
        "⚡ 1-Click Remediation executed successfully! Runbook completed, service restored to operational, and automated recovery broadcast published to status.cisco.com."
      );
      // Refresh dashboard KPIs, incidents, services, and postmortems
      const [dRes, iRes, sRes, pmRes] = await Promise.all([
        fetchDashboard(),
        fetchIncidents(statusFilter),
        fetchServices(),
        fetchPostmortems(),
      ]);
      if (dRes.data) setDashboardData(dRes.data);
      if (iRes.data) setIncidents(iRes.data.incidents);
      if (sRes.data) setServices(sRes.data.services);
      if (pmRes.data) setPostmortems(pmRes.data.postmortems);
    }
  };

  const handleBroadcastPublished = () => {
    if (selectedIncidentId) {
      fetchIncident(selectedIncidentId).then((res) => {
        if (res.data?.incident) setSelectedIncident(res.data.incident);
      });
    }
    loadAllData();
  };

  const handleTransition = async (event: "acknowledge" | "resolve") => {
    if (!selectedIncident) return;
    const res = await transitionIncident(selectedIncident.id, event, selectedPersona);
    if (res.data?.success && res.data.incident) {
      setSelectedIncident(res.data.incident);
      const [dRes, iRes] = await Promise.all([
        fetchDashboard(),
        fetchIncidents(statusFilter),
      ]);
      if (dRes.data) setDashboardData(dRes.data);
      if (iRes.data) setIncidents(iRes.data.incidents);
    }
  };

  const handleUpdateServiceOnCall = async (serviceId: number, newEngineer: string) => {
    const res = await updateService(serviceId, { on_call_engineer: newEngineer });
    if (res.data?.success) {
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, on_call_engineer: newEngineer } : s))
      );
    }
  };

  const handleCopyRunbook = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const handleOpenDrill = (serviceId?: number) => {
    setDrillServiceId(serviceId);
    setIsOutageModalOpen(true);
  };

  const handleIncidentCreated = (newId: number) => {
    setSelectedIncidentId(newId);
    setActiveTab("command");
    loadAllData();
  };

  // Unit Economics calculations
  const pagerDutyCostAnnual = calcEngineers * 220 * 12;
  const pulseGuardTokenCostAnnual = calcIncidentsPerMonth * 12 * 0.002;
  const pulseGuardHostingAnnual = 42000;
  const totalPulseGuardAnnual = pulseGuardHostingAnnual + pulseGuardTokenCostAnnual;
  const annualSavings = pagerDutyCostAnnual - totalPulseGuardAnnual;
  const savingsPercent = ((annualSavings / pagerDutyCostAnnual) * 100).toFixed(1);
  const hoursSavedAnnual = Math.round((calcIncidentsPerMonth * 12 * 21) / 60);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* 3.1 Global Header & Telemetry Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Target Enterprise Badge */}
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-lg shadow-lg shadow-emerald-500/20 text-slate-950 font-black">
                <ShieldCheck className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-white">
                    PULSEGUARD
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    SaaS Core v1.0
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-none">
                  Incident &amp; On-Call Orchestration Platform
                </p>
              </div>
            </div>

            <div className="h-6 w-[1px] bg-slate-800" />

            {/* Cisco Systems Enterprise Badge */}
            <button
              onClick={() => setIsProofModalOpen(true)}
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition text-left cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-blue-400" />
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-blue-300 flex items-center gap-1">
                  Cisco Systems Cloud Operations
                  <span className="text-[9px] px-1 py-0.2 bg-blue-500/20 rounded font-bold">
                    Fortune #82
                  </span>
                </span>
                <span className="text-[9px] text-blue-400/80 group-hover:text-blue-300 flex items-center gap-0.5">
                  Verified Catalyst Integration &bull; View Proof
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </button>
          </div>

          {/* Right Controls: Persona Switcher + Simulate Button + API Ping */}
          <div className="flex items-center gap-3">
            {/* Persona Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-400">Actor:</span>
              <select
                value={selectedPersona}
                onChange={(e) => setSelectedPersona(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
              >
                {PERSONAS.map((p) => (
                  <option key={p} value={p} className="bg-slate-900 text-white">
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Simulate Outage Global Button */}
            <button
              onClick={() => {
                setDrillServiceId(undefined);
                setIsOutageModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-semibold rounded-lg shadow-md shadow-rose-600/20 transition cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>+ Simulate Outage</span>
            </button>

            {/* Live API Telemetry Chip */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] text-slate-300">
                {health?.db_connected ? "Operational" : "Degraded"}
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono text-[11px] text-emerald-400">
                {apiLatency > 0 ? `${apiLatency}ms` : "Live"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 3.2 Top KPI Ribbon */}
      <section className="bg-slate-900/40 border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto grid grid-cols-4 gap-4">
          {/* Card 1: Active SEV-1 Outages */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Active SEV-1 Outages
              </div>
              <div className="text-2xl font-black text-rose-400">
                {dashboardData?.kpis.active_sev1_count ?? 1}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Critical SLA breach threshold
              </div>
            </div>
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Active Incidents */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                Active Incidents
              </div>
              <div className="text-2xl font-black text-amber-400">
                {dashboardData?.kpis.active_incidents_count ?? 2}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  / {dashboardData?.kpis.total_incidents_count ?? 3} total
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Triggered &amp; acknowledged queue
              </div>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Average MTTR */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                Mean Time to Resolve (MTTR)
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {dashboardData?.kpis.mttr_minutes ?? 14.2}
                <span className="text-xs font-normal text-slate-500 ml-1">mins</span>
              </div>
              <div className="text-[10px] text-emerald-500/80 flex items-center gap-0.5 mt-0.5">
                <TrendingDown className="w-3 h-3" />
                68% faster than PagerDuty
              </div>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: AI Automation Hours Saved */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                AI SRE Hours Saved
              </div>
              <div className="text-2xl font-black text-cyan-400">
                {dashboardData?.kpis.ai_hours_saved ?? 84.4}
                <span className="text-xs font-normal text-slate-500 ml-1">hrs</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                From 1-click remediation passes
              </div>
            </div>
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Main Navigation Tabs */}
      <div className="bg-slate-950 border-b border-slate-800 px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-1">
          {/* Tab 1: Incident Command Center */}
          <button
            onClick={() => setActiveTab("command")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "command"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Incident Command Center</span>
            {dashboardData?.kpis.active_incidents_count ? (
              <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[10px]">
                {dashboardData.kpis.active_incidents_count}
              </span>
            ) : null}
          </button>

          {/* Tab 2: AIOps & Alert Stream */}
          <button
            onClick={() => setActiveTab("aiops")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "aiops"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>AIOps &amp; Alert Stream</span>
            <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono">
              &gt;90% Noise Red.
            </span>
          </button>

          {/* Tab 3: Public Status Page */}
          <button
            onClick={() => setActiveTab("status")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "status"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Public Status Page (status.cisco.com)</span>
            <span className="flex items-center gap-1 px-1.5 py-0.2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </button>

          {/* Tab 4: Post-Mortems & ROI Hub */}
          <button
            onClick={() => setActiveTab("postmortem")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === "postmortem"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Post-Mortems &amp; ROI Hub</span>
            <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded text-[10px]">
              ROI ~96%
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {/* ========================================================================= */}
        {/* TAB 1: INCIDENT COMMAND CENTER (Split Screen + AI Actionable Remediation) */}
        {/* ========================================================================= */}
        {activeTab === "command" && (
          <div className="grid grid-cols-12 gap-6 min-h-[680px]">
            {/* Left Column: Incident Queue */}
            <div className="col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              {/* Queue Header & Filters */}
              <div className="p-3.5 border-b border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Incident Stream
                  </span>
                  <button
                    onClick={loadAllData}
                    disabled={isLoading}
                    className={`p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition ${
                      isLoading ? "animate-spin opacity-50" : ""
                    }`}
                    title="Refresh Incidents"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Filter Pills */}
                <div className="flex gap-1">
                  {(["all", "triggered", "acknowledged", "resolved"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-2.5 py-1 text-[11px] rounded-md capitalize font-medium transition cursor-pointer ${
                        statusFilter === filter
                          ? "bg-slate-800 text-emerald-400 font-bold"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
                {incidents.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No incidents matching filter.
                  </div>
                ) : (
                  incidents.map((inc) => {
                    const isSelected = inc.id === selectedIncidentId;
                    return (
                      <button
                        key={inc.id}
                        onClick={() => setSelectedIncidentId(inc.id)}
                        className={`w-full text-left p-3.5 transition cursor-pointer flex flex-col gap-1.5 ${
                          isSelected
                            ? "bg-emerald-950/20 border-l-4 border-l-emerald-500"
                            : "hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              inc.severity === "SEV-1"
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : inc.severity === "SEV-2"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            }`}
                          >
                            {inc.severity}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              inc.status === "triggered"
                                ? "bg-rose-500/10 text-rose-400 animate-pulse"
                                : inc.status === "acknowledged"
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {inc.status}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-200 line-clamp-2">
                          {inc.title}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                          <span className="truncate max-w-[150px]">
                            {inc.service?.name || "Cisco Service"}
                          </span>
                          <span className="font-mono text-[10px]">
                            {new Date(inc.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Selected Incident Detail */}
            <div className="col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col overflow-hidden">
              {selectedIncident ? (
                <div className="space-y-6 overflow-y-auto pr-1">
                  {/* Top Bar: Title, Severity, Service, Status */}
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-black ${
                            selectedIncident.severity === "SEV-1"
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {selectedIncident.severity}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            selectedIncident.status === "triggered"
                              ? "bg-rose-500/20 text-rose-400"
                              : selectedIncident.status === "acknowledged"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {selectedIncident.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          ID: #{selectedIncident.id}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 font-mono">
                        Triggered: {new Date(selectedIncident.created_at).toLocaleString()}
                      </div>
                    </div>

                    <h1 className="text-xl font-bold text-white mb-2 leading-snug">
                      {selectedIncident.title}
                    </h1>

                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>
                        Service:{" "}
                        <strong className="text-slate-200">
                          {selectedIncident.service?.name}
                        </strong>{" "}
                        ({selectedIncident.service?.tier})
                      </span>
                      <span>&bull;</span>
                      <span>
                        Assigned:{" "}
                        <strong className="text-slate-200">
                          {selectedIncident.assigned_to || "Unassigned"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* ========================================================= */}
                  {/* HERO SECTION: AI-NATIVE ACTIONABLE REMEDIATION PASS BANNER */}
                  {/* ========================================================= */}
                  {selectedIncident.ai_triage_pass ? (
                    <div className="relative overflow-hidden rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 p-5 shadow-xl shadow-emerald-950/30">
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                            <Zap className="w-5 h-5 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              Actionable Remediation Pass (Kullanılabilir Pas)
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                {selectedIncident.ai_triage_pass.confidence_score}% Confidence
                              </span>
                            </h3>
                            <p className="text-[11px] text-emerald-400/80">
                              Synthesized by Rails 8 AI Engine &bull; Matched:{" "}
                              {selectedIncident.ai_triage_pass.matched_historical_incident}
                            </p>
                          </div>
                        </div>

                        <div className="px-2.5 py-1 bg-emerald-900/40 border border-emerald-500/30 rounded-lg text-emerald-300 font-mono text-xs">
                          ~{selectedIncident.ai_triage_pass.estimated_time_saved_minutes}m MTTR Saved
                        </div>
                      </div>

                      {/* Root cause hypothesis */}
                      <div className="mb-3 p-3 bg-slate-950/80 border border-emerald-500/20 rounded-lg">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                          Root Cause Hypothesis
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {selectedIncident.ai_triage_pass.root_cause_hypothesis}
                        </p>
                      </div>

                      {/* Suggested Runbook Command with Copy */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                            <Terminal className="w-3 h-3 text-emerald-400" />
                            Executable Runbook Command
                          </span>
                          <button
                            onClick={() =>
                              handleCopyRunbook(
                                selectedIncident.ai_triage_pass?.suggested_runbook_command || ""
                              )
                            }
                            className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedCommand ? "Copied!" : "Copy Command"}
                          </button>
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
                          {selectedIncident.ai_triage_pass.suggested_runbook_command}
                        </div>
                      </div>

                      {/* Draft Status Update */}
                      <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                        <div className="truncate">
                          <span className="font-semibold text-slate-300">Draft Status Update: </span>
                          &ldquo;{selectedIncident.ai_triage_pass.draft_status_update}&rdquo;
                        </div>
                        <button
                          onClick={() => setIsBroadcastModalOpen(true)}
                          className="ml-3 shrink-0 flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                        >
                          <Megaphone className="w-3 h-3" />
                          <span>Broadcast to status.cisco.com</span>
                        </button>
                      </div>

                      {/* Success Feedback Alert */}
                      {passSuccessMessage && (
                        <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{passSuccessMessage}</span>
                        </div>
                      )}

                      {/* Big Action Button */}
                      {selectedIncident.status === "resolved" ? (
                        <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Remediated via PulseGuard AI Pass &bull; Status Resolved</span>
                          </div>
                          {selectedIncident.postmortem && (
                            <button
                              onClick={() => {
                                setSelectedPostmortem(selectedIncident.postmortem!);
                                setIsPostmortemModalOpen(true);
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition"
                            >
                              View Draft Postmortem
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleApplyAiPass}
                          disabled={isApplyingPass}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                        >
                          <Zap className="w-4 h-4 fill-white" />
                          {isApplyingPass
                            ? "Applying Remediation, Mutating State & Drafting Postmortem..."
                            : "⚡ Apply 1-Click AI Remediation Pass"}
                        </button>
                      )}
                    </div>
                  ) : null}

                  {/* Manual Triage Controls */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">
                      Standard Manual Controls (Acting as{" "}
                      <strong className="text-slate-200">{selectedPersona}</strong>):
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Customer Status Broadcast Button */}
                      <button
                        onClick={() => setIsBroadcastModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-lg transition cursor-pointer"
                      >
                        <Megaphone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>📢 Draft AI Broadcast</span>
                      </button>

                      {selectedIncident.status === "triggered" && (
                        <button
                          onClick={() => handleTransition("acknowledge")}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      )}
                      {selectedIncident.status !== "resolved" && (
                        <button
                          onClick={() => handleTransition("resolve")}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                      )}
                      {selectedIncident.postmortem && (
                        <button
                          onClick={() => {
                            setSelectedPostmortem(selectedIncident.postmortem!);
                            setIsPostmortemModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          Post-Mortem
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error Stack Trace Viewer */}
                  {selectedIncident.error_signature && (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-rose-400" />
                        Raw Error Signature &amp; Stack Trace
                      </div>
                      <pre className="text-xs font-mono text-rose-300/90 whitespace-pre-wrap leading-relaxed overflow-x-auto bg-slate-900/50 p-2.5 rounded border border-slate-800/80">
                        {selectedIncident.error_signature}
                      </pre>
                    </div>
                  )}

                  {/* Correlated Child Alerts (AIOps Telemetry Clustering) */}
                  <CorrelatedAlertsCard
                    incidentId={selectedIncident.id}
                    incidentTitle={selectedIncident.title}
                    serviceName={selectedIncident.service?.name}
                    serviceSlug={selectedIncident.service?.slug}
                    isResolved={selectedIncident.status === "resolved"}
                    onAlertsUpdated={loadAllData}
                  />

                  {/* Live Audit Timeline */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      Live Incident Audit Timeline
                    </h4>
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-800">
                      {selectedIncident.events?.map((ev) => (
                        <div key={ev.id} className="relative">
                          {/* Dot */}
                          <div
                            className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 ${
                              ev.action_type === "runbook_executed"
                                ? "bg-emerald-400 border-emerald-950 ring-4 ring-emerald-500/20"
                                : ev.action_type === "triggered"
                                ? "bg-rose-400 border-rose-950"
                                : ev.action_type === "resolved"
                                ? "bg-teal-400 border-teal-950"
                                : "bg-blue-400 border-blue-950"
                            }`}
                          />
                          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-200">
                                {ev.actor}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {new Date(ev.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-slate-300 leading-relaxed font-sans">
                              {ev.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Select an incident from the queue to view full triage details.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: AIOPS & ALERT STREAM */}
        {/* ========================================================================= */}
        {activeTab === "aiops" && (
          <AiopsAlertStreamTab
            services={services}
            onSelectIncident={(incidentId) => {
              setSelectedIncidentId(incidentId);
              setActiveTab("command");
            }}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PUBLIC STATUS PAGE (status.cisco.com) */}
        {/* ========================================================================= */}
        {activeTab === "status" && (
          <PublicStatusPageTab
            services={services}
            onUpdateServiceOnCall={handleUpdateServiceOnCall}
            onOpenChaosDrill={handleOpenDrill}
            onViewIncident={(incidentId) => {
              setSelectedIncidentId(incidentId);
              setActiveTab("command");
            }}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 4: POST-MORTEMS & UNIT ECONOMICS HUB */}
        {/* ========================================================================= */}
        {activeTab === "postmortem" && (
          <div className="space-y-8">
            {/* Blameless Post-Mortem Archive */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Cisco Systems Blameless Post-Mortem Archive
                  </h2>
                  <p className="text-xs text-slate-400">
                    Auto-generated postmortems with verifiable root cause and prevention action items.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {postmortems.length === 0 ? (
                  <div className="col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 text-xs">
                    No postmortems recorded yet. Apply an AI Remediation Pass to auto-generate one.
                  </div>
                ) : (
                  postmortems.map((pm) => (
                    <div
                      key={pm.id}
                      onClick={() => {
                        setSelectedPostmortem(pm);
                        setIsPostmortemModalOpen(true);
                      }}
                      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-5 cursor-pointer transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pm.published
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {pm.published ? "PUBLISHED" : "DRAFT (AI SYNTHESIZED)"}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(pm.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-white mb-1.5">
                          {pm.incident?.title || "Incident Post-Mortem"}
                        </h3>
                        <p className="text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">
                          {pm.summary}
                        </p>

                        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs mb-3">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                            Root Cause
                          </span>
                          <span className="text-rose-300 font-mono text-[11px] line-clamp-2">
                            {pm.root_cause}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span>
                          Action items:{" "}
                          <strong className="text-slate-200">
                            {pm.action_items?.filter((a) => a.completed).length || 0} /{" "}
                            {pm.action_items?.length || 0} completed
                          </strong>
                        </span>
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          Review Report &rarr;
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Executive Unit Economics & Cisco ROI Section */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    Executive Unit Economics &amp; Cisco ROI Calculator
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comparative business case: Legacy PagerDuty Enterprise vs. PulseGuard AI-Native Platform.
                  </p>
                </div>
                <button
                  onClick={() => setIsProofModalOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  Cisco Documentation Proof &rarr;
                </button>
              </div>

              {/* Calculator Inputs */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Cisco On-Call SREs &amp; Engineers
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {calcEngineers} Engineers
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={1200}
                    step={25}
                    value={calcEngineers}
                    onChange={(e) => setCalcEngineers(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>50</span>
                    <span>450 (Standard Cisco Org)</span>
                    <span>1,200</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Monthly Cloud Outages &amp; Incidents
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {calcIncidentsPerMonth} Incidents / Mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={1500}
                    step={25}
                    value={calcIncidentsPerMonth}
                    onChange={(e) => setCalcIncidentsPerMonth(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>50</span>
                    <span>340 (Avg Volume)</span>
                    <span>1,500</span>
                  </div>
                </div>
              </div>

              {/* Comparison Scorecard */}
              <div className="grid grid-cols-3 gap-4">
                {/* Legacy PagerDuty */}
                <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-rose-400 tracking-wider mb-1">
                    Legacy PagerDuty Bill
                  </div>
                  <div className="text-2xl font-black text-rose-400 mb-1">
                    ${pagerDutyCostAnnual.toLocaleString()}
                    <span className="text-xs font-normal text-slate-400"> / yr</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Based on standard Enterprise tier at $220/user/month. Dumb alerts without triage.
                  </p>
                </div>

                {/* PulseGuard AI-Native */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-emerald-400 tracking-wider mb-1">
                    PulseGuard AI Run Cost
                  </div>
                  <div className="text-2xl font-black text-emerald-400 mb-1">
                    ${Math.round(totalPulseGuardAnnual).toLocaleString()}
                    <span className="text-xs font-normal text-slate-400"> / yr</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    $42k Kubernetes hosting + $0.002 per Gemini pass. 1-click remediation included.
                  </p>
                </div>

                {/* Cisco Net Bottom-Line Savings */}
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-blue-400 tracking-wider mb-1">
                    Cisco Net Annual Savings
                  </div>
                  <div className="text-2xl font-black text-blue-400 mb-1">
                    ${Math.round(annualSavings).toLocaleString()}
                    <span className="text-xs font-normal text-blue-300 ml-1">
                      ({savingsPercent}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Eliminates ~{hoursSavedAnnual.toLocaleString()} hours of on-call engineer toil annually.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <SimulateOutageModal
        isOpen={isOutageModalOpen}
        onClose={() => setIsOutageModalOpen(false)}
        services={services}
        onIncidentCreated={handleIncidentCreated}
        defaultServiceId={drillServiceId}
      />

      <ProofModal
        isOpen={isProofModalOpen}
        onClose={() => setIsProofModalOpen(false)}
      />

      <PostmortemModal
        isOpen={isPostmortemModalOpen}
        onClose={() => setIsPostmortemModalOpen(false)}
        postmortem={selectedPostmortem}
        onPostmortemUpdated={(updated) => {
          setSelectedPostmortem(updated);
          setPostmortems((prev) =>
            prev.map((pm) => (pm.id === updated.id ? updated : pm))
          );
        }}
      />

      <StakeholderBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        incident={selectedIncident}
        currentPersona={selectedPersona}
        onBroadcastPublished={handleBroadcastPublished}
      />
    </div>
  );
}

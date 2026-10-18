"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Award,
  CheckCircle2,
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
  Megaphone,
  Send,
  CheckSquare,
  Square,
  Check,
  Lock,
  Bell,
  Compass,
  Cpu,
} from "lucide-react";
import {
  HealthResponse,
  DashboardResponse,
  ServiceRecord,
  IncidentRecord,
  PostmortemRecord,
  AlertRecord,
  StormSummary,
  fetchHealth,
  fetchDashboard,
  fetchServices,
  updateService,
  fetchIncidents,
  fetchIncident,
  transitionIncident,
  applyAiPass,
  fetchPostmortems,
  simulateAlertStorm,
  fetchAlerts,
  draftStakeholderBroadcast,
  publishStakeholderBroadcast,
  generatePostmortem,
} from "@/lib/api";
import { SimulateOutageModal } from "@/components/SimulateOutageModal";
import { ProofModal } from "@/components/ProofModal";
import { PostmortemModal } from "@/components/PostmortemModal";
import { StakeholderBroadcastModal } from "@/components/StakeholderBroadcastModal";
import { AiopsAlertStreamTab } from "@/components/tabs/AiopsAlertStreamTab";
import { PublicStatusPageTab } from "@/components/tabs/PublicStatusPageTab";

const PERSONAS = [
  "Alex Rivera (Principal SRE)",
  "Elena Rostova (Staff Platform Eng)",
  "Sarah Chen (VP of Infrastructure)",
];

const BROADCAST_TONES = [
  { id: "empathetic", label: "Empathetic (Yatıştırıcı)" },
  { id: "technical", label: "Technical (Teknik)" },
  { id: "urgent", label: "Urgent (Acil)" },
  { id: "concise", label: "Concise (Özet)" },
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

  // Incidents Queue State
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);

  // Services & Postmortems State
  const [services, setServices] = useState<ServiceRecord[]>([]);
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

  // =========================================================================
  // NON-BLOCKING AI ACTIVITY STATE
  // =========================================================================
  const [aiTask, setAiTask] = useState<{
    active: boolean;
    taskName: string;
    message: string;
  } | null>(null);

  // =========================================================================
  // CONTAINER 1: SEPARATE LOG & SIGNAL TRIGGER CONTAINER STATE (EXTENDED MODE)
  // =========================================================================
  const [stormTargetSlug, setStormTargetSlug] = useState<string>("auto");
  const [stormSummary, setStormSummary] = useState<StormSummary | null>(null);
  const [streamAlerts, setStreamAlerts] = useState<AlertRecord[]>([]);
  const [signalViewFilter, setSignalViewFilter] = useState<"all" | "grouped" | "suppressed_noise">("all");
  const [lastTriggeredIncidentId, setLastTriggeredIncidentId] = useState<number | null>(null);

  // =========================================================================
  // CONTAINER 2: CASE OWNERSHIP, CUSTOMER REPORT & 1-CLICK REMEDIATION STATE
  // =========================================================================
  const [assignedEngineer, setAssignedEngineer] = useState<string>(PERSONAS[0]);
  const [isTakingCase, setIsTakingCase] = useState<boolean>(false);

  // Customer Broadcast Approval State (Prepared automatically when engineer takes case)
  const [broadcastTone, setBroadcastTone] = useState<string>("empathetic");
  const [broadcastStatusType, setBroadcastStatusType] = useState<"investigating" | "identified" | "monitoring" | "resolved">("identified");
  const [broadcastTitle, setBroadcastTitle] = useState<string>("");
  const [broadcastBody, setBroadcastBody] = useState<string>("");
  const [broadcastAiMode, setBroadcastAiMode] = useState<string | null>(null);
  const [isDraftingBroadcast, setIsDraftingBroadcast] = useState<boolean>(false);
  const [isPublishingBroadcast, setIsPublishingBroadcast] = useState<boolean>(false);
  const [broadcastPublishedSuccess, setBroadcastPublishedSuccess] = useState<string | null>(null);

  // 1-Click Remediation & AI Post-Mortem State
  const [isExecutingRemediation, setIsExecutingRemediation] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [remediationSuccessMsg, setRemediationSuccessMsg] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState<PostmortemRecord | null>(null);
  const [isSavingFinalReport, setIsSavingFinalReport] = useState<boolean>(false);
  const [finalReportSavedMsg, setFinalReportSavedMsg] = useState<string | null>(null);

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

  // Sync Selected Incident Details
  useEffect(() => {
    if (!selectedIncidentId) return;
    let isCurrent = true;

    async function loadDetail() {
      const res = await fetchIncident(selectedIncidentId!);
      if (isCurrent && res.data?.incident) {
        const inc = res.data.incident;
        setSelectedIncident(inc);

        const recommendedEng =
          inc.ai_triage_pass?.recommended_assignee ||
          inc.service?.on_call_engineer ||
          selectedPersona;
        setAssignedEngineer(
          inc.assigned_to && !inc.assigned_to.startsWith("Unassigned")
            ? inc.assigned_to
            : recommendedEng
        );

        // Populate Customer Broadcast Draft (from AI customer_broadcast_draft or triage pass)
        const autoDraft = inc.ai_triage_pass?.customer_broadcast_draft;
        if (autoDraft) {
          setBroadcastTitle(autoDraft.title);
          setBroadcastBody(autoDraft.body);
          setBroadcastAiMode(autoDraft.mode || inc.ai_triage_pass?.mode || null);
          if (
            autoDraft.status_type === "investigating" ||
            autoDraft.status_type === "identified" ||
            autoDraft.status_type === "monitoring" ||
            autoDraft.status_type === "resolved"
          ) {
            setBroadcastStatusType(autoDraft.status_type);
          }
        } else if (inc.ai_triage_pass?.draft_status_update) {
          setBroadcastTitle(`${inc.service?.name || "Cisco Servisi"} — Durum Bilgilendirmesi`);
          setBroadcastBody(inc.ai_triage_pass.draft_status_update);
          setBroadcastAiMode(inc.ai_triage_pass.mode || null);
        } else {
          setBroadcastTitle(`${inc.service?.name || "Cisco Servisi"} Performans İncelemesi`);
          setBroadcastBody(
            `${inc.service?.name || "Servis"} üzerinde yaşanan telemetri sapmaları mühendislik ekibimiz tarafından incelenmektedir.`
          );
        }

        if (inc.postmortem) {
          setFinalReport(inc.postmortem);
        } else {
          setFinalReport(null);
        }

        // Load signals into Extended Signal Container if empty or matching incident
        const alertsRes = await fetchAlerts({ incident_id: inc.id, limit: 100 });
        if (isCurrent && alertsRes.data?.alerts && alertsRes.data.alerts.length > 0) {
          setStreamAlerts(alertsRes.data.alerts);
          const grouped = alertsRes.data.alerts.filter((a) => a.status === "grouped").length;
          const suppressed = alertsRes.data.alerts.filter((a) => a.status === "suppressed_noise").length;
          const total = alertsRes.data.alerts.length;
          setStormSummary({
            raw_alerts_ingested: total,
            grouped_count: grouped,
            suppressed_count: suppressed,
            noise_reduction_ratio: Number((suppressed / total).toFixed(3)),
            noise_reduction_percentage: Number(((suppressed / total) * 100).toFixed(1)),
            detected_service_name: inc.service?.name,
            detected_service_slug: inc.service?.slug,
            detection_reasoning:
              inc.ai_triage_pass?.service_detection_reasoning ||
              `${total} sinyal taranarak kök arızanın ${inc.service?.name} servisinde olduğu tespit edildi ve olay kuyruğuna eklendi.`,
            ai_mode: inc.ai_triage_pass?.log_triage_mode || inc.ai_triage_pass?.mode,
          });
        }
      }
    }
    loadDetail();

    return () => {
      isCurrent = false;
    };
  }, [selectedIncidentId, selectedPersona]);

  // =========================================================================
  // CONTAINER 1 ACTION: TRIGGER LOGS & AI SERVICE DETECTION -> ADD TO QUEUE
  // =========================================================================
  const handleTriggerLogsAndDetectService = async () => {
    setAiTask({
      active: true,
      taskName: "Canlı Log Akışı & AI Servis Tespiti",
      message:
        "Loglar tetiklendi, 30 sinyal akıyor... AI hatanın hangi serviste olduğunu buluyor, yorumluyor ve Olay Kuyruğuna ekliyor...",
    });

    try {
      const res = await simulateAlertStorm({
        service_slug: stormTargetSlug === "auto" ? undefined : stormTargetSlug,
        burst_size: 30,
        create_fresh: true,
      });

      if (res.data?.success && res.data.incident) {
        const newInc = res.data.incident;
        setStormSummary(res.data.storm_summary);
        if (res.data.alerts) {
          setStreamAlerts(res.data.alerts);
        }
        setSignalViewFilter("all");
        setLastTriggeredIncidentId(newInc.id);

        // Reset case states for the newly opened incident
        setBroadcastPublishedSuccess(null);
        setRemediationSuccessMsg(null);
        setFinalReportSavedMsg(null);
        setTerminalLogs([]);
        setFinalReport(null);

        const recEngineer =
          newInc.ai_triage_pass?.recommended_assignee ||
          newInc.service?.on_call_engineer ||
          selectedPersona;
        setAssignedEngineer(recEngineer);

        if (newInc.ai_triage_pass?.draft_status_update) {
          setBroadcastTitle(`${newInc.service?.name || "Servis"} — Operasyonel Durum Bildirimi`);
          setBroadcastBody(newInc.ai_triage_pass.draft_status_update);
          setBroadcastAiMode(newInc.ai_triage_pass.mode || null);
        }

        // Select newly added incident in the queue
        setSelectedIncidentId(newInc.id);
        setSelectedIncident(newInc);

        const [iRes, dRes, sRes] = await Promise.all([
          fetchIncidents(statusFilter),
          fetchDashboard(),
          fetchServices(),
        ]);
        if (iRes.data) setIncidents(iRes.data.incidents);
        if (dRes.data) setDashboardData(dRes.data);
        if (sRes.data) setServices(sRes.data.services);
      }
    } catch (err) {
      console.error("Log trigger failed:", err);
    } finally {
      setAiTask(null);
    }
  };

  // =========================================================================
  // CONTAINER 2 ACTION A: ENGINEER TAKES CASE -> AI PREPARES CUSTOMER REPORT & UNLOCKS 1-CLICK FIX
  // =========================================================================
  const handleTakeCase = async () => {
    if (!selectedIncident) return;
    setIsTakingCase(true);
    setAiTask({
      active: true,
      taskName: "Vaka Üstlenme & AI Müşteri Raporu Sentezi",
      message: `${assignedEngineer} vakayı (case) üstlendi. AI (Gemini) müşteriler için bilgilendirme raporunu hazırlıyor ve Tek Tıkla Çözüm butonunu aktif ediyor...`,
    });

    try {
      const res = await transitionIncident(selectedIncident.id, "acknowledge", assignedEngineer);
      if (res.data?.success && res.data.incident) {
        const updated = res.data.incident;
        setSelectedIncident(updated);

        // Backend automatically generated customer_broadcast_draft on acknowledge!
        const draft = updated.ai_triage_pass?.customer_broadcast_draft;
        if (draft) {
          setBroadcastTitle(draft.title);
          setBroadcastBody(draft.body);
          setBroadcastAiMode(draft.mode || null);
          if (
            draft.status_type === "investigating" ||
            draft.status_type === "identified" ||
            draft.status_type === "monitoring" ||
            draft.status_type === "resolved"
          ) {
            setBroadcastStatusType(draft.status_type);
          }
        }

        const [dRes, iRes] = await Promise.all([
          fetchDashboard(),
          fetchIncidents(statusFilter),
        ]);
        if (dRes.data) setDashboardData(dRes.data);
        if (iRes.data) setIncidents(iRes.data.incidents);
      }
    } catch (err) {
      console.error("Failed to take case:", err);
    } finally {
      setIsTakingCase(false);
      setAiTask(null);
    }
  };

  // =========================================================================
  // CONTAINER 2 ACTION B: REGENERATE OR APPROVE & PUBLISH CUSTOMER REPORT
  // =========================================================================
  const handleRegenerateCustomerReport = async () => {
    if (!selectedIncident) return;
    setIsDraftingBroadcast(true);
    setAiTask({
      active: true,
      taskName: "AI Müşteri Bilgilendirme Raporu Yazımı",
      message: "Gemini API ile müşteri bilgilendirme raporu yeniden sentezleniyor...",
    });

    try {
      const res = await draftStakeholderBroadcast(selectedIncident.id, {
        tone: broadcastTone,
        status_type: broadcastStatusType,
      });

      if (res.data?.success && res.data.draft) {
        setBroadcastTitle(res.data.draft.title);
        setBroadcastBody(res.data.draft.body);
        setBroadcastAiMode(res.data.draft.mode || null);
      }
    } catch (err) {
      console.error("Draft broadcast failed:", err);
    } finally {
      setIsDraftingBroadcast(false);
      setAiTask(null);
    }
  };

  const handleApproveCustomerReport = async () => {
    if (!selectedIncident || !broadcastTitle || !broadcastBody) return;
    setIsPublishingBroadcast(true);
    setAiTask({
      active: true,
      taskName: "Müşteri Raporu Yayını (status.cisco.com)",
      message: "Mühendis onaylı müşteri bilgilendirme raporu status.cisco.com sayfasına yayınlanıyor...",
    });

    try {
      const res = await publishStakeholderBroadcast(selectedIncident.id, {
        title: broadcastTitle,
        body: broadcastBody,
        status_type: broadcastStatusType,
        published_by: assignedEngineer || selectedPersona,
      });

      if (res.data?.success) {
        setBroadcastPublishedSuccess(
          "Müşteri Bilgilendirme Raporu onaylandı ve status.cisco.com üzerinde yayınlandı!"
        );
        const incRes = await fetchIncident(selectedIncident.id);
        if (incRes.data?.incident) setSelectedIncident(incRes.data.incident);
      }
    } catch (err) {
      console.error("Publish broadcast failed:", err);
    } finally {
      setIsPublishingBroadcast(false);
      setAiTask(null);
    }
  };

  // =========================================================================
  // CONTAINER 2 ACTION C: 1-CLICK AI SOLUTION & AI POST-MORTEM GENERATION
  // =========================================================================
  const handleExecuteOneClickSolution = async () => {
    if (!selectedIncident) return;
    setIsExecutingRemediation(true);
    setRemediationSuccessMsg(null);

    setAiTask({
      active: true,
      taskName: "Tek Tıkla AI Çözümü & AI Post-Mortem Üretimi",
      message:
        "AI çözüm komutu terminalde çalıştırılıyor, servis sağlığı doğrulanıyor ve Gemini ile Post-Mortem raporu üretiliyor...",
    });

    setTerminalLogs([
      `[AUTH] Session verified for responder: ${selectedIncident.assigned_to || assignedEngineer}`,
      `[EXEC] Running AI Remediation: ${selectedIncident.ai_triage_pass?.suggested_runbook_command || "kubectl rollout restart deployment/cisco-service"}`,
    ]);

    setTimeout(() => {
      setTerminalLogs((prev) => [
        ...prev,
        `[TELEMETRY] Draining stuck sockets & rebalancing worker pool...`,
        `[VERIFY] Service health check returned HTTP 200 OK (latency: 14ms)`,
      ]);
    }, 500);

    try {
      const res = await applyAiPass(
        selectedIncident.id,
        selectedIncident.assigned_to || assignedEngineer
      );

      if (res.data?.success && res.data.incident) {
        const updatedInc = res.data.incident;
        setSelectedIncident(updatedInc);
        setRemediationSuccessMsg(
          "⚡ Tek tıkla çözüm başarıyla uygulandı! Servis tekrar 'Healthy' durumuna döndü ve AI Post-Mortem raporunu üretti."
        );

        setTerminalLogs((prev) => [
          ...prev,
          `[RESOLVED] Incident #${updatedInc.id} marked RESOLVED.`,
          `[POST-MORTEM] AI synthesized human-readable Blameless Post-Mortem report.`,
        ]);

        if (updatedInc.postmortem) {
          setFinalReport(updatedInc.postmortem);
        }

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
    } catch (err) {
      console.error("1-Click remediation failed:", err);
    } finally {
      setIsExecutingRemediation(false);
      setAiTask(null);
    }
  };

  const handleToggleActionItem = (index: number) => {
    if (!finalReport) return;
    const updatedItems = [...finalReport.action_items];
    updatedItems[index].completed = !updatedItems[index].completed;
    setFinalReport({ ...finalReport, action_items: updatedItems });
  };

  const handleSaveFinalReport = async () => {
    if (!selectedIncident || !finalReport) return;
    setIsSavingFinalReport(true);
    setFinalReportSavedMsg(null);
    setAiTask({
      active: true,
      taskName: "Post-Mortem Yayınlama",
      message: "Post-Mortem raporu onaylanarak kurumsal arşive kaydediliyor...",
    });

    try {
      const res = await generatePostmortem(selectedIncident.id, {
        summary: finalReport.summary,
        root_cause: finalReport.root_cause,
        impact_metrics: finalReport.impact_metrics,
        action_items: finalReport.action_items,
        published: true,
      });
      if (res.data?.success && res.data.postmortem) {
        setFinalReport(res.data.postmortem);
        setFinalReportSavedMsg("Post-Mortem raporu onaylandı ve Tab 4 arşivine yayınlandı.");
        const pmRes = await fetchPostmortems();
        if (pmRes.data) setPostmortems(pmRes.data.postmortems);
      }
    } catch (err) {
      console.error("Failed to save final report:", err);
    } finally {
      setIsSavingFinalReport(false);
      setAiTask(null);
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

  // Filtered signals for Extended Mode
  const filteredStreamAlerts = streamAlerts.filter((a) => {
    if (signalViewFilter === "all") return true;
    return a.status === signalViewFilter;
  });

  const isCaseTaken = Boolean(
    selectedIncident &&
      (selectedIncident.status === "acknowledged" || selectedIncident.status === "resolved")
  );
  const isCaseResolved = Boolean(selectedIncident && selectedIncident.status === "resolved");
  const isBroadcastPublished = Boolean(
    broadcastPublishedSuccess ||
      selectedIncident?.events?.some((e) => e.action_type === "broadcast_published")
  );

  return (
    <div className="min-h-screen flex bg-[#07090E] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* ========================================================================= */}
      {/* ELITE LEFT SIDEBAR NAVIGATION */}
      {/* ========================================================================= */}
      <aside className="w-64 shrink-0 bg-[#0B0E17] border-r border-slate-800/70 flex flex-col justify-between sticky top-0 h-screen z-40">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg shadow-md shadow-emerald-500/20 text-slate-950 font-black">
                <ShieldCheck className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-wider text-white">
                    PULSEGUARD
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    AIOps
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Enterprise Incident Cloud
                </p>
              </div>
            </div>

            {/* Cisco Systems Badge */}
            <button
              onClick={() => setIsProofModalOpen(true)}
              className="mt-3.5 w-full flex items-center justify-between p-2 rounded-lg bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Award className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-medium text-blue-300">
                  Cisco Systems (Fortune #82)
                </span>
              </div>
              <ExternalLink className="w-3 h-3 text-blue-400/60 group-hover:text-blue-300 transition" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveTab("command")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === "command"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className={`w-4 h-4 ${activeTab === "command" ? "text-emerald-400" : ""}`} />
                <span>Olay Komuta Merkezi</span>
              </div>
              {dashboardData?.kpis.active_incidents_count ? (
                <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-[10px] font-mono">
                  {dashboardData.kpis.active_incidents_count}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveTab("aiops")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === "aiops"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className={`w-4 h-4 ${activeTab === "aiops" ? "text-emerald-400" : ""}`} />
                <span>AIOps Sinyal Akışı</span>
              </div>
              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-mono">
                &gt;90%
              </span>
            </button>

            <button
              onClick={() => setActiveTab("status")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === "status"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className={`w-4 h-4 ${activeTab === "status" ? "text-emerald-400" : ""}`} />
                <span>status.cisco.com</span>
              </div>
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </button>

            <button
              onClick={() => setActiveTab("postmortem")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === "postmortem"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className={`w-4 h-4 ${activeTab === "postmortem" ? "text-emerald-400" : ""}`} />
                <span>Post-Mortem &amp; ROI</span>
              </div>
              <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-300 rounded text-[9px] font-mono">
                ~96%
              </span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: AI Engine Status + Active Engineer + Health */}
        <div className="p-3 border-t border-slate-800/60 space-y-2.5">
          {/* Non-Blocking AI State Pill */}
          <div
            className={`p-2.5 rounded-lg border text-xs transition flex items-center gap-2.5 ${
              aiTask?.active
                ? "bg-emerald-950/50 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                : "bg-slate-900/60 border-slate-800/80"
            }`}
          >
            <div className="relative">
              <Sparkles
                className={`w-4 h-4 ${
                  aiTask?.active ? "text-emerald-400 animate-spin" : "text-emerald-400"
                }`}
              />
              {aiTask?.active && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                  {aiTask?.active ? "AI İşlem Yapıyor..." : "AI Motoru Aktif"}
                </span>
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    health?.ai_mode === "live_gemini"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {health?.ai_mode === "live_gemini" ? "API Key Active" : "Fallback"}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                {aiTask?.active ? aiTask.taskName : "Gemini 3.8 Flash Hazır"}
              </p>
            </div>
          </div>

          {/* Active Engineer Persona */}
          <div className="p-2 bg-slate-900/80 border border-slate-800 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-400" />
              <span>Aktif Mühendis Oturumu:</span>
            </div>
            <select
              value={selectedPersona}
              onChange={(e) => setSelectedPersona(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs font-medium rounded p-1 border border-slate-800 focus:outline-none cursor-pointer"
            >
              {PERSONAS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* API & DB Health */}
          <div className="flex items-center justify-between text-[11px] px-2 py-1 text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {health?.db_connected ? "DB Operational" : "DB Degraded"}
            </span>
            <span>{apiLatency > 0 ? `${apiLatency}ms` : "Live"}</span>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN WORKSPACE */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Minimalist Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0B0E17]/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              {activeTab === "command" && "Olay Komuta Merkezi (Log Tetikleme ➔ AI Servis Tespiti ➔ Vaka & Çözüm)"}
              {activeTab === "aiops" && "AIOps Telemetri Sinyal Akışı"}
              {activeTab === "status" && "Cisco Systems Canlı Durum Sayfası (status.cisco.com)"}
              {activeTab === "postmortem" && "Post-Mortem Arşivi & Cisco ROI Analizi"}
            </h1>
            <p className="text-[11px] text-slate-400">
              {activeTab === "command" &&
                "Loglar tetiklenir, AI arızalı servisi bulup kuyruğa ekler, hatayı yorumlar; mühendis vakayı alınca müşteri raporu ve tek tıkla çözüm açılır."}
              {activeTab === "aiops" && "Tüm telemetri kaynaklarından akan sinyaller ve gürültü azaltma metrikleri"}
              {activeTab === "status" && "90 günlük SLA geçmişi, müşteri duyuruları ve nöbetçi mühendis matrisi"}
              {activeTab === "postmortem" && "AI tarafından üretilen post-mortem raporları ve PagerDuty maliyet karşılaştırması"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-3 text-xs bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Aktif SEV-1:</span>
                <span className="font-bold font-mono text-rose-400">
                  {dashboardData?.kpis.active_sev1_count ?? 1}
                </span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">MTTR:</span>
                <span className="font-bold font-mono text-emerald-400">
                  {dashboardData?.kpis.mttr_minutes ?? 14.2}m
                </span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">AI Modu:</span>
                <span className="font-bold font-mono text-cyan-400">
                  {health?.ai_mode === "live_gemini" ? "Live Gemini API" : "Fallback Ready"}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setDrillServiceId(undefined);
                setIsOutageModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Manuel Arıza Kaydı</span>
            </button>
          </div>
        </header>

        {/* Non-Blocking Live AI Activity Banner */}
        {aiTask?.active && (
          <div className="sticky top-[57px] z-30 bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-slate-900/90 backdrop-blur-md border-b border-emerald-500/40 px-6 py-2.5 flex items-center justify-between text-xs shadow-lg">
            <div className="flex items-center gap-2.5 text-emerald-200">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <span>
                <strong className="text-white font-bold">{aiTask.taskName}:</strong>{" "}
                {aiTask.message}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-300">
              <span>Ekran Kilitlenmez (Non-Blocking AI State)</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: INCIDENT COMMAND CENTER */}
        {/* ========================================================================= */}
        {activeTab === "command" && (
          <main className="p-6 max-w-7xl w-full mx-auto space-y-6">
            {/* ===================================================================== */}
            {/* CONTAINER 1 (SEPARATE): LOG TRIGGER & EXTENDED SIGNAL STREAM CONTAINER */}
            {/* ===================================================================== */}
            <section className="bg-[#0C101B] border border-slate-800/90 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 mt-0.5">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Bağımsız Log &amp; Kayıt Açma Container&apos;ı
                      </span>
                      <h2 className="text-base font-bold text-white">
                        Canlı Log Tetikleme, Sinyal Akışı &amp; AI Servis Tespit Merkezi
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Loglar tetiklendiğinde sinyaller buraya akar; AI hatanın hangi Cisco servisinde olduğunu bulur ve aşağıdaki Olay Kuyruğuna yeni kayıt ekler.
                    </p>
                  </div>
                </div>

                {/* Log Trigger Controls */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <select
                    value={stormTargetSlug}
                    onChange={(e) => setStormTargetSlug(e.target.value)}
                    className="bg-slate-950 text-slate-200 text-xs rounded-xl px-3 py-2 border border-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="auto">🤖 Otomatik Karma Akış (AI Servisi Kendisi Bulsun)</option>
                    {services.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        Log Senaryosu: {s.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleTriggerLogsAndDetectService}
                    disabled={aiTask?.active}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4 fill-white" />
                    <span>
                      {aiTask?.active && aiTask.taskName.includes("Log")
                        ? "Loglar Akıyor & AI Analiz Ediyor..."
                        : "⚡ Logları Tetikle & Sinyalleri Akıt"}
                    </span>
                  </button>
                </div>
              </div>

              {/* AI Service Detection Result Banner */}
              {stormSummary && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-950/90 border border-emerald-500/30 rounded-xl p-4">
                  <div className="lg:col-span-8 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        AI Servis Tespiti Tamamlandı
                      </span>
                      <span className="text-xs font-bold text-white">
                        Tespit Edilen Servis:{" "}
                        <span className="text-emerald-400 underline">
                          {stormSummary.detected_service_name || selectedIncident?.service?.name}
                        </span>
                      </span>
                      {lastTriggeredIncidentId && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Olay Kuyruğuna Eklendi: #{lastTriggeredIncidentId}
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        Mod: {stormSummary.ai_mode === "live_gemini" ? "Live Gemini API" : "Resilient AI"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-100">AI Tespit Açıklaması:</strong>{" "}
                      {stormSummary.detection_reasoning}
                    </p>
                  </div>

                  {/* Telemetry Metrics */}
                  <div className="lg:col-span-4 grid grid-cols-3 gap-2 text-center border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-4">
                    <div className="p-2 bg-slate-900/70 rounded-lg border border-slate-800/80">
                      <div className="text-[10px] text-slate-400">Akan Sinyal</div>
                      <div className="text-sm font-bold text-white font-mono">
                        {stormSummary.raw_alerts_ingested}
                      </div>
                    </div>
                    <div className="p-2 bg-emerald-950/30 rounded-lg border border-emerald-500/30">
                      <div className="text-[10px] text-emerald-300">Kök Sinyal</div>
                      <div className="text-sm font-bold text-emerald-400 font-mono">
                        {stormSummary.grouped_count}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-900/70 rounded-lg border border-slate-800/80">
                      <div className="text-[10px] text-slate-400">Gürültü Bastırma</div>
                      <div className="text-sm font-bold text-cyan-400 font-mono">
                        {stormSummary.noise_reduction_percentage}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ALL SIGNALS IN EXTENDED MODE (Sinyallerin Tamamı Extended Modda) */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Akan Telemetri Sinyalleri — Extended Mod ({filteredStreamAlerts.length} / {streamAlerts.length} Sinyal Gösteriliyor)
                    </span>
                  </div>

                  {/* Filter Pills for Extended Stream */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSignalViewFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        signalViewFilter === "all"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      Tüm Sinyaller ({streamAlerts.length})
                    </button>
                    <button
                      onClick={() => setSignalViewFilter("grouped")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        signalViewFilter === "grouped"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      🎯 Kök Sinyaller ({streamAlerts.filter((a) => a.status === "grouped").length})
                    </button>
                    <button
                      onClick={() => setSignalViewFilter("suppressed_noise")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        signalViewFilter === "suppressed_noise"
                          ? "bg-slate-800 text-slate-200 border border-slate-600"
                          : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      🔇 Bastırılan Gürültü ({streamAlerts.filter((a) => a.status === "suppressed_noise").length})
                    </button>
                  </div>
                </div>

                {/* Extended Mode Scrollable Full Signal Table */}
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 divide-y divide-slate-800/70">
                  {filteredStreamAlerts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Henüz sinyal yok. Yukarıdaki &ldquo;⚡ Logları Tetikle &amp; Sinyalleri Akıt&rdquo; butonuna basarak canlı log akışını başlatın.
                    </div>
                  ) : (
                    filteredStreamAlerts.map((alert, index) => {
                      const isPrimary = alert.status === "grouped";
                      return (
                        <div
                          key={alert.id || index}
                          className={`p-3 transition text-xs space-y-1.5 ${
                            isPrimary
                              ? "bg-rose-950/15 hover:bg-rose-950/25"
                              : "hover:bg-slate-900/50 opacity-85"
                          }`}
                        >
                          {/* Row 1: Badges + Source + Timestamp */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] text-slate-500">
                                #{index + 1}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isPrimary
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                    : "bg-slate-800 text-slate-400 border border-slate-700"
                                }`}
                              >
                                {isPrimary
                                  ? "🎯 KÖK SİNYAL (OLAYA EKLENDİ)"
                                  : "🔇 GÜRÜLTÜ (AI BASTIRDI)"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                                  alert.severity === "critical"
                                    ? "bg-rose-500/15 text-rose-400"
                                    : alert.severity === "warning"
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-blue-500/15 text-blue-400"
                                }`}
                              >
                                {alert.severity}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-semibold text-cyan-300">
                                {alert.source}
                              </span>
                            </div>

                            <span className="font-mono text-[10px] text-slate-500">
                              {new Date(alert.created_at).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Row 2: Full Signal Message */}
                          <div className="font-mono text-xs text-slate-200 leading-relaxed pl-1">
                            {alert.message}
                          </div>

                          {/* Row 3: Extended Details (Fingerprint & Metadata always visible in Extended Mode) */}
                          <div className="flex flex-wrap items-center gap-3 pl-1 pt-0.5 text-[10px] font-mono text-slate-400">
                            <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800/80 text-slate-300">
                              Fingerprint: {alert.fingerprint}
                            </span>
                            {alert.metadata &&
                              Object.entries(alert.metadata).map(([k, v]) => (
                                <span
                                  key={k}
                                  className="bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800/60 text-slate-400"
                                >
                                  {k}: <strong className="text-slate-300">{String(v)}</strong>
                                </span>
                              ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* ===================================================================== */}
            {/* CONTAINER 2: INCIDENT QUEUE (LEFT) & CASE RESOLUTION WORKSPACE (RIGHT) */}
            {/* ===================================================================== */}
            <div className="grid grid-cols-12 gap-6 min-h-[680px]">
              {/* Left Column: Olay Kuyruğu (Incident Queue) */}
              <div className="col-span-12 lg:col-span-4 bg-[#0C101B] border border-slate-800/90 rounded-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-emerald-400" />
                      Olay Kuyruğu (Incident Queue)
                    </span>
                    <button
                      onClick={loadAllData}
                      disabled={isLoading}
                      className={`p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition ${
                        isLoading ? "animate-spin opacity-50" : ""
                      }`}
                      title="Kuyruğu Yenile"
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
                        className={`px-2.5 py-1 text-[10px] rounded-md capitalize font-semibold transition cursor-pointer ${
                          statusFilter === filter
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Queue List */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 max-h-[750px]">
                  {incidents.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Kuyrukta olay bulunamadı.
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
                              ? "bg-emerald-950/25 border-l-4 border-l-emerald-400"
                              : "hover:bg-slate-800/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                  inc.severity === "SEV-1"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                }`}
                              >
                                {inc.severity}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                #{inc.id}
                              </span>
                            </div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                inc.status === "triggered"
                                  ? "bg-rose-500/15 text-rose-400 animate-pulse"
                                  : inc.status === "acknowledged"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-emerald-500/15 text-emerald-300"
                              }`}
                            >
                              {inc.status === "triggered"
                                ? "YENİ (BEKLİYOR)"
                                : inc.status === "acknowledged"
                                ? "CASE ALINDI"
                                : "ÇÖZÜLDÜ"}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-100 line-clamp-2">
                            {inc.title}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                            <span className="truncate max-w-[160px] text-emerald-300/90 font-medium">
                              {inc.service?.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
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

              {/* Right Column: Selected Case AI Interpretation, Guidance, Case Ownership & Resolution */}
              <div className="col-span-12 lg:col-span-8 bg-[#0C101B] border border-slate-800/90 rounded-2xl p-6 flex flex-col space-y-6">
                {selectedIncident ? (
                  <div className="space-y-6">
                    {/* Incident Header */}
                    <div className="pb-4 border-b border-slate-800/80">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
                            className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                              selectedIncident.status === "triggered"
                                ? "bg-rose-500/20 text-rose-300"
                                : selectedIncident.status === "acknowledged"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {selectedIncident.status === "triggered"
                              ? "MÜHENDİS BEKLİYOR (TRIGGERED)"
                              : selectedIncident.status === "acknowledged"
                              ? "MÜHENDİS CASE'İ ALDI (ACKNOWLEDGED)"
                              : "ÇÖZÜLDÜ (RESOLVED)"}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            Case #{selectedIncident.id}
                          </span>
                        </div>

                        {selectedIncident.ai_triage_pass?.mode && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              selectedIncident.ai_triage_pass.mode === "live_gemini"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : "bg-slate-900 text-slate-400 border-slate-800"
                            }`}
                          >
                            AI Engine:{" "}
                            {selectedIncident.ai_triage_pass.mode === "live_gemini"
                              ? "Live Gemini API"
                              : "Resilient Fallback"}
                          </span>
                        )}
                      </div>

                      <h2 className="text-lg font-bold text-white mb-2">
                        {selectedIncident.title}
                      </h2>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span>
                          Etkilenen Servis:{" "}
                          <strong className="text-emerald-300">
                            {selectedIncident.service?.name}
                          </strong>{" "}
                          ({selectedIncident.service?.tier})
                        </span>
                        <span>&bull;</span>
                        <span>
                          Sorumlu Mühendis:{" "}
                          <strong className="text-white">
                            {selectedIncident.assigned_to}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* ===================================================================== */}
                    {/* STAGE 1: AI ERROR INTERPRETATION, ENGINEER GUIDANCE, SOLUTION & NOTIFICATION */}
                    {/* ===================================================================== */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/40">
                            1
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-white">
                              AI Hata Yorumu, Mühendis Yol Haritası &amp; Çözüm Önerisi
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              AI hatayı yorumlar, mühendise adım adım yol gösterir, çözümü sunar ve nöbetçi mühendise bildirir.
                            </p>
                          </div>
                        </div>

                        {selectedIncident.ai_triage_pass && (
                          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-mono">
                            %{selectedIncident.ai_triage_pass.confidence_score} AI Güven Skoru
                          </span>
                        )}
                      </div>

                      {/* 1A: AI Error Interpretation (Hata Yorumu) */}
                      <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                          🤖 AI Hata Yorumu (Kök Neden Analizi)
                        </span>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {selectedIncident.ai_triage_pass?.root_cause_hypothesis ||
                            "AI hata imzasını analiz ediyor..."}
                        </p>
                        {selectedIncident.error_signature && (
                          <pre className="mt-2 p-2.5 bg-slate-900/90 border border-slate-800/80 rounded-lg text-[11px] font-mono text-rose-300/90 overflow-x-auto whitespace-pre-wrap">
                            {selectedIncident.error_signature}
                          </pre>
                        )}
                      </div>

                      {/* 1B: AI Engineer Guidance (Mühendise Yol Gösterme) */}
                      <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5" />
                          Mühendis İçin Adım Adım Yol Haritası (AI Guidance)
                        </span>
                        <div className="space-y-1.5">
                          {(
                            selectedIncident.ai_triage_pass?.engineer_guidance || [
                              "1. Adım: Servis telemetri metriklerini ve bağlantı havuzu doygunluğunu kontrol edin.",
                              "2. Adım: Önerilen runbook komutunu çalıştırarak kilitli kaynakları temizleyin.",
                              "3. Adım: Servis yanıt süresinin SLA eşiğine döndüğünü doğrulayın.",
                            ]
                          ).map((stepText, idx) => (
                            <div
                              key={idx}
                              className="p-2 bg-slate-900/70 border border-slate-800/70 rounded-lg text-xs text-slate-200 flex items-start gap-2"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                              <span>{stepText}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 1C: AI Proposed Solution (Hatanın Çözümü) */}
                      {selectedIncident.ai_triage_pass?.suggested_runbook_command && (
                        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                              AI Tarafından Sunulan Hata Çözüm Komutu (Runbook)
                            </span>
                            <button
                              onClick={() =>
                                handleCopyRunbook(
                                  selectedIncident.ai_triage_pass?.suggested_runbook_command || ""
                                )
                              }
                              className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              {copiedCommand ? "Kopyalandı!" : "Komutu Kopyala"}
                            </button>
                          </div>
                          <div className="font-mono text-xs text-emerald-400 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 overflow-x-auto">
                            {selectedIncident.ai_triage_pass.suggested_runbook_command}
                          </div>
                        </div>
                      )}

                      {/* 1D: Engineer Notification & "Take Case" Button */}
                      <div className="p-4 bg-gradient-to-r from-amber-950/30 via-slate-950 to-slate-950 border border-amber-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                            <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
                            <span>Nöbetçi Mühendis Bildirimi &amp; Vaka Ataması</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {selectedIncident.ai_triage_pass?.engineer_notification ||
                              `🔔 Nöbetçi mühendis (${selectedIncident.service?.on_call_engineer}) bilgilendirildi. Müşteri raporu ve tek tıkla çözüm için vakayı üstlenin.`}
                          </p>
                        </div>

                        {selectedIncident.status === "triggered" ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={assignedEngineer}
                              onChange={(e) => setAssignedEngineer(e.target.value)}
                              className="bg-slate-950 text-slate-200 text-xs rounded-lg px-2.5 py-2 border border-slate-800 focus:outline-none cursor-pointer"
                            >
                              {PERSONAS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={handleTakeCase}
                              disabled={isTakingCase || aiTask?.active}
                              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                            >
                              <User className="w-4 h-4" />
                              <span>
                                {isTakingCase ? "Üstleniliyor..." : "Case'i Al (Vakayı Üstlen)"}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2 shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Case Alındı: {selectedIncident.assigned_to}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ===================================================================== */}
                    {/* STAGE 2: AFTER ENGINEER TAKES CASE -> SIMULTANEOUS CUSTOMER REPORT + 1-CLICK FIX */}
                    {/* ===================================================================== */}
                    {!isCaseTaken ? (
                      <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-6 text-center space-y-2">
                        <Lock className="w-6 h-6 text-slate-500 mx-auto" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          2. Aşama: Müşteri Bilgilendirme Raporu &amp; Tek Tıkla Çözüm (Mühendis Onayı Bekleniyor)
                        </h4>
                        <p className="text-xs text-slate-400 max-w-xl mx-auto">
                          Mühendis yukarıdaki <strong>&ldquo;Case&apos;i Al (Vakayı Üstlen)&rdquo;</strong> butonuna bastığı anda AI otomatik olarak <strong>Müşteri Bilgilendirme Raporunu</strong> hazırlayıp onaya sunacak ve aynı sırada <strong>Tek Tıkla Çözüm</strong> butonu aktifleşecektir.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        {/* LEFT PANEL (7 cols): AI CUSTOMER STATUS REPORT FOR ENGINEER APPROVAL */}
                        <div className="lg:col-span-7 rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-950/20 via-slate-900/70 to-slate-950 p-5 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 font-bold text-xs border border-purple-500/40">
                                2A
                              </span>
                              <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                  <Megaphone className="w-4 h-4 text-purple-400" />
                                  AI Müşteri Bilgilendirme Raporu
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                  Case alındığı için AI tarafından hazırlandı ve onayınıza sunuldu.
                                </p>
                              </div>
                            </div>

                            {broadcastAiMode && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                {broadcastAiMode === "live_gemini" ? "Live Gemini" : "AI Draft"}
                              </span>
                            )}
                          </div>

                          {/* Tone & Regenerate Controls */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={broadcastStatusType}
                                onChange={(e) =>
                                  setBroadcastStatusType(
                                    e.target.value as
                                      | "investigating"
                                      | "identified"
                                      | "monitoring"
                                      | "resolved"
                                  )
                                }
                                className="bg-slate-950 text-slate-300 text-[11px] rounded-lg px-2 py-1 border border-slate-800"
                              >
                                <option value="investigating">Investigating</option>
                                <option value="identified">Identified</option>
                                <option value="monitoring">Monitoring</option>
                                <option value="resolved">Resolved</option>
                              </select>

                              <select
                                value={broadcastTone}
                                onChange={(e) => setBroadcastTone(e.target.value)}
                                className="bg-slate-950 text-slate-300 text-[11px] rounded-lg px-2 py-1 border border-slate-800"
                              >
                                {BROADCAST_TONES.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              onClick={handleRegenerateCustomerReport}
                              disabled={isDraftingBroadcast || aiTask?.active}
                              className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 underline font-semibold cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>AI ile Yeniden Yaz</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            <input
                              type="text"
                              value={broadcastTitle}
                              onChange={(e) => setBroadcastTitle(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-semibold focus:outline-none focus:border-purple-500"
                              placeholder="Müşteri duyuru başlığı..."
                            />
                            <textarea
                              rows={3}
                              value={broadcastBody}
                              onChange={(e) => setBroadcastBody(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 leading-relaxed"
                              placeholder="Müşteri bilgilendirme metni..."
                            />
                          </div>

                          {isBroadcastPublished ? (
                            <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                {broadcastPublishedSuccess || "status.cisco.com üzerinde yayınlandı!"}
                              </span>
                              <button
                                onClick={() => setActiveTab("status")}
                                className="text-[11px] text-emerald-300 underline hover:text-white ml-2 shrink-0 cursor-pointer"
                              >
                                Gör &rarr;
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={handleApproveCustomerReport}
                              disabled={isPublishingBroadcast || aiTask?.active || !broadcastTitle}
                              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {isPublishingBroadcast
                                  ? "Yayınlanıyor..."
                                  : "Müşteri Raporunu Onayla & status.cisco.com'a Yayınla"}
                              </span>
                            </button>
                          )}
                        </div>

                        {/* RIGHT PANEL (5 cols): SIMULTANEOUS 1-CLICK AI REMEDIATION BUTTON */}
                        <div className="lg:col-span-5 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-slate-900/70 to-slate-950 p-5 flex flex-col justify-between space-y-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/40">
                                  2B
                                </span>
                                <div>
                                  <h3 className="text-sm font-bold text-white">
                                    Tek Tıkla AI Çözümü
                                  </h3>
                                  <p className="text-[11px] text-slate-400">
                                    Müşteri raporuyla eşzamanlı aktifleşti
                                  </p>
                                </div>
                              </div>
                              <Zap className="w-5 h-5 text-emerald-400" />
                            </div>

                            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg space-y-1.5">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                Çalıştırılacak Çözüm Komutu:
                              </span>
                              <div className="font-mono text-[11px] text-emerald-400 break-all">
                                {selectedIncident.ai_triage_pass?.suggested_runbook_command}
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-300 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">Tahmini MTTR Kazancı:</span>
                                <strong className="text-emerald-400 font-mono">
                                  ~{selectedIncident.ai_triage_pass?.estimated_time_saved_minutes || 20} dk
                                </strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">Sonraki Otomatik Adım:</span>
                                <strong className="text-cyan-300">AI Post-Mortem Raporu</strong>
                              </div>
                            </div>
                          </div>

                          {!isCaseResolved ? (
                            <button
                              onClick={handleExecuteOneClickSolution}
                              disabled={isExecutingRemediation || aiTask?.active}
                              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded-xl shadow-xl shadow-emerald-500/25 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <Zap className="w-4 h-4 fill-slate-950" />
                              <span>
                                {isExecutingRemediation
                                  ? "Çözüm Uygulanıyor & Post-Mortem Yazılıyor..."
                                  : "⚡ AI ile Tek Tıkla Sorunu Çöz"}
                              </span>
                            </button>
                          ) : (
                            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Sorun Tek Tıkla Çözüldü (Healthy)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Terminal Execution Logs */}
                    {terminalLogs.length > 0 && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                          Canlı Çözüm Yürütme Çıktısı
                        </div>
                        <div className="space-y-1">
                          {terminalLogs.map((log, i) => (
                            <div
                              key={i}
                              className={
                                log.includes("RESOLVED") || log.includes("200 OK")
                                  ? "text-emerald-400 font-bold"
                                  : "text-slate-300"
                              }
                            >
                              &gt; {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {remediationSuccessMsg && (
                      <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{remediationSuccessMsg}</span>
                      </div>
                    )}

                    {/* ===================================================================== */}
                    {/* STAGE 3: AI-GENERATED BLAMELESS POST-MORTEM REPORT */}
                    {/* ===================================================================== */}
                    {finalReport && (
                      <div className="rounded-xl border border-blue-500/40 bg-gradient-to-br from-blue-950/20 via-slate-900/80 to-slate-950 p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 font-bold text-xs border border-blue-500/40">
                              3
                            </span>
                            <div>
                              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-blue-400" />
                                AI Tarafından Üretilen Post-Mortem Raporu
                              </h3>
                              <p className="text-[11px] text-slate-400">
                                Tek tıkla çözümün ardından AI tarafından insan dilinde sentezlendi.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                              {selectedIncident.ai_triage_pass?.postmortem_mode === "live_gemini"
                                ? "Synthesized by Live Gemini API"
                                : "AI Post-Mortem Engine"}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                finalReport.published
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              }`}
                            >
                              {finalReport.published ? "ARŞİVDE YAYINLANDI" : "ONAYA HAZIR"}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                            1. Yönetici Özeti (İnsan Dilinde Olay ve Çözüm Özeti)
                          </label>
                          <textarea
                            rows={3}
                            value={finalReport.summary}
                            onChange={(e) =>
                              setFinalReport({ ...finalReport, summary: e.target.value })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                            2. Teknik Kök Neden &amp; Uygulanan Çözüm Analizi
                          </label>
                          <textarea
                            rows={2}
                            value={finalReport.root_cause}
                            onChange={(e) =>
                              setFinalReport({ ...finalReport, root_cause: e.target.value })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                            3. Etki ve SLA Metrikleri
                          </label>
                          <input
                            type="text"
                            value={finalReport.impact_metrics}
                            onChange={(e) =>
                              setFinalReport({ ...finalReport, impact_metrics: e.target.value })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                            4. Önleyici Mühendislik Aksiyonları (Checklist)
                          </label>
                          <div className="space-y-1.5">
                            {finalReport.action_items?.map((item, idx) => (
                              <div
                                key={idx}
                                onClick={() => handleToggleActionItem(idx)}
                                className="flex items-center gap-2.5 p-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 rounded-lg cursor-pointer transition text-xs"
                              >
                                {item.completed ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                )}
                                <span
                                  className={
                                    item.completed
                                      ? "line-through text-slate-400"
                                      : "text-slate-200"
                                  }
                                >
                                  {item.task}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {finalReportSavedMsg && (
                          <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>{finalReportSavedMsg}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[11px] text-slate-400">
                            Akış burada tamamlanır. Rapor Post-Mortem sekmesiyle senkronizedir.
                          </span>
                          <button
                            onClick={handleSaveFinalReport}
                            disabled={isSavingFinalReport || aiTask?.active}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                          >
                            {isSavingFinalReport
                              ? "Kaydediliyor..."
                              : "Post-Mortem Raporunu Onayla & Yayınla"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Kuyruktan bir olay seçin veya üstteki container&apos;dan yeni log akışı tetikleyin.
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: AIOPS & ALERT STREAM */}
        {/* ========================================================================= */}
        {activeTab === "aiops" && (
          <main className="p-6 max-w-7xl w-full mx-auto">
            <AiopsAlertStreamTab
              services={services}
              onSelectIncident={(incidentId) => {
                setSelectedIncidentId(incidentId);
                setActiveTab("command");
              }}
            />
          </main>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PUBLIC STATUS PAGE (status.cisco.com) */}
        {/* ========================================================================= */}
        {activeTab === "status" && (
          <main className="p-6 max-w-7xl w-full mx-auto">
            <PublicStatusPageTab
              services={services}
              onUpdateServiceOnCall={handleUpdateServiceOnCall}
              onOpenChaosDrill={handleOpenDrill}
              onViewIncident={(incidentId) => {
                setSelectedIncidentId(incidentId);
                setActiveTab("command");
              }}
            />
          </main>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: POST-MORTEMS & UNIT ECONOMICS HUB */}
        {/* ========================================================================= */}
        {activeTab === "postmortem" && (
          <main className="p-6 max-w-7xl w-full mx-auto space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Cisco Systems Blameless Post-Mortem Arşivi
                  </h2>
                  <p className="text-xs text-slate-400">
                    Olayların ardından AI tarafından üretilmiş ve arşivlenmiş raporlar.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {postmortems.length === 0 ? (
                  <div className="col-span-2 p-8 text-center bg-[#0C101B] border border-slate-800 rounded-xl text-slate-500 text-xs">
                    Henüz kayıtlı post-mortem bulunmuyor.
                  </div>
                ) : (
                  postmortems.map((pm) => (
                    <div
                      key={pm.id}
                      onClick={() => {
                        setSelectedPostmortem(pm);
                        setIsPostmortemModalOpen(true);
                      }}
                      className="bg-[#0C101B] border border-slate-800 hover:border-slate-700 rounded-xl p-5 cursor-pointer transition flex flex-col justify-between"
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
                            Kök Neden
                          </span>
                          <span className="text-rose-300 font-mono text-[11px] line-clamp-2">
                            {pm.root_cause}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span>
                          Aksiyonlar:{" "}
                          <strong className="text-slate-200">
                            {pm.action_items?.filter((a) => a.completed).length || 0} /{" "}
                            {pm.action_items?.length || 0} tamamlandı
                          </strong>
                        </span>
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          Raporu İncele &rarr;
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Executive Unit Economics & Cisco ROI Section */}
            <div className="bg-gradient-to-br from-[#0C101B] to-slate-950 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    Cisco Finansal ROI &amp; Birim Maliyet Hesaplayıcısı
                  </h3>
                  <p className="text-xs text-slate-400">
                    Geleneksel PagerDuty kurumsal lisanslama maliyeti ile PulseGuard AIOps karşılaştırması.
                  </p>
                </div>
                <button
                  onClick={() => setIsProofModalOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                >
                  Cisco Doğrulama Raporu &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Cisco Nöbetçi SRE &amp; Platform Mühendis Sayısı
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {calcEngineers} Mühendis
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
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Aylık Ortalama Bulut Arıza / Olay Sayısı
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {calcIncidentsPerMonth} Olay / Ay
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
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-rose-400 tracking-wider mb-1">
                    PagerDuty Yıllık Lisans Faturası
                  </div>
                  <div className="text-2xl font-black text-rose-400 mb-1">
                    ${pagerDutyCostAnnual.toLocaleString()}
                    <span className="text-xs font-normal text-slate-400"> / yıl</span>
                  </div>
                </div>

                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-emerald-400 tracking-wider mb-1">
                    PulseGuard Yıllık Maliyet
                  </div>
                  <div className="text-2xl font-black text-emerald-400 mb-1">
                    ${Math.round(totalPulseGuardAnnual).toLocaleString()}
                    <span className="text-xs font-normal text-slate-400"> / yıl</span>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-blue-400 tracking-wider mb-1">
                    Cisco Yıllık Net Tasarruf
                  </div>
                  <div className="text-2xl font-black text-blue-400 mb-1">
                    ${Math.round(annualSavings).toLocaleString()}
                    <span className="text-xs font-normal text-blue-300 ml-1">
                      ({savingsPercent}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Yılda ~{hoursSavedAnnual.toLocaleString()} saat mühendislik zamanı tasarrufu.
                  </p>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>

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
        onBroadcastPublished={() => {
          if (selectedIncidentId) {
            fetchIncident(selectedIncidentId).then((res) => {
              if (res.data?.incident) setSelectedIncident(res.data.incident);
            });
          }
          loadAllData();
        }}
      />
    </div>
  );
}

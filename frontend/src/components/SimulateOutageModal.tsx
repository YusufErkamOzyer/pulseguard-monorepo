"use client";

import React, { useState } from "react";
import { AlertOctagon, X, Zap } from "lucide-react";
import { ServiceRecord, createIncident } from "@/lib/api";

interface SimulateOutageModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: ServiceRecord[];
  onIncidentCreated: (incidentId: number) => void;
  defaultServiceId?: number;
}

const PRESETS = [
  {
    name: "Cisco Duo MFA: Redis Pool Exhaustion (SEV-1)",
    serviceSlug: "cisco-duo-auth",
    severity: "SEV-1" as const,
    title: "Redis Connection Pool Exhaustion across Duo Auth Clusters",
    errorSignature: `Redis::CannotConnectError: Connection pool exhausted (max 500 connections reached).
at /app/vendor/bundle/ruby/gems/redis-client-0.19.0/lib/redis_client/connection_pool.rb:64:in 'checkout'
at /app/services/auth/duo_token_verifier.rb:142:in 'verify_mfa_session'
at /app/controllers/api/v1/sessions_controller.rb:89:in 'create'
Client pool timeout: 5000ms exceeded. Active clients: 500/500, Waiting threads: 142.`,
  },
  {
    name: "Webex Edge: Frankfurt Jitter & Packet Drop (SEV-2)",
    serviceSlug: "webex-media-router",
    severity: "SEV-2" as const,
    title: "Webex Media Router Edge Latency Spike (>350ms in EU-Central)",
    errorSignature: `SDWAN-RTP-WARN: Jitter buffer overflow on edge interface ge0/0/2. Frankfurt-IXP latency = 384ms (SLA threshold: 120ms).
Packet drop rate: 4.8% on UDP audio stream cohort 44-A. ThousandEyes BGP flap alert triggered.`,
  },
  {
    name: "Meraki Cloud Sync: TLS Handshake Drop (SEV-1)",
    serviceSlug: "meraki-cloud-sync",
    severity: "SEV-1" as const,
    title: "Meraki Dashboard Config Sync WebSocket TLS Handshake Drop",
    errorSignature: `EnvoyTLSHandshakeError: Peer certificate verification failed (X509_V_ERR_CERT_HAS_EXPIRED).
Remote cluster: meraki-dashboard-sync-europe.internal:8443.
Failed connections: 3,410 handshakes terminated in last 60s across enterprise switches.`,
  },
  {
    name: "AppDynamics: Kafka Partition Lag Spillover (SEV-2)",
    serviceSlug: "appdynamics-ingestion",
    severity: "SEV-2" as const,
    title: "AppDynamics APM Telemetry Ingestion Worker Starvation",
    errorSignature: `Kafka::ConsumerLagSpike: Partition 14 lag exceeded 1,200,000 messages.
Memory pressure on worker pods: 98.4% RSS. Worker thread starvation on cisco-appd-ingest-03.`,
  },
];

export function SimulateOutageModal({
  isOpen,
  onClose,
  services,
  onIncidentCreated,
  defaultServiceId,
}: SimulateOutageModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(0);
  const [serviceId, setServiceId] = useState<number>(
    defaultServiceId || (services[0]?.id ?? 1)
  );
  const [title, setTitle] = useState(PRESETS[0].title);
  const [severity, setSeverity] = useState<"SEV-1" | "SEV-2" | "SEV-3">(PRESETS[0].severity);
  const [errorSignature, setErrorSignature] = useState(PRESETS[0].errorSignature);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (index: number) => {
    setSelectedPreset(index);
    const p = PRESETS[index];
    setTitle(p.title);
    setSeverity(p.severity);
    setErrorSignature(p.errorSignature);
    const matchedService = services.find((s) => s.slug === p.serviceSlug);
    if (matchedService) {
      setServiceId(matchedService.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Incident title is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const selectedSvc = services.find((s) => s.id === Number(serviceId));

    const res = await createIncident({
      service_id: Number(serviceId),
      title: title.trim(),
      severity,
      error_signature: errorSignature.trim(),
      assigned_to: selectedSvc?.on_call_engineer || "Alex Rivera (Principal SRE)",
      actor: "Cisco Catalyst Monitoring Probe",
    });

    setIsSubmitting(false);

    if (res.data?.success && res.data.incident) {
      onIncidentCreated(res.data.incident.id);
      onClose();
    } else {
      setError(res.error || "Failed to trigger simulated outage.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Simulate Cloud Outage</h2>
              <p className="text-xs text-slate-400">
                Trigger real-time telemetry to test PulseGuard AI-native triage & 1-click remediation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="my-4">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Cisco Infrastructure Outage Scenarios
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(idx)}
                className={`text-left p-2.5 rounded-lg border text-xs transition ${
                  selectedPreset === idx
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-medium"
                    : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold truncate">{p.name.split(":")[0]}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      p.severity === "SEV-1"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {p.severity}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">{p.title}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Target Service</label>
              <select
                value={serviceId}
                onChange={(e) => {
                  setServiceId(Number(e.target.value));
                  setSelectedPreset(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.tier}) — {s.status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value as "SEV-1" | "SEV-2" | "SEV-3");
                  setSelectedPreset(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="SEV-1">SEV-1 (Outage)</option>
                <option value="SEV-2">SEV-2 (Degraded)</option>
                <option value="SEV-3">SEV-3 (Minor)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Incident Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSelectedPreset(null);
              }}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Redis Connection Pool Exhaustion across Duo Auth Clusters"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Stack Trace / Telemetry Signature
            </label>
            <textarea
              rows={4}
              value={errorSignature}
              onChange={(e) => {
                setErrorSignature(e.target.value);
                setSelectedPreset(null);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 resize-none"
              placeholder="Paste stack trace or error log snippet..."
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-rose-600/30 transition cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              {isSubmitting ? "Synthesizing AI Triage Pass..." : "Inject Outage & Trigger AI"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

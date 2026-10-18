"use client";

import React, { useState } from "react";
import {
  IncidentRecord,
  StatusUpdateRecord,
  draftStakeholderBroadcast,
  publishStakeholderBroadcast,
} from "@/lib/api";
import {
  Megaphone,
  Sparkles,
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Radio,
  ExternalLink,
} from "lucide-react";

interface StakeholderBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: IncidentRecord | null;
  currentPersona?: string;
  onBroadcastPublished?: (statusUpdate: StatusUpdateRecord) => void;
}

const TONES = [
  { id: "empathetic", label: "Empathetic", desc: "Reassuring & clear for enterprise customers" },
  { id: "technical", label: "Technical", desc: "Detailed with operational diagnostics" },
  { id: "urgent", label: "Urgent", desc: "High-priority critical disruption advisory" },
  { id: "concise", label: "Concise", desc: "Brief, direct 1-line headline and impact" },
];

const STATUS_TYPES: Array<"investigating" | "identified" | "monitoring" | "resolved"> = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

export function StakeholderBroadcastModal({
  isOpen,
  onClose,
  incident,
  currentPersona = "Alex Rivera (Principal SRE)",
  onBroadcastPublished,
}: StakeholderBroadcastModalProps) {
  if (!isOpen || !incident) return null;

  return (
    <StakeholderBroadcastModalContent
      key={`${incident.id}`}
      onClose={onClose}
      incident={incident}
      currentPersona={currentPersona}
      onBroadcastPublished={onBroadcastPublished}
    />
  );
}

function StakeholderBroadcastModalContent({
  onClose,
  incident,
  currentPersona,
  onBroadcastPublished,
}: {
  onClose: () => void;
  incident: IncidentRecord;
  currentPersona: string;
  onBroadcastPublished?: (statusUpdate: StatusUpdateRecord) => void;
}) {
  const initialStatusType: "investigating" | "identified" | "monitoring" | "resolved" =
    incident.status === "resolved"
      ? "resolved"
      : incident.status === "acknowledged"
      ? "identified"
      : "investigating";

  const [tone, setTone] = useState<string>("empathetic");
  const [statusType, setStatusType] = useState<"investigating" | "identified" | "monitoring" | "resolved">(
    initialStatusType
  );
  const [title, setTitle] = useState<string>(
    incident.ai_triage_pass?.draft_status_update
      ? `Operational Advisory: ${incident.service?.name || "Service Issue"}`
      : `Investigating Degradation on ${incident.service?.name || "Cisco Service"}`
  );
  const [body, setBody] = useState<string>(
    incident.ai_triage_pass?.draft_status_update ||
      `We are currently investigating elevated latency and error rates on ${incident.service?.name || "this service"}. Engineering responders are analyzing telemetry and isolating the root cause.`
  );
  const [publishedBy, setPublishedBy] = useState<string>(currentPersona);
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<string | null>(
    incident.ai_triage_pass?.mode || null
  );

  const handleGenerateAiDraft = async () => {
    setIsDrafting(true);
    setError(null);
    setSuccessMessage(null);

    const res = await draftStakeholderBroadcast(incident.id, {
      tone: tone,
      status_type: statusType,
    });

    setIsDrafting(false);

    if (res.data?.success && res.data.draft) {
      setTitle(res.data.draft.title);
      setBody(res.data.draft.body);
      if (res.data.draft.status_type) {
        const returnedType = res.data.draft.status_type as "investigating" | "identified" | "monitoring" | "resolved";
        if (STATUS_TYPES.includes(returnedType)) {
          setStatusType(returnedType);
        }
      }
      setDraftMode(res.data.draft.mode || "live_gemini");
    } else {
      setError(res.error || "Failed to generate AI broadcast draft.");
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Both Title and Body are required before publishing.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    const res = await publishStakeholderBroadcast(incident.id, {
      title: title.trim(),
      body: body.trim(),
      status_type: statusType,
      published_by: publishedBy.trim() || currentPersona,
    });

    setIsPublishing(false);

    if (res.data?.success && res.data.status_update) {
      setSuccessMessage("Broadcast published successfully to status.cisco.com!");
      if (onBroadcastPublished) {
        onBroadcastPublished(res.data.status_update);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setError(res.error || "Failed to publish stakeholder broadcast.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Customer Status Broadcast
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  status.cisco.com
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Draft customer-facing status announcements from technical incident telemetry using Gemini 3.8 Flash.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Incident Context Ribbon */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  incident.severity === "SEV-1"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {incident.severity}
              </span>
              <span className="font-semibold text-slate-200">
                #{incident.id} &bull; {incident.title}
              </span>
            </div>
            <span className="text-slate-400 font-mono">
              {incident.service?.name}
            </span>
          </div>

          {/* AI Drafting Controls */}
          <div className="space-y-3 bg-slate-950/40 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                AI Broadcast Synthesizer (Gemini 3.8 Flash)
              </span>
              {draftMode && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {draftMode === "live_gemini" ? "Gemini 3.8 Flash" : "Deterministic Fallback"}
                </span>
              )}
            </div>

            {/* Tone Selector */}
            <div>
              <label className="text-[11px] text-slate-400 font-medium block mb-1.5">
                Communication Tone:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTone(t.id)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium text-left border transition cursor-pointer ${
                      tone === t.id
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold">{t.label}</div>
                    <div className="text-[10px] text-slate-400 leading-tight truncate">
                      {t.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Status Type Selector & AI Draft Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-medium mr-1">
                  Status Type:
                </span>
                {STATUS_TYPES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusType(st)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition cursor-pointer ${
                      statusType === st
                        ? st === "investigating"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : st === "identified"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          : st === "monitoring"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-900 text-slate-500 border border-slate-800 hover:text-slate-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleGenerateAiDraft}
                disabled={isDrafting}
                className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow shadow-emerald-500/20 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isDrafting ? "Synthesizing AI Draft..." : "✨ Generate AI Draft"}
              </button>
            </div>
          </div>

          {/* Form Fields: Title & Body */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Headline / Title:
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Investigating Authentication Latency on Cisco Duo Auth Gateway"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Customer Message (Body):
              </label>
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write clear, empathetic customer message..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Published By:
              </label>
              <input
                type="text"
                value={publishedBy}
                onChange={(e) => setPublishedBy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Live Preview on status.cisco.com */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5 text-blue-400 font-bold uppercase tracking-wider">
                <ExternalLink className="w-3 h-3" />
                Live Preview: status.cisco.com
              </span>
              <span>{incident.service?.name}</span>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white leading-snug">
                  {title || "Untitled Advisory"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    statusType === "investigating"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : statusType === "identified"
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : statusType === "monitoring"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {statusType}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {body || "No broadcast content."}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1 border-t border-slate-800/60 font-mono">
                <span>By {publishedBy || "PulseGuard AI Broadcast"}</span>
                <span>&bull;</span>
                <span>Just now</span>
              </div>
            </div>
          </div>

          {/* Feedback & Error states */}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || !title.trim() || !body.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-500/20 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {isPublishing ? "Publishing to status.cisco.com..." : "📢 Publish to status.cisco.com (1-Click)"}
          </button>
        </div>
      </div>
    </div>
  );
}

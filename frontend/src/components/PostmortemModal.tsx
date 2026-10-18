"use client";

import React, { useState } from "react";
import { PostmortemRecord, generatePostmortem, ActionItem } from "@/lib/api";
import { BookOpen, Send, X, CheckSquare, Square } from "lucide-react";

interface PostmortemModalProps {
  isOpen: boolean;
  onClose: () => void;
  postmortem: PostmortemRecord | null;
  onPostmortemUpdated?: (updated: PostmortemRecord) => void;
}

export function PostmortemModal({
  isOpen,
  onClose,
  postmortem,
  onPostmortemUpdated,
}: PostmortemModalProps) {
  if (!isOpen || !postmortem) return null;

  return (
    <PostmortemModalContent
      key={postmortem.id}
      onClose={onClose}
      postmortem={postmortem}
      onPostmortemUpdated={onPostmortemUpdated}
    />
  );
}

function PostmortemModalContent({
  onClose,
  postmortem,
  onPostmortemUpdated,
}: {
  onClose: () => void;
  postmortem: PostmortemRecord;
  onPostmortemUpdated?: (updated: PostmortemRecord) => void;
}) {
  const [summary, setSummary] = useState(postmortem.summary || "");
  const [rootCause, setRootCause] = useState(postmortem.root_cause || "");
  const [impactMetrics, setImpactMetrics] = useState(postmortem.impact_metrics || "");
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    postmortem.action_items || []
  );
  const [isPublishing, setIsPublishing] = useState(false);

  const toggleActionItem = (index: number) => {
    const updated = [...actionItems];
    updated[index].completed = !updated[index].completed;
    setActionItems(updated);
  };

  const handlePublish = async () => {
    if (!postmortem.incident?.id) return;
    setIsPublishing(true);

    const res = await generatePostmortem(postmortem.incident.id, {
      summary,
      root_cause: rootCause,
      impact_metrics: impactMetrics,
      action_items: actionItems,
      published: true,
    });

    setIsPublishing(false);
    if (res.data?.success && res.data.postmortem) {
      if (onPostmortemUpdated) onPostmortemUpdated(res.data.postmortem);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Blameless Post-Mortem Report</h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                    postmortem.published
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {postmortem.published ? "PUBLISHED" : "DRAFT (AI SYNTHESIZED)"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {postmortem.incident?.title || "Incident Post-Mortem"} &bull;{" "}
                {postmortem.incident?.service_name}
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

        {/* Scrollable Body */}
        <div className="overflow-y-auto my-4 space-y-4 pr-1 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Executive Summary</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Root Cause Hypothesis</label>
            <textarea
              rows={2}
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-rose-300 font-mono text-[11px] focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Impact & MTTR Metrics</label>
            <input
              type="text"
              value={impactMetrics}
              onChange={(e) => setImpactMetrics(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-2">
              Action Items & Prevention Checklist
            </label>
            <div className="space-y-2">
              {actionItems.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleActionItem(idx)}
                  className="w-full flex items-center gap-2.5 p-2 bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 rounded-lg text-left transition"
                >
                  {item.completed ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span
                    className={`text-xs ${
                      item.completed ? "text-slate-400 line-through" : "text-slate-200"
                    }`}
                  >
                    {item.task}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
          <span className="text-slate-500">
            Created: {new Date(postmortem.created_at).toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              Close
            </button>
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg shadow-emerald-600/30 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {isPublishing
                ? "Publishing..."
                : postmortem.published
                ? "Update Published Report"
                : "Publish to Cisco Status Hub"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

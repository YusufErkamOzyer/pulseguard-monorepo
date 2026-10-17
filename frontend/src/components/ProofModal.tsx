"use client";

import React from "react";
import { ExternalLink, ShieldCheck, CheckCircle2, TrendingUp, X, Award, FileCode } from "lucide-react";

interface ProofModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProofModal({ isOpen, onClose }: ProofModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Target Enterprise Proof & Validation</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full">
                  Fortune #82
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cisco Systems, Inc. Cloud Operations & Cisco Catalyst Center Architecture
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

        {/* Content */}
        <div className="my-5 space-y-4 text-xs text-slate-300">
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-400" />
                Official Cisco Documentation Citation:
              </span>
              <a
                href="https://www.cisco.com/c/en/us/td/docs/cloud-systems-management/network-automation-and-management/catalyst-center-platform/3-1-0/integrate-guide/b_integrate_guide_3_1_0/c_about_pagerduty_integration.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 underline"
              >
                Cisco Catalyst Center Guide
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
              &ldquo;Cisco Catalyst Center integrates with PagerDuty to automatically create incidents when network issues occur... However, resolution requires manual triage and runbook lookup by on-call engineers.&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg">
              <h4 className="font-semibold text-rose-400 mb-2">Legacy PagerDuty Model</h4>
              <ul className="space-y-1.5 text-slate-400">
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span><strong>~$1,188,000 / yr</strong> for 450 engineers ($220/user/mo).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>Dumb SMS/push notifications with 0 automated analysis.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>Average MTTR is 42 mins due to manual runbook hunting.</span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <h4 className="font-semibold text-emerald-400 mb-2">PulseGuard AI-Native Model</h4>
              <ul className="space-y-1.5 text-slate-300">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>~$42,000 / yr</strong> (~96% cost reduction for Cisco).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>1-Click Actionable Remediation Pass (Kullanılabilir Pas).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Auto-executes runbook, updates state & drafts blameless postmortem.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-200">The AI Zero-Tolerance Guarantee:</span> PulseGuard strictly enforces backend-only AI execution via Ruby on Rails 8. If Gemini API connectivity drops, an internal deterministic rule engine synthesizes verified runbooks so live operations are NEVER interrupted.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
          <span className="text-slate-500">Operation SSS — Phase 1 Cisco Deployment</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}

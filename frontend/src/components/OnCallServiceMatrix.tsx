"use client";

import React, { useState } from "react";
import { Flame, ShieldCheck } from "lucide-react";
import { ServiceRecord } from "@/lib/api";

const PERSONAS = [
  "Alex Rivera (Principal SRE)",
  "Elena Rostova (Staff Platform Eng)",
  "Sarah Chen (VP of Infrastructure)",
];

interface OnCallServiceMatrixProps {
  services: ServiceRecord[];
  onUpdateServiceOnCall: (serviceId: number, newEngineer: string) => Promise<void>;
  onOpenChaosDrill: (serviceId?: number) => void;
}

export function OnCallServiceMatrix({
  services,
  onUpdateServiceOnCall,
  onOpenChaosDrill,
}: OnCallServiceMatrixProps) {
  const [serviceUpdateLoading, setServiceUpdateLoading] = useState<number | null>(null);

  const handleEngineerChange = async (serviceId: number, engineer: string) => {
    setServiceUpdateLoading(serviceId);
    try {
      await onUpdateServiceOnCall(serviceId, engineer);
    } finally {
      setServiceUpdateLoading(null);
    }
  };

  return (
    <div className="space-y-6">
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
            Real-time health monitoring and dynamic on-call engineer reassignment (
            <code>PATCH /api/v1/services/:id</code>).
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
  );
}

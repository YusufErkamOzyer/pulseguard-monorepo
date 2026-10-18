"use client";

import React, { useState, useMemo } from "react";

interface UptimeBar90DayProps {
  serviceSlug: string;
  serviceStatus: string; // "healthy" | "degraded" | "outage"
  uptimePercentage: number;
}

interface DayUptime {
  dayIndex: number;
  dateStr: string;
  isoDate: string;
  status: "operational" | "degraded" | "outage";
  uptime: number;
  incidentNote?: string;
}

export function UptimeBar90Day({
  serviceSlug,
  serviceStatus,
  uptimePercentage,
}: UptimeBar90DayProps) {
  const [hoveredDay, setHoveredDay] = useState<DayUptime | null>(null);

  // Generate 90 daily bars deterministically ending at today (day 89)
  const days: DayUptime[] = useMemo(() => {
    const list: DayUptime[] = [];
    const now = new Date();

    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isToday = i === 0;

      let status: "operational" | "degraded" | "outage" = "operational";
      let uptime = 100.0;
      let incidentNote: string | undefined = undefined;

      if (isToday) {
        if (serviceStatus === "outage") {
          status = "outage";
          uptime = 94.2;
          incidentNote = "Active SEV-1: Outage in progress — responders mobilized";
        } else if (serviceStatus === "degraded") {
          status = "degraded";
          uptime = 98.4;
          incidentNote = "Active SEV-2: Degraded latency & packet jitter";
        } else {
          status = "operational";
          uptime = 100.0;
          incidentNote = "100% operational — no incidents reported";
        }
      } else {
        // Historical deterministic patterns based on service slug
        if (serviceSlug.includes("duo") && i === 7) {
          status = "degraded";
          uptime = 98.9;
          incidentNote = "Brief connection latency spike (14m duration - resolved)";
        } else if (serviceSlug.includes("webex") && i === 14) {
          status = "degraded";
          uptime = 98.1;
          incidentNote = "Upstream BGP route flap at Frankfurt IXP (22m duration)";
        } else if (serviceSlug.includes("meraki") && i === 3) {
          status = "outage";
          uptime = 95.8;
          incidentNote = "Intermediate TLS CA bundle rotation (15m duration - resolved)";
        } else if (serviceSlug.includes("appdynamics") && i === 42) {
          status = "degraded";
          uptime = 99.1;
          incidentNote = "Kafka consumer rebalance backpressure (8m duration)";
        } else if (serviceSlug.includes("licensing") && i === 65) {
          status = "degraded";
          uptime = 99.4;
          incidentNote = "Aurora replica lag spike during quarterly sync";
        }
      }

      list.push({
        dayIndex: 89 - i,
        dateStr: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        isoDate: d.toISOString().split("T")[0],
        status,
        uptime,
        incidentNote,
      });
    }

    return list;
  }, [serviceSlug, serviceStatus]);

  return (
    <div className="w-full space-y-2">
      {/* 90-Segment Flex Bar */}
      <div className="relative group">
        <div className="flex items-center gap-[2px] h-9 w-full bg-slate-950/80 p-1 rounded-lg border border-slate-800/80">
          {days.map((day) => {
            const barBg =
              day.status === "operational"
                ? "bg-emerald-500/80 hover:bg-emerald-400"
                : day.status === "degraded"
                ? "bg-amber-400 hover:bg-amber-300"
                : "bg-rose-500 hover:bg-rose-400 animate-pulse";

            return (
              <div
                key={day.dayIndex}
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                className={`flex-1 h-full rounded-[1px] cursor-pointer transition-all duration-150 hover:scale-y-125 hover:z-10 ${barBg}`}
              />
            );
          })}
        </div>

        {/* Hover Floating Tooltip */}
        {hoveredDay && (
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 shadow-xl text-center whitespace-nowrap">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-white">
              <span
                className={`h-2 w-2 rounded-full ${
                  hoveredDay.status === "operational"
                    ? "bg-emerald-400"
                    : hoveredDay.status === "degraded"
                    ? "bg-amber-400"
                    : "bg-rose-500"
                }`}
              />
              <span>{hoveredDay.dateStr}</span>
              <span className="text-slate-400 font-normal">|</span>
              <span
                className={
                  hoveredDay.status === "operational"
                    ? "text-emerald-400"
                    : hoveredDay.status === "degraded"
                    ? "text-amber-400"
                    : "text-rose-400"
                }
              >
                {hoveredDay.uptime.toFixed(1)}% Uptime
              </span>
            </div>
            {hoveredDay.incidentNote && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                {hoveredDay.incidentNote}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bar Footnote & Legend */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>90 days ago</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-400">Operational</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-slate-400">Degraded</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span className="text-slate-400">Outage</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-semibold">Today</span>
          <span className="font-bold text-emerald-400">{uptimePercentage.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}

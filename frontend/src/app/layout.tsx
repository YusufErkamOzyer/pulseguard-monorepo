import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseGuard | AI-Native Incident & On-Call Orchestration (Cisco Systems)",
  description:
    "Autonomous incident triage, 1-click remediation passes, and blameless post-mortems for Cisco Systems cloud infrastructure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full dark antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}

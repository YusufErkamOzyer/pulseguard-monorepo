export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// --- Health & Infrastructure Telemetry ---
export interface HealthResponse {
  status: string;
  rails_version: string;
  db_connected: boolean;
  total_logs: number;
  ai_mode: "live_gemini" | "deterministic_fallback" | string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T | null;
  latencyMs: number;
  error: string | null;
}

// --- PulseGuard Domain Models ---
export interface ServiceRecord {
  id: number;
  name: string;
  slug: string;
  tier: "Tier-1" | "Tier-2" | "Tier-3" | string;
  status: "healthy" | "degraded" | "outage" | string;
  on_call_engineer: string;
  escalation_policy: string;
  active_incidents_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ActionItem {
  task: string;
  completed: boolean;
}

export interface PostmortemRecord {
  id: number;
  summary: string;
  root_cause: string;
  impact_metrics: string;
  action_items: ActionItem[];
  published: boolean;
  created_at: string;
  updated_at?: string;
  incident?: {
    id: number;
    title: string;
    severity: string;
    status: string;
    service_name?: string;
    resolved_at?: string | null;
  };
}

export interface AiTriagePass {
  root_cause_hypothesis: string;
  confidence_score: number;
  matched_historical_incident: string;
  suggested_runbook_command: string;
  draft_status_update: string;
  recommended_assignee: string;
  estimated_time_saved_minutes: number;
  one_click_ready: boolean;
  mode?: "live_gemini" | "deterministic_fallback" | string;
  generated_at?: string;
}

export interface IncidentEventRecord {
  id: number;
  actor: string;
  action_type: "triggered" | "ai_analyzed" | "acknowledged" | "escalated" | "runbook_executed" | "resolved" | string;
  detail: string;
  created_at: string;
}

export interface IncidentRecord {
  id: number;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3" | string;
  status: "triggered" | "acknowledged" | "resolved" | string;
  error_signature: string;
  assigned_to: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  service: ServiceRecord | null;
  ai_triage_pass: AiTriagePass | null;
  postmortem?: PostmortemRecord | null;
  has_postmortem?: boolean;
  events?: IncidentEventRecord[];
}

export interface DashboardKpis {
  active_sev1_count: number;
  active_incidents_count: number;
  total_incidents_count: number;
  mttr_minutes: number;
  ai_hours_saved: number;
  ai_passes_executed: number;
}

export interface DashboardResponse {
  kpis: DashboardKpis;
  services: ServiceRecord[];
  recent_incidents: IncidentRecord[];
  timestamp: string;
}

// --- API Client Functions ---

export async function fetchHealth(): Promise<ApiResponse<HealthResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/health`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: HealthResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to connect to Rails API",
    };
  }
}

export async function fetchDashboard(): Promise<ApiResponse<DashboardResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/dashboard`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: DashboardResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch dashboard data",
    };
  }
}

export async function fetchServices(): Promise<ApiResponse<{ services: ServiceRecord[]; total: number }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/services`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch services",
    };
  }
}

export async function updateService(
  id: number,
  payload: Partial<ServiceRecord>
): Promise<ApiResponse<{ service: ServiceRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: payload }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to update service",
    };
  }
}

export async function fetchIncidents(
  status?: string,
  severity?: string
): Promise<ApiResponse<{ incidents: IncidentRecord[]; total: number }>> {
  const start = performance.now();
  try {
    const params = new URLSearchParams();
    if (status && status !== "all") params.append("status", status);
    if (severity && severity !== "all") params.append("severity", severity);

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents${query}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch incidents",
    };
  }
}

export async function fetchIncident(id: number): Promise<ApiResponse<{ incident: IncidentRecord }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch incident details",
    };
  }
}

export async function createIncident(payload: {
  service_id?: number;
  service_slug?: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  error_signature?: string;
  assigned_to?: string;
  actor?: string;
}): Promise<ApiResponse<{ incident: IncidentRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident: payload }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to create incident",
    };
  }
}

export async function transitionIncident(
  id: number,
  event: "acknowledge" | "resolve",
  actor: string
): Promise<ApiResponse<{ incident: IncidentRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/transition`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, actor }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to transition incident state",
    };
  }
}

export async function applyAiPass(
  id: number,
  actor: string
): Promise<ApiResponse<{ incident: IncidentRecord; success: boolean; message: string }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${id}/apply_ai_pass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to apply 1-click remediation pass",
    };
  }
}

export async function fetchPostmortems(published?: boolean): Promise<ApiResponse<{ postmortems: PostmortemRecord[]; total: number }>> {
  const start = performance.now();
  try {
    const query = published !== undefined ? `?published=${published}` : "";
    const res = await fetch(`${API_BASE_URL}/api/v1/postmortems${query}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch postmortems",
    };
  }
}

export async function generatePostmortem(
  incidentId: number,
  payload?: {
    summary?: string;
    root_cause?: string;
    impact_metrics?: string;
    action_items?: ActionItem[];
    published?: boolean;
  }
): Promise<ApiResponse<{ postmortem: PostmortemRecord; incident: IncidentRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}/generate_postmortem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to generate postmortem",
    };
  }
}

// --- Phase 0 Legacy Support ---
export interface SystemLogRecord {
  id: number;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SystemLogsResponse {
  total: number;
  logs: SystemLogRecord[];
}

export interface CreateSystemLogResponse {
  success: boolean;
  created_log: SystemLogRecord;
  total: number;
  logs: SystemLogRecord[];
  errors?: string[];
}

export interface AiTestResponse {
  status: string;
  mode: "live_gemini" | "fallback" | string;
  model?: string;
  actionable_pass_preview: string;
  fallback_reason?: string;
  timestamp: string;
  error?: string;
}

export async function fetchSystemLogs(): Promise<ApiResponse<SystemLogsResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system_logs`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    const data: SystemLogsResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to load system logs",
    };
  }
}

export async function createSystemLog(payload?: {
  event_type?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<ApiResponse<CreateSystemLogResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system_logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_log: payload || {} }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    const data: CreateSystemLogResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to write system log",
    };
  }
}

export async function runAiTest(prompt?: string): Promise<ApiResponse<AiTestResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/ai_test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    const data: AiTestResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to execute AI test",
    };
  }
}

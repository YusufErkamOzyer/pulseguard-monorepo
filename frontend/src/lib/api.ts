export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// --- Health & Infrastructure Telemetry ---
export interface HealthResponse {
  status: string;
  rails_version: string;
  db_connected: boolean;
  total_logs: number;
  ai_mode: "live_gemini" | "deterministic_fallback" | string;
  ai_models?: string[];
  primary_model?: string;
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
  engineer_guidance?: string[];
  engineer_notification?: string;
  service_detection_reasoning?: string;
  detected_service_name?: string;
  log_triage_mode?: string;
  postmortem_mode?: string;
  postmortem_model?: string;
  customer_broadcast_draft?: StakeholderBroadcastDraft;
  confidence_score: number;
  matched_historical_incident: string;
  suggested_runbook_command: string;
  draft_status_update: string;
  recommended_assignee: string;
  estimated_time_saved_minutes: number;
  one_click_ready: boolean;
  mode?: "live_gemini" | "deterministic_fallback" | string;
  model?: string;
  generated_at?: string;
}

export interface IncidentEventRecord {
  id: number;
  actor: string;
  action_type:
    | "triggered"
    | "ai_analyzed"
    | "acknowledged"
    | "escalated"
    | "runbook_executed"
    | "resolved"
    | "broadcast_published"
    | "aiops_alert_storm"
    | string;
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

// --- Milestone 3: AIOps Alert Telemetry Models ---
export interface AlertRecord {
  id: number;
  service_id: number;
  service_name?: string;
  incident_id: number | null;
  source: string; // "Cisco Catalyst Center" | "Datadog" | "ThousandEyes" | "AWS CloudWatch" | "Kubernetes Event"
  severity: "critical" | "warning" | "info" | string;
  status: "unprocessed" | "grouped" | "suppressed_noise" | string;
  message: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AlertFilters {
  service_id?: number | string;
  service_slug?: string;
  incident_id?: number | string;
  status?: "unprocessed" | "grouped" | "suppressed_noise" | "all" | string;
  severity?: "critical" | "warning" | "info" | "all" | string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface AlertsResponse {
  alerts: AlertRecord[];
  total: number;
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface NoiseMetrics {
  total_alerts: number;
  grouped_alerts: number;
  suppressed_noise: number;
  unprocessed_alerts: number;
  consolidated_incidents: number;
  noise_reduction_ratio: number;
  noise_reduction_percentage: number;
}

export interface StormSummary {
  raw_alerts_ingested: number;
  suppressed_count: number;
  grouped_count: number;
  noise_reduction_ratio: number;
  noise_reduction_percentage: number;
  detected_service_name?: string;
  detected_service_slug?: string;
  detection_reasoning?: string;
  ai_mode?: string;
  ai_model?: string;
}

export interface SimulateStormResponse {
  success: boolean;
  incident: IncidentRecord;
  storm_summary: StormSummary;
  alerts: AlertRecord[];
}

// --- Milestone 3: Public Status Page & Stakeholder Broadcast Models ---
export interface StatusUpdateRecord {
  id: number;
  service_id: number;
  service_name?: string;
  incident_id: number | null;
  title: string;
  body: string;
  status_type: "investigating" | "identified" | "monitoring" | "resolved" | string;
  published_by: string;
  published_at: string;
  created_at: string;
  updated_at?: string;
}

export interface StatusPageService {
  id: number;
  name: string;
  slug: string;
  tier: string;
  status: "healthy" | "degraded" | "outage" | string;
  on_call_engineer: string;
  escalation_policy: string;
  active_incidents_count: number;
  active_incidents: Array<{
    id: number;
    title: string;
    severity: string;
    status: string;
    created_at: string;
  }>;
  uptime_90d: number;
  created_at: string;
  updated_at: string;
}

export interface StatusPageMetrics {
  total_services: number;
  healthy_services: number;
  degraded_services: number;
  outage_services: number;
  overall_uptime_90d: number;
}

export interface StatusPageResponse {
  global_status: "operational" | "degraded" | "outage" | string;
  services: StatusPageService[];
  recent_broadcasts: StatusUpdateRecord[];
  metrics: StatusPageMetrics;
  timestamp: string;
}

export interface StakeholderBroadcastDraft {
  title: string;
  body: string;
  status_type: "investigating" | "identified" | "monitoring" | "resolved" | string;
  tone: string;
  service_id: number;
  service_name: string;
  mode: "live_gemini" | "deterministic_fallback" | string;
  model?: string;
  generated_at: string;
}

export interface DraftStakeholderBroadcastResponse {
  draft: StakeholderBroadcastDraft;
  success: boolean;
  error?: string;
}

export interface PublishStakeholderBroadcastResponse {
  status_update: StatusUpdateRecord;
  incident: IncidentRecord;
  success: boolean;
  error?: string;
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

// --- Milestone 3 API Client Functions: Alerts & AIOps ---

export async function fetchAlerts(
  filters?: AlertFilters
): Promise<ApiResponse<AlertsResponse>> {
  const start = performance.now();
  try {
    const params = new URLSearchParams();
    if (filters?.service_id && filters.service_id !== "all") {
      params.append("service_id", String(filters.service_id));
    }
    if (filters?.service_slug && filters.service_slug !== "all") {
      params.append("service_slug", filters.service_slug);
    }
    if (filters?.incident_id && filters.incident_id !== "all") {
      params.append("incident_id", String(filters.incident_id));
    }
    if (filters?.status && filters.status !== "all") {
      params.append("status", filters.status);
    }
    if (filters?.severity && filters.severity !== "all") {
      params.append("severity", filters.severity);
    }
    if (filters?.source && filters.source !== "all") {
      params.append("source", filters.source);
    }
    if (filters?.page) {
      params.append("page", String(filters.page));
    }
    if (filters?.limit) {
      params.append("limit", String(filters.limit));
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/v1/alerts${query}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: AlertsResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch alerts",
    };
  }
}

export async function fetchAlertMetrics(
  filters?: { service_id?: number | string; service_slug?: string }
): Promise<ApiResponse<NoiseMetrics>> {
  const start = performance.now();
  try {
    const params = new URLSearchParams();
    if (filters?.service_id && filters.service_id !== "all") {
      params.append("service_id", String(filters.service_id));
    }
    if (filters?.service_slug && filters.service_slug !== "all") {
      params.append("service_slug", filters.service_slug);
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/v1/alerts/metrics${query}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: NoiseMetrics = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch alert metrics",
    };
  }
}

export async function simulateAlertStorm(
  options?: {
    service_slug?: string;
    service_id?: number;
    incident_id?: number;
    burst_size?: number;
    create_fresh?: boolean;
  }
): Promise<ApiResponse<SimulateStormResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/alerts/simulate_storm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options || {}),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: SimulateStormResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to simulate alert storm",
    };
  }
}

export async function createAlert(payload: {
  service_id?: number;
  service_slug?: string;
  source: string;
  severity?: "critical" | "warning" | "info" | string;
  status?: "unprocessed" | "grouped" | "suppressed_noise" | string;
  message: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
  incident_id?: number;
}): Promise<ApiResponse<{ alert: AlertRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert: payload }),
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
      error: err instanceof Error ? err.message : "Failed to create raw alert",
    };
  }
}

// --- Milestone 3 API Client Functions: Public Status Page & Broadcasts ---

export async function fetchStatusPage(): Promise<ApiResponse<StatusPageResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/status_page`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: StatusPageResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch status page data",
    };
  }
}

export async function fetchStatusUpdates(filters?: {
  service_id?: number | string;
  incident_id?: number | string;
  status_type?: string;
  limit?: number;
}): Promise<ApiResponse<{ status_updates: StatusUpdateRecord[]; total: number }>> {
  const start = performance.now();
  try {
    const params = new URLSearchParams();
    if (filters?.service_id && filters.service_id !== "all") {
      params.append("service_id", String(filters.service_id));
    }
    if (filters?.incident_id && filters.incident_id !== "all") {
      params.append("incident_id", String(filters.incident_id));
    }
    if (filters?.status_type && filters.status_type !== "all") {
      params.append("status_type", filters.status_type);
    }
    if (filters?.limit) {
      params.append("limit", String(filters.limit));
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/v1/status_updates${query}`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to fetch status updates",
    };
  }
}

export async function createStatusUpdate(payload: {
  service_id: number;
  incident_id?: number;
  title: string;
  body: string;
  status_type?: "investigating" | "identified" | "monitoring" | "resolved" | string;
  published_by?: string;
  published_at?: string;
}): Promise<ApiResponse<{ status_update: StatusUpdateRecord; success: boolean }>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/status_updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_update: payload }),
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
      error: err instanceof Error ? err.message : "Failed to create status update",
    };
  }
}

export async function draftStakeholderBroadcast(
  incidentId: number,
  options?: { tone?: string; status_type?: string }
): Promise<ApiResponse<DraftStakeholderBroadcastResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}/draft_broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tone: options?.tone || "empathetic",
        status_type: options?.status_type,
      }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: DraftStakeholderBroadcastResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to draft stakeholder broadcast",
    };
  }
}

export async function publishStakeholderBroadcast(
  incidentId: number,
  payload: {
    title: string;
    body: string;
    status_type: "investigating" | "identified" | "monitoring" | "resolved" | string;
    published_by?: string;
  }
): Promise<ApiResponse<PublishStakeholderBroadcastResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/incidents/${incidentId}/publish_broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data: PublishStakeholderBroadcastResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    return {
      data: null,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Failed to publish stakeholder broadcast",
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

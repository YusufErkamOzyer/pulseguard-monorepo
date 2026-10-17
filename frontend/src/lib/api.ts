export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface HealthResponse {
  status: string;
  rails_version: string;
  db_connected: boolean;
  total_logs: number;
  ai_mode: "live_gemini" | "deterministic_fallback" | string;
  timestamp: string;
}

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

export interface ApiResponse<T> {
  data: T | null;
  latencyMs: number;
  error: string | null;
}

export async function fetchHealth(): Promise<ApiResponse<HealthResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const data: HealthResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      data: null,
      latencyMs,
      error: err instanceof Error ? err.message : "Failed to connect to Rails API",
    };
  }
}

export async function fetchSystemLogs(): Promise<ApiResponse<SystemLogsResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system_logs`, {
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const data: SystemLogsResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      data: null,
      latencyMs,
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ system_log: payload || {} }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const data: CreateSystemLogResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      data: null,
      latencyMs,
      error: err instanceof Error ? err.message : "Failed to write system log",
    };
  }
}

export async function runAiTest(prompt?: string): Promise<ApiResponse<AiTestResponse>> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/ai_test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const data: AiTestResponse = await res.json();
    return { data, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      data: null,
      latencyMs,
      error: err instanceof Error ? err.message : "Failed to execute AI test",
    };
  }
}

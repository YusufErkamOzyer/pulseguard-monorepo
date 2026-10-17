# Clean all tables idempotently
puts "== Seeding PulseGuard Database for Cisco Systems (Fortune #82) =="

Postmortem.destroy_all
IncidentEvent.destroy_all
Incident.destroy_all
Service.destroy_all

# Preserve baseline SystemLogs
boot_logs = [
  {
    event_type: "SYSTEM_BOOT",
    message: "Core kernel and microservices bootstrapped successfully.",
    metadata: { version: "0.2.0", env: Rails.env, layer: "infrastructure", product: "PulseGuard" }
  },
  {
    event_type: "DATABASE_PROVISIONED",
    message: "PostgreSQL connection pool established and verified.",
    metadata: { adapter: "postgresql", status: "healthy", pool_size: 5 }
  },
  {
    event_type: "AI_SERVICE_READY",
    message: "AI Engine interface initialized with Gemini 2.5 Flash and resilient fallback.",
    metadata: { provider: "Google Gemini", model: "gemini-2.5-flash", fallback: true }
  }
]

boot_logs.each do |attrs|
  SystemLog.find_or_create_by!(event_type: attrs[:event_type]) do |record|
    record.message = attrs[:message]
    record.metadata = attrs[:metadata]
  end
end

# 1. 5 Cisco Cloud Services
services_data = [
  {
    name: "Cisco Duo Auth Gateway",
    slug: "cisco-duo-auth",
    tier: "Tier-1",
    status: "outage",
    on_call_engineer: "Alex Rivera (Principal SRE)",
    escalation_policy: "SRE Pager -> Tier 1 Infra Lead -> VP Ops"
  },
  {
    name: "Webex Global Media Router",
    slug: "webex-media-router",
    tier: "Tier-1",
    status: "degraded",
    on_call_engineer: "Elena Rostova (Staff Platform Eng)",
    escalation_policy: "Audio/Video Escalation Chain -> VP Ops"
  },
  {
    name: "Meraki Dashboard Cloud Sync",
    slug: "meraki-cloud-sync",
    tier: "Tier-2",
    status: "healthy",
    on_call_engineer: "Sarah Chen (VP of Infrastructure)",
    escalation_policy: "Meraki Core Team -> NetOps Escalation"
  },
  {
    name: "AppDynamics Ingestion Pipeline",
    slug: "appdynamics-ingestion",
    tier: "Tier-1",
    status: "healthy",
    on_call_engineer: "Alex Rivera (Principal SRE)",
    escalation_policy: "Data Platform On-Call -> APM Lead"
  },
  {
    name: "Smart Licensing API",
    slug: "smart-licensing-api",
    tier: "Tier-2",
    status: "healthy",
    on_call_engineer: "Elena Rostova (Staff Platform Eng)",
    escalation_policy: "Enterprise Licensing Ops"
  }
]

services = {}
services_data.each do |data|
  svc = Service.create!(data)
  services[data[:slug]] = svc
  puts "Created Service: #{svc.name} [#{svc.status.upcase}] (On-call: #{svc.on_call_engineer})"
end

# 2. Active SEV-1 Incident (Triggered) on Cisco Duo Auth Gateway
duo_service = services["cisco-duo-auth"]
duo_error_sig = <<~TRACE.strip
  Redis::CannotConnectError: Connection pool exhausted (max 500 connections reached).
  at /app/vendor/bundle/ruby/gems/redis-client-0.19.0/lib/redis_client/connection_pool.rb:64:in `checkout'
  at /app/services/auth/duo_token_verifier.rb:142:in `verify_mfa_session'
  at /app/controllers/api/v1/sessions_controller.rb:89:in `create'
  Client pool timeout: 5000ms exceeded. Active clients: 500/500, Waiting threads: 142.
TRACE

duo_pass = {
  "root_cause_hypothesis" => "Redis connection pool exhaustion across Duo Auth clusters due to leaked idle connections under burst MFA traffic.",
  "confidence_score" => 96,
  "matched_historical_incident" => "INC-2025-08-442 (Cisco Duo Redis Pool Contention)",
  "suggested_runbook_command" => "kubectl scale deployment/cisco-duo-auth --replicas=12 && redis-cli -h auth-cluster.internal CLIENT KILL TYPE normal",
  "draft_status_update" => "Investigating elevated latency on Duo Auth Gateway. Automated runbook executed connection pool expansion.",
  "recommended_assignee" => "Alex Rivera (Principal SRE)",
  "estimated_time_saved_minutes" => 24,
  "one_click_ready" => true,
  "mode" => "deterministic_fallback",
  "generated_at" => 5.minutes.ago.iso8601
}

inc1 = Incident.create!(
  service: duo_service,
  title: "Redis Connection Pool Exhaustion across Duo Auth Clusters",
  severity: "SEV-1",
  status: "triggered",
  error_signature: duo_error_sig,
  assigned_to: "Alex Rivera (Principal SRE)",
  ai_triage_pass: duo_pass,
  created_at: 6.minutes.ago
)

inc1.incident_events.create!(
  actor: "Cisco Catalyst Monitoring",
  action_type: "triggered",
  detail: "Critical breach: Duo Auth Gateway latency > 1800ms. Redis pool checkout failure rate 94.2%. P99 latency breached SLA.",
  created_at: 6.minutes.ago
)

inc1.incident_events.create!(
  actor: "PulseGuard AI Agent",
  action_type: "ai_analyzed",
  detail: "⚡ 1-Click Actionable Remediation Pass synthesized (Confidence: 96%). Matched INC-2025-08-442. Runbook command ready for execution.",
  created_at: 5.minutes.ago
)

puts "Created Incident: #{inc1.title} [SEV-1 TRIGGERED]"

# 3. Active SEV-2 Incident (Acknowledged) on Webex Global Media Router
webex_service = services["webex-media-router"]
webex_error_sig = <<~TRACE.strip
  SDWAN-RTP-WARN: Jitter buffer overflow on edge interface ge0/0/2. Frankfurt-IXP latency = 384ms (SLA threshold: 120ms).
  Packet drop rate: 4.8% on UDP audio stream cohort 44-A.
TRACE

webex_pass = {
  "root_cause_hypothesis" => "BGP route flapping at Frankfurt IXP causing UDP packet drop on Webex RTP streams.",
  "confidence_score" => 91,
  "matched_historical_incident" => "INC-2025-04-301 (Frankfurt Edge Route Flap)",
  "suggested_runbook_command" => "cisco-sdwan-ctl reroute --service webex-media --egress-pref ams-ix --drain fra-ix",
  "draft_status_update" => "Rerouted Webex RTP media traffic through Amsterdam IX to bypass Frankfurt IXP jitter.",
  "recommended_assignee" => "Elena Rostova (Staff Platform Eng)",
  "estimated_time_saved_minutes" => 16,
  "one_click_ready" => true,
  "mode" => "deterministic_fallback",
  "generated_at" => 20.minutes.ago.iso8601
}

inc2 = Incident.create!(
  service: webex_service,
  title: "Webex Media Router Edge Latency Spike (>350ms in EU-Central)",
  severity: "SEV-2",
  status: "acknowledged",
  error_signature: webex_error_sig,
  assigned_to: "Elena Rostova (Staff Platform Eng)",
  acknowledged_at: 14.minutes.ago,
  ai_triage_pass: webex_pass,
  created_at: 22.minutes.ago
)

inc2.incident_events.create!(
  actor: "Cisco ThousandEyes Synthetic Probe",
  action_type: "triggered",
  detail: "Latency violation detected on Frankfurt Webex PoP (>350ms). Jitter buffer overflow triggered alert.",
  created_at: 22.minutes.ago
)

inc2.incident_events.create!(
  actor: "PulseGuard AI Agent",
  action_type: "ai_analyzed",
  detail: "Identified BGP route flapping at Frankfurt IXP. Suggested rerouting RTP audio streams via Amsterdam IX (Confidence: 91%).",
  created_at: 20.minutes.ago
)

inc2.incident_events.create!(
  actor: "Elena Rostova (Staff Platform Eng)",
  action_type: "acknowledged",
  detail: "Incident acknowledged. Reviewing suggested SD-WAN route shift to Amsterdam IX.",
  created_at: 14.minutes.ago
)

puts "Created Incident: #{inc2.title} [SEV-2 ACKNOWLEDGED]"

# 4. Historic Resolved Incident with Full Published Postmortem on Meraki Cloud Sync
meraki_service = services["meraki-cloud-sync"]
meraki_error_sig = <<~TRACE.strip
  EnvoyTLSHandshakeError: Peer certificate verification failed (X509_V_ERR_CERT_HAS_EXPIRED).
  Remote cluster: meraki-dashboard-sync-europe.internal:8443.
  Failed connections: 3,410 handshakes terminated in last 60s.
TRACE

meraki_pass = {
  "root_cause_hypothesis" => "Expired TLS root bundle in Edge Envoy proxy causing TLS handshake termination drop.",
  "confidence_score" => 93,
  "matched_historical_incident" => "INC-2025-11-109 (Meraki Cloud Sync TLS Handshake Failover)",
  "suggested_runbook_command" => "envoy-cli --admin refresh-tls-certs --cluster meraki-sync && kubectl rollout restart ds/envoy-proxy",
  "draft_status_update" => "Mitigated TLS handshake drops across Meraki Cloud Sync. Certificates rotated and connections stabilized.",
  "recommended_assignee" => "Sarah Chen (VP of Infrastructure)",
  "estimated_time_saved_minutes" => 19,
  "one_click_ready" => true,
  "mode" => "deterministic_fallback",
  "generated_at" => 2.hours.ago.iso8601
}

inc3 = Incident.create!(
  service: meraki_service,
  title: "Meraki Dashboard Config Sync WebSocket TLS Handshake Drop",
  severity: "SEV-1",
  status: "resolved",
  error_signature: meraki_error_sig,
  assigned_to: "Sarah Chen (VP of Infrastructure)",
  acknowledged_at: 110.minutes.ago,
  resolved_at: 95.minutes.ago,
  ai_triage_pass: meraki_pass,
  created_at: 2.hours.ago
)

inc3.incident_events.create!(
  actor: "Meraki NetOps Alert",
  action_type: "triggered",
  detail: "TLS handshake failures exceeded 15% across European enterprise access points.",
  created_at: 2.hours.ago
)

inc3.incident_events.create!(
  actor: "PulseGuard AI Agent",
  action_type: "ai_analyzed",
  detail: "Matched historical incident INC-2025-11-109. Expired TLS root bundle in Edge Envoy proxy identified with 93% confidence.",
  created_at: 115.minutes.ago
)

inc3.incident_events.create!(
  actor: "Sarah Chen (VP of Infrastructure)",
  action_type: "acknowledged",
  detail: "Incident acknowledged. Approved automated remediation pass.",
  created_at: 110.minutes.ago
)

inc3.incident_events.create!(
  actor: "PulseGuard AI Agent",
  action_type: "runbook_executed",
  detail: "⚡ Executed automated runbook: `envoy-cli --admin refresh-tls-certs --cluster meraki-sync && kubectl rollout restart ds/envoy-proxy`. Daemonset pods re-initialized successfully.",
  created_at: 100.minutes.ago
)

inc3.incident_events.create!(
  actor: "Sarah Chen (VP of Infrastructure)",
  action_type: "resolved",
  detail: "TLS verification passed across all 14,000 active Meraki nodes. Handshake error rate dropped to 0.00%.",
  created_at: 95.minutes.ago
)

# Published Postmortem for INC-3
Postmortem.create!(
  incident: inc3,
  summary: "Meraki Config Sync experienced sudden TLS handshake drops across EU clusters due to an unnotified intermediate CA bundle expiration in the edge proxy daemonset.",
  root_cause: "Edge Envoy daemonsets were caching an expired DigiCert intermediate certificate that was missed during the weekly cert-manager automated rotation.",
  impact_metrics: "15 minutes incident duration. 0 network hardware disconnects. PulseGuard 1-click pass prevented estimated 45 minutes of manual node certificate cycling.",
  action_items: [
    { "task" => "Automate Envoy certificate reload hooks in cert-manager webhook", "completed" => true },
    { "task" => "Add ThousandEyes synthetic TLS validity monitor with 14-day early expiration alert", "completed" => true },
    { "task" => "Document automated failover runbook in Cisco Catalyst Center runbook repository", "completed" => true }
  ],
  published: true,
  created_at: 90.minutes.ago
)

puts "Created Incident: #{inc3.title} [SEV-1 RESOLVED + PUBLISHED POSTMORTEM]"
puts "== Seed complete: 5 Services, 3 Incidents, 10 Events, 1 Postmortem =="

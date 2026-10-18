# frozen_string_literal: true

# Clean all tables idempotently
puts "== Seeding PulseGuard Database for Cisco Systems (Fortune #82) =="

StatusUpdate.destroy_all if defined?(StatusUpdate)
Alert.destroy_all if defined?(Alert)
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
    message: "AI Engine interface initialized with Gemini 3.8 Flash and resilient fallback.",
    metadata: { provider: "Google Gemini", model: "gemini-3.8-flash", fallback: true }
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

# 5. Cisco Telemetry Raw Alert Seed Pool (57 Alerts across 5 Services & 5 Sources)
puts "== Seeding Cisco Telemetry Alerts (57 records across 5 services) =="

alerts_data = [
  # --- Service 1: Cisco Duo Auth Gateway (12 alerts: 4 grouped to inc1, 6 suppressed, 2 unprocessed) ---
  {
    service: duo_service,
    incident: inc1,
    source: "Datadog",
    severity: "critical",
    status: "grouped",
    fingerprint: "duo:redis:pool_exhaustion:auth-cluster-redis-01",
    message: "CRITICAL: Redis client checkout latency breached 5000ms threshold on auth-cluster-redis-01. Available connections: 0/500.",
    metadata: { cluster: "duo-prod-us-west-2", pod: "duo-auth-gateway-7b98f-x92zk", metric: "redis.pool.checkout_latency_ms", value: 5042, threshold: 5000, host: "ip-10-0-14-22.us-west-2.compute.internal" },
    created_at: 8.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Cisco Catalyst Center",
    severity: "critical",
    status: "grouped",
    fingerprint: "duo:catalyst:sla_latency_p99_breach",
    message: "Catalyst Assurance SLA Breach: Cisco Duo Auth Gateway p99 authentication response time spiked to 1840ms (SLA target: <250ms).",
    metadata: { device: "cisco-cat9k-border-leaf-01", site: "SJC-DC-10", sla_rule: "Duo_MFA_P99_SLA", current_value_ms: 1840, target_value_ms: 250, vlan: 402 },
    created_at: 7.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "AWS CloudWatch",
    severity: "critical",
    status: "grouped",
    fingerprint: "duo:aws:nlb_target_5xx_spike",
    message: "CloudWatch Alarm: TargetGroup/duo-auth-nlb HTTPCode_Target_5XX_Count > 450 in 1-minute window.",
    metadata: { load_balancer: "net/duo-auth-prod-nlb/9d8234a71", target_group: "targetgroup/duo-auth-tg/29e18b", metric: "HTTPCode_Target_5XX_Count", value: 512, threshold: 450 },
    created_at: 6.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "ThousandEyes",
    severity: "critical",
    status: "grouped",
    fingerprint: "duo:thousandeyes:push_api_timeout",
    message: "ThousandEyes Synthetic Check Failure: Cisco Duo MFA push notification API endpoint returned HTTP 504 Gateway Timeout from 18 global monitoring agents.",
    metadata: { test_name: "Duo Auth Push API - Global Synthetics", failed_agents: 18, total_agents: 24, endpoint: "https://api-duo.cisco.com/frame/prompt", response_code: 504 },
    created_at: 6.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "duo:datadog:puma_thread_pool_queued",
    message: "Datadog APM: Waiting threads on threadpool `puma-duo-auth` exceeded 140 queued threads.",
    metadata: { service: "duo-auth-gateway", metric: "puma.thread_pool.waiting", value: 142, threshold: 100, host: "duo-auth-app-04" },
    created_at: 5.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Kubernetes Event",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "duo:k8s:readiness_probe_503:pod_x92zk",
    message: "Kubernetes Event: Readiness probe failed: HTTP probe failed with statuscode: 503 for pod duo-auth-gateway-7b98f-x92zk.",
    metadata: { namespace: "duo-production", pod: "duo-auth-gateway-7b98f-x92zk", container: "auth-gateway", exit_code: nil, reason: "ProbeFailed" },
    created_at: 5.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "AWS CloudWatch",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "duo:aws:elasticache_cpu_saturation",
    message: "CloudWatch Alarm: ElastiCache/auth-redis-cluster CPUUtilization elevated to 88.4% during connection retry storm.",
    metadata: { cache_cluster_id: "auth-redis-cluster-001", metric: "CPUUtilization", value: 88.4, threshold: 80.0 },
    created_at: 4.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Kubernetes Event",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "duo:k8s:hpa_scale_up_event",
    message: "Kubernetes Event: HorizontalPodAutoscaler duo-auth-hpa triggered scale up from 6 to 12 replicas due to CPU/Latency breach.",
    metadata: { hpa: "duo-auth-hpa", current_replicas: 6, desired_replicas: 12, reason: "TargetMetricBreached" },
    created_at: 4.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "duo:datadog:okta_federation_timeout",
    message: "Datadog APM: Upstream Okta federation callback timeout rate rose to 12.3%.",
    metadata: { upstream: "okta-idp-connector", timeout_rate: 12.3, threshold: 5.0 },
    created_at: 3.minutes.ago
  },
  {
    service: duo_service,
    incident: inc1,
    source: "Cisco Catalyst Center",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "duo:catalyst:interface_buffer_drop",
    message: "Catalyst Center Network Assurance: Access switch port GigabitEthernet1/0/24 interface buffer drop counter incrementing.",
    metadata: { switch: "cat9300-sjc-leaf2", port: "Gi1/0/24", drops_per_sec: 42 },
    created_at: 3.minutes.ago
  },
  {
    service: duo_service,
    incident: nil,
    source: "Datadog",
    severity: "info",
    status: "unprocessed",
    fingerprint: "duo:datadog:tls_resumption_fluctuation",
    message: "Datadog Logs: Rate of client TLS session ticket resumption dropped by 8% across secondary ingress.",
    metadata: { ingress: "duo-secondary-ingress-usw2", rate_change_pct: -8.2 },
    created_at: 2.minutes.ago
  },
  {
    service: duo_service,
    incident: nil,
    source: "Kubernetes Event",
    severity: "info",
    status: "unprocessed",
    fingerprint: "duo:k8s:configmap_synced_flags",
    message: "Kubernetes Event: ConfigMap `duo-auth-feature-flags` successfully synced across daemonsets.",
    metadata: { namespace: "duo-production", configmap: "duo-auth-feature-flags", revision: 144 },
    created_at: 1.minute.ago
  },

  # --- Service 2: Webex Global Media Router (12 alerts: 3 grouped to inc2, 6 suppressed, 3 unprocessed) ---
  {
    service: webex_service,
    incident: inc2,
    source: "ThousandEyes",
    severity: "critical",
    status: "grouped",
    fingerprint: "webex:thousandeyes:frankfurt_rtp_jitter",
    message: "ThousandEyes WAN Probe: Jitter buffer overflow on interface ge0/0/2 at Frankfurt-IXP. Latency = 384ms (SLA threshold: 120ms).",
    metadata: { pop: "FRA-IXP", interface: "ge0/0/2", latency_ms: 384, sla_threshold_ms: 120, test_id: "te-webex-rtp-fra" },
    created_at: 24.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "Cisco Catalyst Center",
    severity: "critical",
    status: "grouped",
    fingerprint: "webex:catalyst:sdwan_rtp_packet_drop",
    message: "Catalyst SD-WAN Assurance: UDP packet drop rate reached 4.8% on Webex RTP audio stream cohort 44-A (EU-Central).",
    metadata: { vEdge: "vedge-fra-02.cisco.com", cohort: "44-A", loss_pct: 4.8, threshold_pct: 1.0, protocol: "UDP/RTP" },
    created_at: 23.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "Datadog",
    severity: "warning",
    status: "grouped",
    fingerprint: "webex:datadog:audio_mos_degraded",
    message: "Datadog APM: Webex Media Node mean opinion score (MOS) degraded to 2.84 in Central Europe region (target > 4.2).",
    metadata: { region: "eu-central-1", mos_score: 2.84, normal_mos: 4.35, active_meetings_impacted: 340 },
    created_at: 22.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "AWS CloudWatch",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "webex:aws:dx_bgp_flap",
    message: "CloudWatch Alarm: DirectConnect dxcon-fra01 ConnectionState fluctuating: 3 BGP state changes in 10 minutes.",
    metadata: { dx_connection: "dxcon-fra01", bgp_state: "down/up", flap_count: 3 },
    created_at: 21.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "ThousandEyes",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "webex:thousandeyes:bgp_as3356_route_withdraw",
    message: "ThousandEyes BGP Monitor: AS3356 route withdrawal detected for Webex Media Router IPv4 prefix 192.118.224.0/22.",
    metadata: { prefix: "192.118.224.0/22", peer_as: 3356, withdrawal_event: true },
    created_at: 20.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "Cisco Catalyst Center",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "webex:catalyst:ef_queue_saturation",
    message: "Catalyst Center QoS Assurance: Expedited Forwarding (EF) queue saturation on edge router edge-gw-fra-01.",
    metadata: { router: "edge-gw-fra-01", queue: "EF_VOICE", drop_packets: 12080 },
    created_at: 19.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "webex:datadog:rtp_retransmit_spike",
    message: "Datadog Network Monitoring: Audio packet retransmissions increased by 310% on Frankfurt edge RTP proxy.",
    metadata: { proxy: "fra-rtp-proxy-03", retransmit_increase_pct: 310, threshold: 50 },
    created_at: 18.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "Kubernetes Event",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "webex:k8s:rtp_cpu_throttling",
    message: "Kubernetes Event: Pod `webex-rtp-gateway-eu-7c98b` CPU throttling elevated to 38% due to audio transcoding burst.",
    metadata: { pod: "webex-rtp-gateway-eu-7c98b", throttle_percentage: 38.2, limit_cores: 4 },
    created_at: 16.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    source: "ThousandEyes",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "webex:thousandeyes:synthetic_branch_probe",
    message: "ThousandEyes Diagnostic: Synthetic latency probe from Munich branch office to Webex Frankfurt PoP measured 312ms.",
    metadata: { branch: "Munich-HQ-Office", measured_rtt_ms: 312, normal_rtt_ms: 22 },
    created_at: 15.minutes.ago
  },
  {
    service: webex_service,
    incident: nil,
    source: "Datadog",
    severity: "info",
    status: "unprocessed",
    fingerprint: "webex:datadog:sip_keepalive_normal",
    message: "Datadog Metrics: SIP signaling keepalive round-trip time normal at 34ms on Amsterdam secondary gateway.",
    metadata: { gateway: "ams-sip-gw-01", rtt_ms: 34, status: "nominal" },
    created_at: 10.minutes.ago
  },
  {
    service: webex_service,
    incident: nil,
    source: "AWS CloudWatch",
    severity: "info",
    status: "unprocessed",
    fingerprint: "webex:aws:global_accelerator_health_pass",
    message: "CloudWatch Metric: AWS Global Accelerator routing health check passed for secondary POP in Ireland.",
    metadata: { accelerator_arn: "arn:aws:globalaccelerator::123456789012:accelerator/webex-media", health: "healthy" },
    created_at: 7.minutes.ago
  },
  {
    service: webex_service,
    incident: nil,
    source: "Kubernetes Event",
    severity: "info",
    status: "unprocessed",
    fingerprint: "webex:k8s:canary_rollout_codec",
    message: "Kubernetes Event: Automated canary deployment of `webex-media-codec-v4` rolled out to 10% of EU nodes.",
    metadata: { deployment: "webex-media-codec", canary_weight: 10, cluster: "eu-central-k8s" },
    created_at: 3.minutes.ago
  },

  # --- Service 3: Meraki Dashboard Cloud Sync (12 alerts: 4 grouped to inc3, 6 suppressed, 2 unprocessed) ---
  {
    service: meraki_service,
    incident: inc3,
    source: "Cisco Catalyst Center",
    severity: "critical",
    status: "grouped",
    fingerprint: "meraki:catalyst:envoy_tls_cert_expired",
    message: "Envoy TLS Handshake Failure: Peer certificate verification failed (X509_V_ERR_CERT_HAS_EXPIRED) on Europe sync cluster.",
    metadata: { cluster: "meraki-dashboard-sync-europe.internal", port: 8443, error: "X509_V_ERR_CERT_HAS_EXPIRED", failed_handshakes_60s: 3410 },
    created_at: 122.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Datadog",
    severity: "critical",
    status: "grouped",
    fingerprint: "meraki:datadog:ws_sync_drops_high",
    message: "Datadog APM: Meraki WebSocket sync connection drops breached 15% threshold across European enterprise access points.",
    metadata: { metric: "meraki.cloud_sync.ws_drop_rate", drop_pct: 16.4, threshold_pct: 15.0, nodes_affected: 14000 },
    created_at: 120.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "ThousandEyes",
    severity: "critical",
    status: "grouped",
    fingerprint: "meraki:thousandeyes:ssl_negotiation_timeout",
    message: "ThousandEyes Synthetic Probe: Meraki Dashboard SSL negotiation timeout from London, Frankfurt, and Dublin test agents.",
    metadata: { test_name: "Meraki Cloud Sync SSL", agents: ["London", "Frankfurt", "Dublin"], timeout_sec: 10 },
    created_at: 118.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Kubernetes Event",
    severity: "warning",
    status: "grouped",
    fingerprint: "meraki:k8s:envoy_tls_resets",
    message: "Kubernetes Event: Envoy proxy daemonset pod container `envoy-ingress` logged 850 TLS handshake resets/sec.",
    metadata: { daemonset: "envoy-proxy", resets_per_sec: 850, namespace: "meraki-sync" },
    created_at: 115.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "AWS CloudWatch",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "meraki:aws:alb_502_spike",
    message: "CloudWatch Alarm: ApplicationELB HTTP 502 Bad Gateway responses spiked to 2,100 per minute on Meraki sync ingress.",
    metadata: { alb: "app/meraki-cloud-alb/48a032d", metric: "HTTPCode_Target_502_Count", value: 2100, threshold: 500 },
    created_at: 112.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "meraki:datadog:tcp_syn_retransmit",
    message: "Datadog Network: Outbound TCP SYN retransmits rose on port 8443 between edge proxies and dashboard master.",
    metadata: { destination_port: 8443, syn_retransmits: 1420, threshold: 200 },
    created_at: 110.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Cisco Catalyst Center",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "meraki:catalyst:device_cloud_warning",
    message: "Catalyst Center Device Health: 8,400 Cisco Meraki MR/MS nodes transitioned to 'Cloud Connectivity Warning' state.",
    metadata: { device_family: "MR/MS", impacted_count: 8400, event: "CloudSyncDisconnect" },
    created_at: 108.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Kubernetes Event",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "meraki:k8s:cert_manager_renewal_reload_pending",
    message: "Kubernetes Event: cert-manager Certificate `meraki-sync-wildcard-tls` renewal succeeded but daemonset reload was pending.",
    metadata: { certificate: "meraki-sync-wildcard-tls", secret: "meraki-tls-secret", action_required: "pod_restart" },
    created_at: 105.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Datadog",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "meraki:datadog:reconnect_backlog_clearing",
    message: "Datadog APM: Reconnection backlog clearing after Envoy daemonset rollout restart executed.",
    metadata: { active_reconnections_per_sec: 2400, drain_time_est_sec: 45 },
    created_at: 98.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    source: "Cisco Catalyst Center",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "meraki:catalyst:handshake_error_zero",
    message: "Catalyst Center Assurance: Cloud sync TLS handshake error rate dropped to 0.00% across all EU nodes.",
    metadata: { verified_nodes: 14000, error_rate_pct: 0.00, status: "healthy" },
    created_at: 94.minutes.ago
  },
  {
    service: meraki_service,
    incident: nil,
    source: "AWS CloudWatch",
    severity: "info",
    status: "unprocessed",
    fingerprint: "meraki:aws:s3_telemetry_throughput",
    message: "CloudWatch Metric: S3 telemetry bucket `cisco-meraki-telemetry-archive` write throughput at 480 MB/s.",
    metadata: { bucket: "cisco-meraki-telemetry-archive", throughput_mb_s: 480 },
    created_at: 45.minutes.ago
  },
  {
    service: meraki_service,
    incident: nil,
    source: "Datadog",
    severity: "info",
    status: "unprocessed",
    fingerprint: "meraki:datadog:config_push_latency_nominal",
    message: "Datadog APM: Meraki dashboard configuration push latency steady at 38ms (P95).",
    metadata: { metric: "meraki.config_push.p95_ms", value: 38, target: 50 },
    created_at: 12.minutes.ago
  },

  # --- Service 4: AppDynamics Ingestion Pipeline (11 alerts: 0 grouped, 4 suppressed, 7 unprocessed) ---
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Datadog",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "appdynamics:datadog:kafka_consumer_lag",
    message: "Datadog Metrics: Kafka consumer lag on partition `telemetry-raw-events-14` exceeded 180,000 uncommitted messages.",
    metadata: { topic: "telemetry-raw-events", partition: 14, consumer_group: "appd-indexer-group", lag_messages: 182400, threshold: 100000 },
    created_at: 18.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Kubernetes Event",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "appdynamics:k8s:jvm_gc_pause_high",
    message: "Kubernetes Event: JVM Old Generation garbage collection pause exceeded 1,850ms on indexer worker `appd-worker-8b`.",
    metadata: { pod: "appd-worker-8b-49f2", jvm_gc: "G1 Old Generation", pause_ms: 1850, threshold_ms: 1000 },
    created_at: 16.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "AWS CloudWatch",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "appdynamics:aws:msk_broker_storage_warning",
    message: "CloudWatch Alarm: Amazon MSK cluster `appd-kafka-prod` storage utilization reached 78% on broker 3.",
    metadata: { cluster: "appd-kafka-prod", broker_id: "b-3", disk_utilization_pct: 78.4, threshold_pct: 75.0 },
    created_at: 15.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Cisco Catalyst Center",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "appdynamics:catalyst:backpressure_fabric_port",
    message: "Catalyst Center Assurance: Network backpressure detected on ingestion aggregation switch fabric port 10/1.",
    metadata: { fabric_switch: "cat9500-agg-01", port: "TenGigE10/1", pause_frames_per_sec: 320 },
    created_at: 14.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "appdynamics:datadog:batch_throughput_rebalance_drop",
    message: "Datadog APM: Telemetry batch ingestion throughput dropped by 14% during Kafka broker rebalance.",
    metadata: { current_rate_events_sec: 145000, nominal_rate: 170000, drop_pct: 14.7 },
    created_at: 12.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "ThousandEyes",
    severity: "info",
    status: "unprocessed",
    fingerprint: "appdynamics:thousandeyes:otel_collector_latency",
    message: "ThousandEyes API Probe: OpenTelemetry Collector HTTP ingestion endpoint responding in 18ms from North America nodes.",
    metadata: { endpoint: "https://ingest.appd.cisco.com/v1/traces", http_status: 200, rtt_ms: 18 },
    created_at: 11.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Kubernetes Event",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "appdynamics:k8s:jvm_heap_recovered",
    message: "Kubernetes Event: Pod `appd-worker-8b-49f2` completed full JVM GC cycle and returned heap utilization to 54%.",
    metadata: { pod: "appd-worker-8b-49f2", heap_used_pct: 54.1 },
    created_at: 9.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "AWS CloudWatch",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "appdynamics:aws:asg_scale_out",
    message: "CloudWatch Metric: AutoScalingGroup `appd-indexer-asg` successfully launched 2 additional instances.",
    metadata: { asg: "appd-indexer-asg", desired_capacity: 14, current_capacity: 14 },
    created_at: 8.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Cisco Catalyst Center",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "appdynamics:catalyst:fabric_buffer_cleared",
    message: "Catalyst Center Assurance: Ingestion fabric port 10/1 pause frames ceased after buffer flush.",
    metadata: { fabric_switch: "cat9500-agg-01", port: "TenGigE10/1", pause_frames_per_sec: 0 },
    created_at: 6.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Datadog",
    severity: "info",
    status: "unprocessed",
    fingerprint: "appdynamics:datadog:pipeline_indexing_rate",
    message: "Datadog APM: AppDynamics APM telemetry pipeline indexing 1.2M metrics/sec across Fortune 500 tenants.",
    metadata: { ingestion_rate_eps: 1200000, active_tenants: 480, status: "healthy" },
    created_at: 5.minutes.ago
  },
  {
    service: services["appdynamics-ingestion"],
    incident: nil,
    source: "Kubernetes Event",
    severity: "info",
    status: "unprocessed",
    fingerprint: "appdynamics:k8s:elastic_index_rollover",
    message: "Kubernetes Event: Elasticsearch cluster index rollover policy executed cleanly for `appd-telemetry-2026.10.18`.",
    metadata: { index: "appd-telemetry-2026.10.18", shards: 24, doc_count: 89000000 },
    created_at: 2.minutes.ago
  },

  # --- Service 5: Smart Licensing API (10 alerts: 0 grouped, 3 suppressed, 7 unprocessed) ---
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Datadog",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "licensing:datadog:pg_connection_pool_high",
    message: "Datadog Database Monitoring: PostgreSQL connection pool utilization reached 84% on licensing primary replica.",
    metadata: { db_instance: "smart-licensing-aurora-pg-01", active_connections: 168, max_connections: 200, utilization_pct: 84.0 },
    created_at: 28.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "AWS CloudWatch",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "licensing:aws:aurora_replica_lag",
    message: "CloudWatch Alarm: AuroraReplicaLag elevated to 420ms on `smart-licensing-ro-02` during quarterly enterprise sync.",
    metadata: { db_identifier: "smart-licensing-ro-02", lag_ms: 420, threshold_ms: 300 },
    created_at: 25.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Cisco Catalyst Center",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "licensing:catalyst:token_sync_retries",
    message: "Catalyst Center Licensing Agent: Entitlement token sync retry rate rose to 6.2% on regional Cisco hardware gateways.",
    metadata: { agent_cohort: "NorthAmerica-Enterprise", retry_pct: 6.2, threshold_pct: 5.0 },
    created_at: 22.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Kubernetes Event",
    severity: "warning",
    status: "unprocessed",
    fingerprint: "licensing:k8s:ingress_rate_limit_applied",
    message: "Kubernetes Event: Ingress Nginx rate-limiting throttled 42 rogue API clients requesting duplicate entitlement certs.",
    metadata: { ingress: "smart-licensing-ingress", rate_limit_rps: 50, dropped_requests: 42 },
    created_at: 20.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Datadog",
    severity: "warning",
    status: "suppressed_noise",
    fingerprint: "licensing:datadog:sql_query_duration_spike",
    message: "Datadog APM: Transient SQL query execution time spike (P99 = 480ms) on `entitlements_v2` index scan.",
    metadata: { query: "SELECT * FROM entitlements WHERE org_id = ?", p99_ms: 480, normal_p99_ms: 25 },
    created_at: 18.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "ThousandEyes",
    severity: "info",
    status: "unprocessed",
    fingerprint: "licensing:thousandeyes:token_endpoint_latency",
    message: "ThousandEyes API Probe: Global Smart Licensing token issuance endpoint latency 48ms (target < 100ms).",
    metadata: { endpoint: "https://smartlicensing.cisco.com/api/v2/tokens", rtt_ms: 48, status: 200 },
    created_at: 15.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "AWS CloudWatch",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "licensing:aws:aurora_replica_lag_cleared",
    message: "CloudWatch Metric: Aurora read replica `smart-licensing-ro-02` replication lag recovered to 14ms.",
    metadata: { db_identifier: "smart-licensing-ro-02", lag_ms: 14 },
    created_at: 12.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Cisco Catalyst Center",
    severity: "info",
    status: "suppressed_noise",
    fingerprint: "licensing:catalyst:token_cache_refreshed",
    message: "Catalyst Center Assurance: Enterprise entitlement token cache refresh completed across 2,400 switches.",
    metadata: { switches_synced: 2400, failure_count: 0 },
    created_at: 10.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Kubernetes Event",
    severity: "info",
    status: "unprocessed",
    fingerprint: "licensing:k8s:pod_healthy_after_restart",
    message: "Kubernetes Event: Pod `smart-licensing-api-6f987` healthy after rolling restart.",
    metadata: { pod: "smart-licensing-api-6f987-9jk2l", readiness: true },
    created_at: 5.minutes.ago
  },
  {
    service: services["smart-licensing-api"],
    incident: nil,
    source: "Datadog",
    severity: "info",
    status: "unprocessed",
    fingerprint: "licensing:datadog:token_verification_success_rate",
    message: "Datadog APM: 99.99% successful token verification rate across 3.5 million registered Cisco enterprise devices.",
    metadata: { total_devices: 3500000, success_rate_pct: 99.99, window: "24h" },
    created_at: 1.minute.ago
  }
]

alerts_data.each do |attrs|
  Alert.create!(attrs)
end

puts "Created #{Alert.count} Alerts (#{Alert.grouped.count} grouped, #{Alert.suppressed.count} suppressed, #{Alert.unprocessed.count} unprocessed)"

# 6. Initial Status Updates for Public Status Page (status.cisco.com)
puts "== Seeding Initial Status Updates (4 records) =="

status_updates_data = [
  {
    service: duo_service,
    incident: inc1,
    title: "Investigating Elevated Latency and MFA Verification Failures",
    body: "PulseGuard telemetry has detected high latency and authentication timeouts across the Cisco Duo Auth Gateway cluster in us-west-2. SRE responders are actively investigating Redis connection saturation. Automated diagnostic runbooks are engaged.",
    status_type: "investigating",
    published_by: "Alex Rivera (Principal SRE)",
    published_at: 5.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    title: "Identified Packet Loss on Frankfurt PoP Media Streams",
    body: "Network operations has identified BGP route flapping upstream of the Frankfurt IXP impacting RTP audio/video streams. Traffic is being actively drained and redirected through Amsterdam IX edge routers. Customers in Western Europe may observe transient jitter.",
    status_type: "identified",
    published_by: "Elena Rostova (Staff Platform Eng)",
    published_at: 18.minutes.ago
  },
  {
    service: webex_service,
    incident: inc2,
    title: "Monitoring RTP Stream Stability Post-Reroute",
    body: "SD-WAN reroute to Amsterdam IX has completed successfully. ThousandEyes synthetic probe latency has decreased to 42ms. Operations team is monitoring jitter buffers before declaring full resolution.",
    status_type: "monitoring",
    published_by: "Elena Rostova (Staff Platform Eng)",
    published_at: 8.minutes.ago
  },
  {
    service: meraki_service,
    incident: inc3,
    title: "Resolved: Cloud Sync WebSocket TLS Handshake Drops Restored",
    body: "The TLS certificate bundle on edge Envoy ingress proxies has been refreshed and validated. All 14,000 active Meraki dashboard cloud sync nodes have reconnected. WebSocket connection drop rate is at 0.00%. Service is operating normally.",
    status_type: "resolved",
    published_by: "Sarah Chen (VP of Infrastructure)",
    published_at: 95.minutes.ago
  }
]

status_updates_data.each do |attrs|
  StatusUpdate.create!(attrs)
end

puts "Created #{StatusUpdate.count} StatusUpdates"
puts "== Seed complete: #{Service.count} Services, #{Incident.count} Incidents, #{IncidentEvent.count} Events, #{Postmortem.count} Postmortem, #{Alert.count} Alerts, #{StatusUpdate.count} StatusUpdates =="

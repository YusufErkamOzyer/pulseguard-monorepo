# frozen_string_literal: true

module Aiops
  class AlertStormSimulatorService
    DEFAULT_BURST_SIZE = 30

    def self.call(service_slug: nil, service_id: nil, incident_id: nil, burst_size: DEFAULT_BURST_SIZE, create_fresh: false)
      new(service_slug: service_slug, service_id: service_id, incident_id: incident_id, burst_size: burst_size, create_fresh: create_fresh).call
    end

    def initialize(service_slug: nil, service_id: nil, incident_id: nil, burst_size: DEFAULT_BURST_SIZE, create_fresh: false)
      @service_slug = service_slug
      @service_id = service_id
      @incident_id = incident_id
      @burst_size = burst_size.to_i.positive? ? burst_size.to_i : DEFAULT_BURST_SIZE
      @create_fresh = create_fresh
    end

    def call
      initial_service = resolve_service
      raise ActiveRecord::RecordNotFound, "Target service not found" unless initial_service

      ActiveRecord::Base.transaction do
        raw_templates = prepare_alert_templates(initial_service)

        # AI analyzes the raw logs to detect which service has the root failure
        triage_info = Ai::LogTriageService.call(
          raw_alerts: raw_templates,
          services: Service.all.to_a,
          preferred_service: initial_service
        )

        detected_service = Service.find_by(slug: triage_info["detected_service_slug"]) || initial_service

        incident = resolve_or_create_incident(detected_service, triage_info)

        created_alerts = raw_templates.map do |attrs|
          Alert.create!(attrs.merge(service: detected_service, incident: incident))
        end

        grouped_count = created_alerts.count(&:grouped?)
        suppressed_count = created_alerts.count(&:suppressed?)
        total_burst = created_alerts.size

        noise_ratio = total_burst.positive? ? (suppressed_count.to_f / total_burst).round(3) : 0.0
        noise_pct = total_burst.positive? ? ((suppressed_count.to_f / total_burst) * 100).round(1) : 0.0

        actor_label = triage_info["mode"] == "live_gemini" ? (triage_info["model"] || "Live Gemini") : "AI Engine"
        incident.incident_events.create!(
          actor: "PulseGuard AIOps Engine (#{actor_label})",
          action_type: "aiops_alert_storm",
          detail: "⚡ #{total_burst} ham log akışı tarandı. AI arızalı servisin '#{detected_service.name}' olduğunu tespit etti (#{grouped_count} kök sinyal gruplandı, #{suppressed_count} gürültü bastırıldı — %#{noise_pct})."
        )

        {
          success: true,
          service: detected_service,
          incident: incident.reload,
          storm_summary: {
            raw_alerts_ingested: total_burst,
            suppressed_count: suppressed_count,
            grouped_count: grouped_count,
            noise_reduction_ratio: noise_ratio,
            noise_reduction_percentage: noise_pct,
            detected_service_name: detected_service.name,
            detected_service_slug: detected_service.slug,
            detection_reasoning: triage_info["detection_reasoning"],
            ai_mode: triage_info["mode"],
            ai_model: triage_info["model"]
          },
          alerts: created_alerts
        }
      end
    end

    private

    def resolve_service
      if @service_id.present?
        Service.find_by(id: @service_id)
      elsif @service_slug.present? && @service_slug != "auto"
        Service.find_by(slug: @service_slug)
      else
        # Auto/random rotation across services when triggered in auto mode
        Service.order(Arel.sql("RANDOM()")).first ||
          Service.find_by(slug: "cisco-duo-auth") ||
          Service.first
      end
    end

    def resolve_or_create_incident(service, triage_info = {})
      if @incident_id.present?
        inc = service.incidents.find_by(id: @incident_id)
        return inc if inc
      end

      # Reuse active incident if present and not create_fresh
      unless @create_fresh
        active_inc = service.incidents.active.order(created_at: :desc).first
        return active_inc if active_inc
      end

      title = triage_info["incident_title"].presence || case service.slug.to_s
              when /duo/
                "Alert Storm: Duo Auth Gateway Redis Connection Saturation & MFA Failures"
              when /webex/
                "Alert Storm: Webex Frankfurt Media Router Packet Loss & BGP Route Flap"
              when /meraki/
                "Alert Storm: Meraki Edge Proxy TLS Handshake Degradation"
              when /appdynamics/
                "Alert Storm: AppDynamics Kafka Event Stream Backpressure"
              when /licensing/
                "Alert Storm: Smart Licensing Token Verification Latency Spike"
              else
                "Alert Storm: #{service.name} High-Volume Telemetry Cascade"
              end

      error_sig = case service.slug.to_s
                  when /duo/
                    <<~TRACE.strip
                      Redis::CannotConnectError: Connection pool exhausted (max 500 connections reached).
                      at /app/vendor/bundle/ruby/gems/redis-client-0.19.0/lib/redis_client/connection_pool.rb:64:in `checkout'
                      at /app/services/auth/duo_token_verifier.rb:142:in `verify_mfa_session'
                      Client pool timeout: 5000ms exceeded. Active clients: 500/500, Waiting threads: 142.
                    TRACE
                  when /webex/
                    <<~TRACE.strip
                      SDWAN-RTP-WARN: Jitter buffer overflow on edge interface ge0/0/2. Frankfurt-IXP latency = 384ms (SLA threshold: 120ms).
                      Packet drop rate: 4.8% on UDP audio stream cohort 44-A. ThousandEyes BGP flap alert triggered.
                    TRACE
                  when /meraki/
                    <<~TRACE.strip
                      EnvoyTLSHandshakeError: Peer certificate verification failed (X509_V_ERR_CERT_HAS_EXPIRED).
                      Remote cluster: meraki-dashboard-sync-europe.internal:8443.
                      Failed connections: 3,410 handshakes terminated in last 60s across enterprise switches.
                    TRACE
                  when /appdynamics/
                    <<~TRACE.strip
                      Kafka::ConsumerLagSpike: Partition 14 lag exceeded 1,200,000 messages.
                      Memory pressure on worker pods: 98.4% RSS. Worker thread starvation on cisco-appd-ingest-03.
                    TRACE
                  when /licensing/
                    <<~TRACE.strip
                      SmartLicensing::TokenTimeout: HMAC verification token pipeline timeout (>4500ms).
                      TLS handshake backpressure on vault-auth-gateway-internal:8200. 1,840 pending licensing requests queued.
                    TRACE
                  else
                    "AIOps Storm Ingestion: Cascading telemetry burst detected across 5 monitoring layers for #{service.name}. Root cause isolation active."
                  end

      new_incident = service.incidents.create!(
        title: title,
        severity: triage_info["severity"].presence || "SEV-1",
        status: "triggered",
        error_signature: error_sig,
        assigned_to: "Unassigned (Waiting for Engineer)"
      )

      service.update!(status: "outage")

      new_incident.incident_events.create!(
        actor: "PulseGuard AI Service Detector",
        action_type: "triggered",
        detail: "🔍 AI arızanın '#{service.name}' servisinde olduğunu tespit etti ve olayı kuyruğa ekledi: #{triage_info['detection_reasoning']}"
      )

      # Synthesize AI pass (error interpretation, engineer guidance, solution & notification)
      pass = Ai::IncidentPassGeneratorService.call(new_incident)
      pass["service_detection_reasoning"] = triage_info["detection_reasoning"]
      pass["detected_service_name"] = service.name
      pass["log_triage_mode"] = triage_info["mode"]
      new_incident.update!(ai_triage_pass: pass)

      pass_actor_label = pass["mode"] == "live_gemini" ? (pass["model"] || "Live Gemini") : "AI Engine"
      new_incident.incident_events.create!(
        actor: "PulseGuard AI Triage (#{pass_actor_label})",
        action_type: "ai_analyzed",
        detail: "🤖 AI hatayı yorumladı, çözüm komutunu hazırladı ve nöbetçi mühendise (#{pass['recommended_assignee']}) bildirim gönderdi."
      )

      new_incident
    end

    def prepare_alert_templates(service)
      ts = Time.current.to_i
      slug = service.slug
      name = service.name

      templates = build_templates(slug, name, ts)

      if @burst_size <= templates.size
        templates.first(@burst_size)
      else
        extra_count = @burst_size - templates.size
        extras = (1..extra_count).map do |i|
          src = Alert::SOURCES[i % Alert::SOURCES.size]
          {
            source: src,
            severity: i % 3 == 0 ? "warning" : "info",
            status: "suppressed_noise",
            fingerprint: "#{slug}:k8s:synthetic_cascade_probe_#{ts}_#{i}_#{SecureRandom.hex(3)}",
            message: "Kubernetes Event: Diagnostic synthetic probe container exited with code 0 on node worker-#{i}.",
            metadata: { worker_index: i, auto_suppressed: true }
          }
        end
        templates + extras
      end
    end

    def build_templates(slug, name, ts)
      if slug.to_s.include?("webex")
        webex_templates(name, ts)
      else
        duo_templates(name, ts)
      end
    end

    def duo_templates(name, ts)
      [
        # --- 2 PRIMARY SIGNALS (GROUPED) ---
        {
          source: "Datadog",
          severity: "critical",
          status: "grouped",
          fingerprint: "cisco-duo:redis:pool_exhausted:#{ts}:#{SecureRandom.hex(4)}",
          message: "CRITICAL: Redis connection pool exhausted on #{name} (500/500 connections active, client pool timeout 5000ms exceeded).",
          metadata: { cluster: "duo-auth-prod-uswest2", active_connections: 500, max_connections: 500, pool_timeout_ms: 5000, waiting_threads: 142 }
        },
        {
          source: "Cisco Catalyst Center",
          severity: "critical",
          status: "grouped",
          fingerprint: "cisco-duo:catalyst:p99_latency_breach:#{ts}:#{SecureRandom.hex(4)}",
          message: "CRITICAL: Authentication latency breach on #{name} — P99 latency measured at 4850ms (SLO threshold: 250ms).",
          metadata: { p99_latency_ms: 4850, slo_threshold_ms: 250, affected_session_rate_rps: 1450, zone: "us-west-2a" }
        },

        # --- 28 CASCADING NOISE SIGNALS (SUPPRESSED_NOISE) ---
        {
          source: "Kubernetes Event",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:readiness_fail_1:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-api-7b89f Readiness probe failed: HTTP 503 Service Unavailable.",
          metadata: { pod: "duo-auth-api-7b89f", probe: "readiness", http_code: 503 }
        },
        {
          source: "Kubernetes Event",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:readiness_fail_2:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-api-8c12a Readiness probe failed: HTTP 503 Service Unavailable.",
          metadata: { pod: "duo-auth-api-8c12a", probe: "readiness", http_code: 503 }
        },
        {
          source: "Kubernetes Event",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:backoff_restart:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-worker-4d55e Back-off restarting failed container duo-mfa-engine.",
          metadata: { pod: "duo-auth-worker-4d55e", restart_count: 4 }
        },
        {
          source: "ThousandEyes",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:thousandeyes:probe_chicago:#{ts}:#{SecureRandom.hex(4)}",
          message: "ThousandEyes Alert: Synthetic HTTP check failed from Chicago branch to Duo Auth VIP (HTTP 504 Gateway Timeout).",
          metadata: { branch: "Chicago-Branch-01", target: "https://auth.duo.cisco.com", http_code: 504 }
        },
        {
          source: "ThousandEyes",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:thousandeyes:probe_nyc:#{ts}:#{SecureRandom.hex(4)}",
          message: "ThousandEyes Alert: Synthetic HTTP check failed from New York branch to Duo Auth VIP (HTTP 504 Gateway Timeout).",
          metadata: { branch: "NYC-Regional-HQ", target: "https://auth.duo.cisco.com", http_code: 504 }
        },
        {
          source: "ThousandEyes",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:thousandeyes:probe_london:#{ts}:#{SecureRandom.hex(4)}",
          message: "ThousandEyes Diagnostic: Synthetic latency probe from London HQ to Duo Auth VIP measured 2940ms.",
          metadata: { branch: "London-Office", rtt_ms: 2940 }
        },
        {
          source: "AWS CloudWatch",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:cw:alb_target_response_time:#{ts}:#{SecureRandom.hex(4)}",
          message: "CloudWatch Metric: ALB TargetResponseTime breached 3000ms on duo-auth-alb-uswest2.",
          metadata: { metric: "TargetResponseTime", value_ms: 3240, threshold_ms: 3000 }
        },
        {
          source: "AWS CloudWatch",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:cw:alb_5xx_count:#{ts}:#{SecureRandom.hex(4)}",
          message: "CloudWatch Alarm: HTTPCode_Target_5XX_Count elevated to 320 requests/min on duo-auth-alb-uswest2.",
          metadata: { metric: "HTTPCode_Target_5XX_Count", value: 320, window: "1m" }
        },
        {
          source: "AWS CloudWatch",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:cw:nlb_surge_queue:#{ts}:#{SecureRandom.hex(4)}",
          message: "CloudWatch Metric: SurgeQueueLength peaked at 1024 on duo-auth-nlb.",
          metadata: { metric: "SurgeQueueLength", value: 1024 }
        },
        {
          source: "Datadog",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:mfa_error_rate:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog APM: duo.auth.verify_mfa trace error rate rose to 42.8% over 3-minute window.",
          metadata: { service: "duo-auth", error_rate_pct: 42.8 }
        },
        {
          source: "Datadog",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:redis_client_timeouts:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog APM: duo.session.cache_lookup redis_client.timeout exceptions at 88/sec.",
          metadata: { exceptions_per_sec: 88, error: "RedisClient::TimeoutError" }
        },
        {
          source: "Datadog",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:p95_trace_duration:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog Trace: duo.token.validate elevated duration: p95=3200ms across 12 pods.",
          metadata: { p95_ms: 3200, pod_count: 12 }
        },
        {
          source: "Cisco Catalyst Center",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:catalyst:client_health:#{ts}:#{SecureRandom.hex(4)}",
          message: "Catalyst Assurance: Client health score dropped to 41% for Duo Authenticator SSID profile.",
          metadata: { health_score_pct: 41, profile: "Duo-Corp-WiFi" }
        },
        {
          source: "Cisco Catalyst Center",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:catalyst:tcp_retrans:#{ts}:#{SecureRandom.hex(4)}",
          message: "Catalyst Center: Network telemetry reports high TCP retransmission (4.8%) to Duo VIP.",
          metadata: { tcp_retransmission_pct: 4.8 }
        },
        {
          source: "Kubernetes Event",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:oom_killed:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-api-1a23b OOMKilled detected during thread pool spike.",
          metadata: { pod: "duo-auth-api-1a23b", reason: "OOMKilled", exit_code: 137 }
        },
        {
          source: "Kubernetes Event",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:hpa_scale:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: HorizontalPodAutoscaler duo-auth-hpa triggered scale from 8 to 16 pods.",
          metadata: { hpa: "duo-auth-hpa", from_pods: 8, to_pods: 16 }
        },
        {
          source: "Kubernetes Event",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:pod_scheduled:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-api-9f34c Scheduled to node ip-10-0-4-12.ec2.internal.",
          metadata: { pod: "duo-auth-api-9f34c", node: "ip-10-0-4-12.ec2.internal" }
        },
        {
          source: "ThousandEyes",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:thousandeyes:bgp_flap:#{ts}:#{SecureRandom.hex(4)}",
          message: "ThousandEyes BGP: Routing path fluctuation observed on AS2914 towards Duo auth ingress.",
          metadata: { asn: 2914, path_change_count: 8 }
        },
        {
          source: "AWS CloudWatch",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:cw:redis_cpu:#{ts}:#{SecureRandom.hex(4)}",
          message: "CloudWatch Metric: duo-auth-redis CPUUtilization spiked to 92.4% on primary replica.",
          metadata: { instance: "duo-auth-redis-01", cpu_pct: 92.4 }
        },
        {
          source: "Datadog",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:push_retry:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog Metric: auth.duo.push_notification delivery retry count reached 620/min.",
          metadata: { retry_count_per_min: 620 }
        },
        {
          source: "Datadog",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:tls_reneg:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog Log: duo-auth-gateway TLS renegotiation flood detected from corporate proxies.",
          metadata: { renegotiation_count: 1420 }
        },
        {
          source: "Cisco Catalyst Center",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:catalyst:radius_failover:#{ts}:#{SecureRandom.hex(4)}",
          message: "Catalyst Assurance: AAA RADIUS server failover triggered on campus switch edge-sw-04.",
          metadata: { switch: "edge-sw-04", event: "RADIUS_FAILOVER" }
        },
        {
          source: "Cisco Catalyst Center",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:catalyst:bypass_fallback:#{ts}:#{SecureRandom.hex(4)}",
          message: "Catalyst Assurance: Authentication bypass secondary fallback engaged for IP Phone fleet.",
          metadata: { fleet: "Cisco-IP-Phones", status: "bypass_engaged" }
        },
        {
          source: "Kubernetes Event",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:pulling_image:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Pod duo-auth-api-6d78e Pulling container image cisco/duo-auth-gateway:v2.14.",
          metadata: { image: "cisco/duo-auth-gateway:v2.14" }
        },
        {
          source: "AWS CloudWatch",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:cw:unhealthy_hosts:#{ts}:#{SecureRandom.hex(4)}",
          message: "CloudWatch Alarm: UnHealthyHostCount reached 4 of 12 targets on duo-auth-tg.",
          metadata: { unhealthy_hosts: 4, total_hosts: 12 }
        },
        {
          source: "ThousandEyes",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:thousandeyes:packet_loss:#{ts}:#{SecureRandom.hex(4)}",
          message: "ThousandEyes Diagnostic: Packet loss to Duo Auth US-West gateway reached 6.2%.",
          metadata: { loss_pct: 6.2, target: "us-west-gw" }
        },
        {
          source: "Datadog",
          severity: "warning",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:dd:idp_timeout:#{ts}:#{SecureRandom.hex(4)}",
          message: "Datadog APM: Outbound connection timeout to Cisco Duo Identity Provider gateway.",
          metadata: { endpoint: "idp.cisco.com/oauth2/token", timeout_ms: 10000 }
        },
        {
          source: "Kubernetes Event",
          severity: "info",
          status: "suppressed_noise",
          fingerprint: "cisco-duo:k8s:memory_pressure:#{ts}:#{SecureRandom.hex(4)}",
          message: "Kubernetes Event: Node ip-10-0-4-12.ec2.internal MemoryPressure condition true.",
          metadata: { node: "ip-10-0-4-12.ec2.internal", condition: "MemoryPressure" }
        }
      ]
    end

    def webex_templates(name, ts)
      [
        # --- 2 PRIMARY SIGNALS (GROUPED) ---
        {
          source: "Cisco Catalyst Center",
          severity: "critical",
          status: "grouped",
          fingerprint: "webex:catalyst:bgp_flap:#{ts}:#{SecureRandom.hex(4)}",
          message: "CRITICAL: BGP route flap and AS-path hunting on #{name} at Frankfurt IXP (DE-CIX peering link).",
          metadata: { ixp: "DE-CIX Frankfurt", peer_as: 64512, flaps_per_min: 14 }
        },
        {
          source: "ThousandEyes",
          severity: "critical",
          status: "grouped",
          fingerprint: "webex:thousandeyes:rtp_packet_loss:#{ts}:#{SecureRandom.hex(4)}",
          message: "CRITICAL: RTP UDP media packet loss surged to 28.4% across European media relays on #{name}.",
          metadata: { packet_loss_pct: 28.4, slo_threshold_pct: 1.0, stream_type: "audio/video" }
        },

        # --- 28 CASCADING NOISE SIGNALS (SUPPRESSED_NOISE) ---
        *(1..28).map do |i|
          source = Alert::SOURCES[i % Alert::SOURCES.size]
          severity = i % 4 == 0 ? "warning" : "info"
          {
            source: source,
            severity: severity,
            status: "suppressed_noise",
            fingerprint: "webex:cascade:#{source.parameterize}:#{ts}:#{i}:#{SecureRandom.hex(3)}",
            message: "Cascade Telemetry ##{i}: Telemetry deviation detected on Webex RTP node relay-eu-#{i} (#{source}).",
            metadata: { cascade_index: i, relay: "relay-eu-#{i}", source: source }
          }
        end
      ]
    end
  end
end

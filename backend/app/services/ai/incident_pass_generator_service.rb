require "net/http"
require "json"
require "uri"

module Ai
  class IncidentPassGeneratorService
    GEMINI_MODEL = "gemini-2.5-flash".freeze
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/#{GEMINI_MODEL}:generateContent".freeze

    def self.call(incident)
      new(incident).call
    end

    def initialize(incident)
      @incident = incident
      @api_key = ENV["GEMINI_API_KEY"]
    end

    def call
      if @api_key.present?
        gemini_result = call_gemini
        return gemini_result if gemini_result.present?
      end

      deterministic_pass
    rescue StandardError => e
      Rails.logger.error("[Ai::IncidentPassGeneratorService] Gemini failed: #{e.class} - #{e.message}")
      deterministic_pass
    end

    private

    def call_gemini
      uri = URI("#{GEMINI_API_URL}?key=#{@api_key}")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"

      prompt = <<~PROMPT
        You are Cisco Cloud Operations AI Triage Engine for PulseGuard.
        Analyze this active infrastructure incident and generate an ACTIONABLE REMEDIATION PASS (Kullanılabilir Pas).

        Incident Details:
        - Title: #{@incident.title}
        - Service: #{@incident.service&.name} (Tier: #{@incident.service&.tier})
        - Severity: #{@incident.severity}
        - Error Signature:
        #{@incident.error_signature.presence || "No stacktrace provided"}

        Return a single STRICT JSON object (no markdown code fences, no extra text) with EXACTLY these keys:
        {
          "root_cause_hypothesis": "1-2 sentence precise technical root cause",
          "confidence_score": integer between 85 and 99,
          "matched_historical_incident": "Incident ID and historical context (e.g. INC-2025-08-442: Duo Redis Contention)",
          "suggested_runbook_command": "Executable CLI/kubectl/cisco-ctl command string to remediate",
          "draft_status_update": "1-sentence executive status update suitable for status page or PagerDuty bridge",
          "recommended_assignee": "Name of best suited on-call engineer or SRE",
          "estimated_time_saved_minutes": integer between 12 and 35,
          "one_click_ready": true
        }
      PROMPT

      request.body = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      }.to_json

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 5
      http.read_timeout = 8

      response = http.request(request)
      return nil unless response.is_a?(Net::HTTPSuccess)

      parsed_body = JSON.parse(response.body)
      text = parsed_body.dig("candidates", 0, "content", "parts", 0, "text")
      return nil if text.blank?

      # Sanitize markdown code fences if Gemini included them
      clean_json = text.strip
      clean_json = clean_json.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/i, "").strip

      parsed_pass = JSON.parse(clean_json)
      parsed_pass.merge(
        "mode" => "live_gemini",
        "model" => GEMINI_MODEL,
        "generated_at" => Time.current.iso8601
      )
    rescue StandardError => e
      Rails.logger.warn("[Ai::IncidentPassGeneratorService] Gemini parsing fallback: #{e.message}")
      nil
    end

    def deterministic_pass
      sig = (@incident.error_signature.to_s + " " + @incident.title.to_s).downcase
      svc_name = @incident.service&.name || "Cisco Core Service"
      assignee = @incident.service&.on_call_engineer || "Alex Rivera (Principal SRE)"

      if sig.include?("redis") || sig.include?("pool") || sig.include?("duo")
        {
          "root_cause_hypothesis" => "Redis connection pool exhaustion across Duo Auth clusters due to leaked idle connections under burst MFA traffic.",
          "confidence_score" => 96,
          "matched_historical_incident" => "INC-2025-08-442 (Cisco Duo Redis Pool Contention)",
          "suggested_runbook_command" => "kubectl scale deployment/cisco-duo-auth --replicas=12 && redis-cli -h auth-cluster.internal CLIENT KILL TYPE normal",
          "draft_status_update" => "Investigating elevated latency on Duo Auth Gateway. Automated runbook executed connection pool expansion.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 24,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "generated_at" => Time.current.iso8601
        }
      elsif sig.include?("websocket") || sig.include?("tls") || sig.include?("meraki")
        {
          "root_cause_hypothesis" => "Expired TLS root bundle in Edge Envoy proxy causing TLS handshake termination drop.",
          "confidence_score" => 93,
          "matched_historical_incident" => "INC-2025-11-109 (Meraki Cloud Sync TLS Handshake Failover)",
          "suggested_runbook_command" => "envoy-cli --admin refresh-tls-certs --cluster meraki-sync && kubectl rollout restart ds/envoy-proxy",
          "draft_status_update" => "Mitigated TLS handshake drops across Meraki Cloud Sync. Certificates rotated and connections stabilized.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 19,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "generated_at" => Time.current.iso8601
        }
      elsif sig.include?("latency") || sig.include?("webex") || sig.include?("edge")
        {
          "root_cause_hypothesis" => "BGP route flapping at Frankfurt IXP causing UDP packet drop on Webex RTP streams.",
          "confidence_score" => 91,
          "matched_historical_incident" => "INC-2025-04-301 (Frankfurt Edge Route Flap)",
          "suggested_runbook_command" => "cisco-sdwan-ctl reroute --service webex-media --egress-pref ams-ix --drain fra-ix",
          "draft_status_update" => "Rerouted Webex RTP media traffic through Amsterdam IX to bypass Frankfurt IXP jitter.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 16,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "generated_at" => Time.current.iso8601
        }
      else
        {
          "root_cause_hypothesis" => "Upstream worker thread starvation and thread pool saturation on #{svc_name}.",
          "confidence_score" => 89,
          "matched_historical_incident" => "INC-2025-09-118 (Enterprise Gateway Contention)",
          "suggested_runbook_command" => "kubectl rollout restart deployment/#{@incident.service&.slug || 'service'} -n cisco-prod",
          "draft_status_update" => "Automated triage executed graceful pod restart and memory reclamation on #{svc_name}.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 18,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "generated_at" => Time.current.iso8601
        }
      end
    end
  end
end

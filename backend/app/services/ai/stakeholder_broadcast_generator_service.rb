# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module Ai
  class StakeholderBroadcastGeneratorService
    def self.gemini_model
      Ai::GeminiClient.primary_model
    end

    def self.call(incident_arg = nil, incident: nil, tone: "empathetic", status_type: nil)
      target_incident = incident || incident_arg
      raise ArgumentError, "Incident is required" unless target_incident

      new(incident: target_incident, tone: tone, status_type: status_type).call
    end

    def initialize(incident:, tone: "empathetic", status_type: nil)
      @incident = incident
      @tone = tone.presence || "empathetic"
      @requested_status_type = status_type.presence
      @api_key = ENV["GEMINI_API_KEY"]
    end

    def call
      if @api_key.present?
        gemini_result = call_gemini
        return gemini_result if gemini_result.present?
      end

      deterministic_broadcast
    rescue StandardError => e
      Rails.logger.warn("[Ai::StakeholderBroadcastGeneratorService] Gemini failed (#{e.class}: #{e.message}), falling back to deterministic broadcast.")
      deterministic_broadcast
    end

    private

    def effective_status_type
      if @requested_status_type.present? && StatusUpdate::STATUS_TYPES.include?(@requested_status_type)
        return @requested_status_type
      end

      case @incident.status
      when "resolved"
        "resolved"
      when "acknowledged"
        "identified"
      else
        "investigating"
      end
    end

    def service_name
      @incident.service&.name || "Cisco Core Service"
    end

    def service_slug
      @incident.service&.slug.to_s.downcase
    end

    def call_gemini
      st_type = effective_status_type

      prompt = <<~PROMPT
        You are the Cisco Cloud Communications Operations Director for the public status page (status.cisco.com).
        Draft a clear, empathetic, non-technical, customer-facing status broadcast update in TURKISH for an active incident.

        Incident Context:
        - Incident Title: #{@incident.title}
        - Service: #{service_name} (Tier: #{@incident.service&.tier || 'Tier-1'})
        - Severity: #{@incident.severity}
        - Current Incident State: #{@incident.status}
        - Assigned Engineer Handling Case: #{@incident.assigned_to}
        - Target Broadcast Status Type: #{st_type}
        - Communication Tone: #{@tone}
        - Technical Summary (FOR CONTEXT ONLY - DO NOT EXPOSE RAW DETAILS TO CUSTOMERS):
        #{@incident.error_signature.presence || @incident.title}

        Guidelines:
        1. Write in clear, natural, professional TURKISH for non-technical enterprise customers and IT admins.
        2. Never expose raw stacktraces, database connection strings, internal IP addresses, passwords, or internal hostnames.
        3. Be empathetic, transparent, reassuring, and professional.
        4. State clearly what is happening on #{service_name}, that our engineering team has taken ownership of the case, and what mitigation is underway.
        5. The "title" should be a concise Turkish headline (under 85 characters).
        6. The "body" should be 2 to 3 sentences in clear Turkish.

        Return a single STRICT JSON object with EXACTLY these keys:
        {
          "title": "Kısa ve net Türkçe durum başlığı",
          "body": "Müşteriler için anlaşılır, güven verici 2-3 cümlelik Türkçe durum açıklaması",
          "status_type": "#{st_type}"
        }
      PROMPT

      res = Ai::GeminiClient.generate_content(
        prompt: prompt,
        json_mode: true,
        read_timeout: ENV.fetch("GEMINI_READ_TIMEOUT", "100").to_i,
        api_key: @api_key
      )
      return nil unless res[:success] && res[:text].present?

      # Sanitize markdown code fences
      clean_json = res[:text].strip
      clean_json = clean_json.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/i, "").strip
      json_match = clean_json.match(/\{[\s\S]*\}/)
      clean_json = json_match[0] if json_match

      parsed = JSON.parse(clean_json)
      return nil unless parsed["title"].present? && parsed["body"].present?

      {
        "title" => parsed["title"].to_s.strip,
        "body" => parsed["body"].to_s.strip,
        "status_type" => (parsed["status_type"].presence || st_type).to_s,
        "tone" => @tone,
        "service_id" => @incident.service_id,
        "service_name" => service_name,
        "mode" => "live_gemini",
        "model" => res[:model],
        "generated_at" => Time.current.iso8601
      }
    rescue StandardError => e
      Rails.logger.warn("[Ai::StakeholderBroadcastGeneratorService] Gemini parsing fallback: #{e.message}")
      nil
    end

    def deterministic_broadcast
      st_type = effective_status_type
      slug = service_slug
      name = service_name

      template = lookup_template(slug, name, st_type)

      {
        "title" => template[:title],
        "body" => template[:body],
        "status_type" => st_type,
        "tone" => @tone,
        "service_id" => @incident.service_id,
        "service_name" => name,
        "mode" => "deterministic_fallback",
        "model" => self.class.gemini_model,
        "generated_at" => Time.current.iso8601
      }
    end

    def lookup_template(slug, name, st_type)
      key = if slug.include?("duo") || name.to_s.downcase.include?("duo")
              "duo"
            elsif slug.include?("webex") || name.to_s.downcase.include?("webex")
              "webex"
            elsif slug.include?("meraki") || name.to_s.downcase.include?("meraki")
              "meraki"
            elsif slug.include?("appdynamics") || name.to_s.downcase.include?("appdynamics")
              "appdynamics"
            elsif slug.include?("licensing") || name.to_s.downcase.include?("licensing")
              "smart-licensing"
            else
              "generic"
            end

      templates = {
        "duo" => {
          "investigating" => {
            title: "Investigating Authentication Latency on #{name}",
            body: "We are currently investigating elevated authentication latency and intermittent push notification delays on #{name}. Engineering teams are actively analyzing session cache performance. Single sign-on and MFA authentications may experience brief delays."
          },
          "identified" => {
            title: "Identified Performance Degradation on #{name}",
            body: "The root cause of authentication timeouts on #{name} has been identified as upstream session cache contention. Traffic shedding and cache reallocation are currently underway to restore normal latency."
          },
          "monitoring" => {
            title: "Monitoring Recovery on #{name}",
            body: "Remediation measures have been applied to the authentication cluster and success rates have recovered to 99.9% on #{name}. Responders are monitoring session queues to ensure sustained stability."
          },
          "resolved" => {
            title: "Resolved: #{name} Restored to Normal Operations",
            body: "The authentication latency on #{name} has been fully resolved. All SSO authentications and MFA push deliveries are operating within normal SLO parameters."
          }
        },
        "webex" => {
          "investigating" => {
            title: "Investigating Media Stream Degradation on #{name}",
            body: "We are actively investigating reports of transient packet drop and media stream jitter affecting #{name}. Responders are analyzing global backbone routing and transit peering."
          },
          "identified" => {
            title: "Identified Network Peering Anomaly on #{name}",
            body: "An upstream ISP routing anomaly impacting #{name} has been identified. Traffic is actively being rerouted across redundant backbone peering points to bypass degraded transit links."
          },
          "monitoring" => {
            title: "Monitoring Audio/Video Quality on #{name}",
            body: "Global media routing on #{name} has been stabilized and RTP jitter metrics have normalized across all regions. We are monitoring live meeting streams before declaring full resolution."
          },
          "resolved" => {
            title: "Resolved: #{name} Audio/Video Fully Restored",
            body: "All #{name} media relays and audio/video streams have been verified healthy and are operating with optimal low latency across all global clusters."
          }
        },
        "meraki" => {
          "investigating" => {
            title: "Investigating Dashboard Sync Delays on #{name}",
            body: "We are investigating delays in configuration synchronization and telemetry ingestion across #{name}. Managed network devices remain fully operational and local traffic is unaffected."
          },
          "identified" => {
            title: "Identified Cloud Sync Ingestion Bottleneck on #{name}",
            body: "We have isolated a connection termination bottleneck on #{name}. Configuration push queues are being drained and proxy pools restarted to alleviate backlog."
          },
          "monitoring" => {
            title: "Monitoring Configuration Sync on #{name}",
            body: "The proxy tier has been stabilized and configuration synchronization backlogs on #{name} are rapidly diminishing. We are monitoring node reconnection rates across all organizations."
          },
          "resolved" => {
            title: "Resolved: #{name} Fully Restored",
            body: "#{name} telemetry ingestion and configuration synchronization have returned to normal operating latencies with 100% device connectivity."
          }
        },
        "appdynamics" => {
          "investigating" => {
            title: "Investigating Metric Ingestion Delays on #{name}",
            body: "We are observing ingestion delays for agent APM metrics and trace events on #{name}. Monitored customer applications remain unaffected and continue running normally."
          },
          "identified" => {
            title: "Identified Ingestion Bottleneck on #{name}",
            body: "The telemetry pipeline backlog on #{name} has been traced to a Kafka partition rebalance in the stream processing layer. Consumer groups are being re-anchored to restore real-time processing."
          },
          "monitoring" => {
            title: "Monitoring Ingestion Catch-Up on #{name}",
            body: "Stream processing throughput on #{name} has returned to baseline and historical telemetry backlog is being steadily cleared. Live dashboards are reflecting updated metrics."
          },
          "resolved" => {
            title: "Resolved: #{name} Operating Normally",
            body: "All metric ingestion pipelines and trace processing clusters on #{name} are fully operational with normal sub-second delivery latency."
          }
        },
        "smart-licensing" => {
          "investigating" => {
            title: "Investigating API Availability on #{name}",
            body: "We are investigating intermittent HTTP 503 errors and elevated latency on #{name} endpoints. Existing device entitlements and licensing tokens remain fully active."
          },
          "identified" => {
            title: "Identified Database Lock Contention on #{name}",
            body: "A database transaction contention issue during bulk entitlement synchronization on #{name} has been identified. SRE responders are terminating stale transaction locks and applying query limits."
          },
          "monitoring" => {
            title: "Monitoring Response Times on #{name}",
            body: "Database transaction queues have cleared and #{name} response times have returned under 80ms. Responders are monitoring token validation traffic across all regions."
          },
          "resolved" => {
            title: "Resolved: #{name} Fully Restored",
            body: "#{name} endpoints are responding normally across all global regions with zero elevated error rates."
          }
        },
        "generic" => {
          "investigating" => {
            title: "Investigating Service Degradation on #{name}",
            body: "We are currently investigating an issue impacting #{name}. Engineering teams have been mobilized and are actively working to restore normal operations."
          },
          "identified" => {
            title: "Identified Performance Issue on #{name}",
            body: "The root cause impacting #{name} has been identified and corrective actions are actively underway. Further updates will follow as remediation progresses."
          },
          "monitoring" => {
            title: "Monitoring Mitigation on #{name}",
            body: "A fix has been deployed for #{name} and service telemetry indicates recovery. We are closely monitoring system health."
          },
          "resolved" => {
            title: "Resolved: #{name} Restored to Normal Operations",
            body: "All systems for #{name} have been verified healthy and are operating within normal SLO parameters."
          }
        }
      }

      service_group = templates[key] || templates["generic"]
      service_group[st_type] || service_group["investigating"]
    end
  end
end

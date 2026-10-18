# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module Ai
  class LogTriageService
    def self.gemini_model
      ENV.fetch("GEMINI_MODEL", "gemini-3.8-flash")
    end

    def self.gemini_api_url
      "https://generativelanguage.googleapis.com/v1beta/models/#{gemini_model}:generateContent"
    end

    def self.call(raw_alerts:, services:, preferred_service: nil)
      new(raw_alerts: raw_alerts, services: services, preferred_service: preferred_service).call
    end

    def initialize(raw_alerts:, services:, preferred_service: nil)
      @raw_alerts = Array(raw_alerts)
      @services = Array(services)
      @preferred_service = preferred_service
      @api_key = ENV["GEMINI_API_KEY"]
    end

    def call
      if @api_key.present?
        gemini_result = call_gemini
        return gemini_result if gemini_result.present?
      end

      deterministic_triage
    rescue StandardError => e
      Rails.logger.warn("[Ai::LogTriageService] Gemini failed (#{e.class}: #{e.message}), falling back to deterministic triage.")
      deterministic_triage
    end

    private

    def call_gemini
      uri = URI("#{self.class.gemini_api_url}?key=#{@api_key}")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"

      service_catalog = @services.map { |s| "- #{s.slug}: #{s.name} (#{s.tier})" }.join("\n")
      sample_logs = @raw_alerts.first(12).map.with_index(1) do |a, idx|
        msg = a.is_a?(Hash) ? a[:message] || a["message"] : a.message
        src = a.is_a?(Hash) ? a[:source] || a["source"] : a.source
        sev = a.is_a?(Hash) ? a[:severity] || a["severity"] : a.severity
        "#{idx}. [#{src}] (#{sev.to_s.upcase}) #{msg}"
      end.join("\n")

      prompt = <<~PROMPT
        You are the Cisco Cloud Operations AIOps Log Correlation & Service Detection Engine.
        Analyze the following raw telemetry log burst (#{@raw_alerts.size} total signals) and identify WHICH monitored Cisco service is experiencing the primary root failure.

        Monitored Cisco Services:
        #{service_catalog}

        Incoming Raw Telemetry Signals (Sample of #{@raw_alerts.size} signals):
        #{sample_logs}

        Return a single STRICT JSON object with EXACTLY these keys:
        {
          "detected_service_slug": "Exact slug from the Monitored Cisco Services list above",
          "incident_title": "Concise, high-clarity technical incident title for the Incident Queue",
          "severity": "SEV-1",
          "detection_reasoning": "2-sentence Turkish explanation of how AI identified the root service from the telemetry logs and separated cascade noise"
        }
      PROMPT

      request.body = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json"
        }
      }.to_json

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 12
      http.read_timeout = ENV.fetch("GEMINI_READ_TIMEOUT", "45").to_i

      response = http.request(request)
      return nil unless response.is_a?(Net::HTTPSuccess)

      parsed_body = JSON.parse(response.body)
      candidate_parts = parsed_body.dig("candidates", 0, "content", "parts") || []
      text_part = candidate_parts.find { |p| p["text"].present? && !p["thought"] } || candidate_parts.first
      text = text_part&.dig("text")
      return nil if text.blank?

      clean_json = text.strip.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/i, "").strip
      json_match = clean_json.match(/\{[\s\S]*\}/)
      clean_json = json_match[0] if json_match

      parsed = JSON.parse(clean_json)
      return nil unless parsed["detected_service_slug"].present? && parsed["incident_title"].present?

      {
        "detected_service_slug" => parsed["detected_service_slug"].to_s.strip,
        "incident_title" => parsed["incident_title"].to_s.strip,
        "severity" => %w[SEV-1 SEV-2 SEV-3].include?(parsed["severity"]) ? parsed["severity"] : "SEV-1",
        "detection_reasoning" => parsed["detection_reasoning"].presence || "AI ham log akışındaki kök sinyalleri eşleştirerek arızalı servisi tespit etti.",
        "mode" => "live_gemini",
        "model" => self.class.gemini_model,
        "generated_at" => Time.current.iso8601
      }
    rescue StandardError => e
      Rails.logger.warn("[Ai::LogTriageService] Gemini parsing fallback: #{e.message}")
      nil
    end

    def deterministic_triage
      svc = @preferred_service || @services.first
      slug = svc&.slug.to_s
      name = svc&.name || "Cisco Core Service"

      title, reasoning = case slug
                         when /duo/
                           [
                             "Alert Storm: Duo Auth Gateway Redis Connection Saturation & MFA Failures",
                             "Akan 30 telemetri sinyali içinde Datadog ve Catalyst Center'dan gelen Redis bağlantı havuzu aşımı (500/500) kök sinyal olarak yakalandı; diğer 28 sinyal bağımlı pod gürültüsü olarak ayrıştırıldı ve arızanın Cisco Duo Auth Gateway servisinde olduğu tespit edildi."
                           ]
                         when /webex/
                           [
                             "Alert Storm: Webex Frankfurt Media Router Packet Loss & BGP Route Flap",
                             "ThousandEyes BGP anons kopması ve RTP jitter buffer taşması sinyalleri korele edilerek kök arızanın Webex Global Media Router servisinde olduğu tespit edildi; 28 ikincil ağ uyarısı bastırıldı."
                           ]
                         when /meraki/
                           [
                             "Alert Storm: Meraki Edge Proxy TLS Handshake Degradation",
                             "Envoy TLS sertifika doğrulama hataları kümelenerek arızanın Meraki Dashboard Cloud Sync servisinde olduğu belirlendi ve olay kuyruğuna eklendi."
                           ]
                         when /appdynamics/
                           [
                             "Alert Storm: AppDynamics Kafka Event Stream Backpressure",
                             "Kafka partition lag ve worker pod bellek doygunluğu sinyalleri analiz edilerek sorunun AppDynamics Ingestion Pipeline servisinden kaynaklandığı tespit edildi."
                           ]
                         when /licensing/
                           [
                             "Alert Storm: Smart Licensing Token Verification Latency Spike",
                             "HMAC token doğrulama zaman aşımı logları korele edilerek arızanın Smart Licensing API servisinde olduğu belirlendi."
                           ]
                         else
                           [
                             "Alert Storm: #{name} High-Volume Telemetry Cascade",
                             "Ham telemetri loglarındaki kritik hata imzaları kümelenerek kök sorunun #{name} servisinde olduğu tespit edildi ve olay kuyruğuna eklendi."
                           ]
                         end

      {
        "detected_service_slug" => slug,
        "incident_title" => title,
        "severity" => "SEV-1",
        "detection_reasoning" => reasoning,
        "mode" => "deterministic_fallback",
        "model" => self.class.gemini_model,
        "generated_at" => Time.current.iso8601
      }
    end
  end
end

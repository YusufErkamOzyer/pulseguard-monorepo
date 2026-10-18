require "net/http"
require "json"
require "uri"

module Ai
  class BaseEngineService
    DEFAULT_FALLBACK_TEXT = "AI Engine Ready — Waiting for SaaS domain schema.".freeze
    def self.gemini_model
      ENV.fetch("GEMINI_MODEL", "gemini-3.8-flash")
    end

    def self.gemini_api_url
      "https://generativelanguage.googleapis.com/v1beta/models/#{gemini_model}:generateContent"
    end

    def self.call(prompt = nil)
      new(prompt).call
    end

    def initialize(prompt = nil)
      @prompt = prompt.presence || "Provide a concise 1-sentence enterprise system status confirmation."
      @api_key = ENV["GEMINI_API_KEY"]
    end

    def call
      if @api_key.blank?
        return fallback_response("GEMINI_API_KEY environment variable is not configured.")
      end

      call_gemini_api
    rescue StandardError => e
      Rails.logger.error("[Ai::BaseEngineService] Gemini API call failed: #{e.class} - #{e.message}")
      fallback_response("API request failed: #{e.message}")
    end

    private

    def call_gemini_api
      uri = URI("#{self.class.gemini_api_url}?key=#{@api_key}")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = {
        contents: [
          {
            parts: [
              { text: @prompt }
            ]
          }
        ]
      }.to_json

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 15
      http.read_timeout = ENV.fetch("GEMINI_READ_TIMEOUT", "100").to_i

      response = http.request(request)

      if response.is_a?(Net::HTTPSuccess)
        parsed = JSON.parse(response.body)
        candidate_parts = parsed.dig("candidates", 0, "content", "parts") || []
        text_part = candidate_parts.find { |p| p["text"].present? && !p["thought"] } || candidate_parts.first
        candidate_text = text_part&.dig("text")

        if candidate_text.present?
          {
            status: "ok",
            mode: "live_gemini",
            model: self.class.gemini_model,
            actionable_pass_preview: candidate_text.strip,
            timestamp: Time.current.iso8601
          }
        else
          fallback_response("Gemini response missing text candidate.")
        end
      else
        fallback_response("HTTP #{response.code}: #{response.message}")
      end
    end

    def fallback_response(reason = nil)
      {
        status: "ok",
        mode: "fallback",
        actionable_pass_preview: DEFAULT_FALLBACK_TEXT,
        fallback_reason: reason,
        timestamp: Time.current.iso8601
      }
    end
  end
end

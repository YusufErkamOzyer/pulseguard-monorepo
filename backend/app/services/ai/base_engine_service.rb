require "net/http"
require "json"
require "uri"

module Ai
  class BaseEngineService
    DEFAULT_FALLBACK_TEXT = "AI Engine Ready — Waiting for SaaS domain schema.".freeze

    def self.gemini_model
      Ai::GeminiClient.primary_model
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

      res = Ai::GeminiClient.generate_content(
        prompt: @prompt,
        json_mode: false,
        read_timeout: ENV.fetch("GEMINI_READ_TIMEOUT", "100").to_i,
        api_key: @api_key
      )

      if res[:success] && res[:text].present?
        {
          status: "ok",
          mode: "live_gemini",
          model: res[:model],
          actionable_pass_preview: res[:text].strip,
          timestamp: Time.current.iso8601
        }
      else
        fallback_response(res[:error] || "Gemini models exhausted")
      end
    rescue StandardError => e
      Rails.logger.error("[Ai::BaseEngineService] Gemini API call failed: #{e.class} - #{e.message}")
      fallback_response("API request failed: #{e.message}")
    end

    private

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

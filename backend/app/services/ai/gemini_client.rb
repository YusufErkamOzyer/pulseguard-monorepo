# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module Ai
  class GeminiClient
    DEFAULT_MODELS = [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite"
    ].freeze

    def self.models_chain
      env_models = ENV["GEMINI_MODELS"].presence || ENV["GEMINI_MODEL"].presence
      if env_models.present?
        models = env_models.split(",").map(&:strip).reject(&:blank?)
        return models if models.any?
      end
      DEFAULT_MODELS
    end

    def self.primary_model
      models_chain.first || "gemini-3.8-flash"
    end

    def self.generate_content(prompt:, json_mode: false, read_timeout: nil, api_key: nil)
      key = api_key.presence || ENV["GEMINI_API_KEY"]
      return { success: false, error: "GEMINI_API_KEY missing" } if key.blank?

      models = models_chain
      timeout = (read_timeout || ENV.fetch("GEMINI_READ_TIMEOUT", "60")).to_i

      models.each do |model_name|
        uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{model_name}:generateContent?key=#{key}")
        request = Net::HTTP::Post.new(uri)
        request["Content-Type"] = "application/json"

        body_payload = {
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ]
        }
        body_payload[:generationConfig] = { response_mime_type: "application/json" } if json_mode

        request.body = body_payload.to_json

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 10
        http.read_timeout = timeout

        begin
          response = http.request(request)

          if response.is_a?(Net::HTTPSuccess)
            parsed = JSON.parse(response.body)
            parts = parsed.dig("candidates", 0, "content", "parts") || []
            text_part = parts.find { |p| p["text"].present? && !p["thought"] } || parts.first
            candidate_text = text_part&.dig("text")

            if candidate_text.present?
              Rails.logger.info("[Ai::GeminiClient] Succeeded using model: #{model_name}")
              return {
                success: true,
                model: model_name,
                text: candidate_text,
                raw: parsed
              }
            else
              Rails.logger.warn("[Ai::GeminiClient] Model #{model_name} returned 200 but candidate text was empty. Trying fallback...")
            end
          else
            error_msg = begin
              JSON.parse(response.body).dig("error", "message")
            rescue StandardError
              response.message
            end
            Rails.logger.warn("[Ai::GeminiClient] Model #{model_name} failed (HTTP #{response.code}: #{error_msg}). Trying fallback...")
          end
        rescue StandardError => e
          Rails.logger.warn("[Ai::GeminiClient] Model #{model_name} encountered error (#{e.class}: #{e.message}). Trying fallback...")
        end
      end

      Rails.logger.error("[Ai::GeminiClient] All Gemini models in fallback chain failed: #{models.join(' -> ')}")
      { success: false, error: "All fallback models exhausted" }
    end
  end
end

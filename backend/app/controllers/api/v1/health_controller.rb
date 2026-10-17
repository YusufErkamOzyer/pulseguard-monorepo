module Api
  module V1
    class HealthController < ApplicationController
      def show
        db_connected = begin
          ActiveRecord::Base.connection_pool.with_connection do |conn|
            conn.execute("SELECT 1")
            conn.active?
          end
        rescue StandardError
          false
        end

        total_logs = begin
          SystemLog.count
        rescue StandardError
          0
        end

        key_present = ENV["GEMINI_API_KEY"].present?

        render json: {
          status: "operational",
          rails_version: Rails.version,
          db_connected: db_connected,
          total_logs: total_logs,
          ai_mode: key_present ? "live_gemini" : "deterministic_fallback",
          timestamp: Time.current.iso8601
        }
      end
    end
  end
end

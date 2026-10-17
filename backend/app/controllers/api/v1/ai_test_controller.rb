module Api
  module V1
    class AiTestController < ApplicationController
      def create
        prompt = params[:prompt].presence || "Enterprise core readiness probe: confirm backend AI pipeline status."

        result = Ai::BaseEngineService.call(prompt)

        # Log AI test event to PostgreSQL
        SystemLog.create!(
          event_type: "AI_PIPELINE_PROBE",
          message: "AI probe executed (#{result[:mode]}): #{result[:actionable_pass_preview].to_s.truncate(100)}",
          metadata: {
            prompt: prompt,
            mode: result[:mode],
            status: result[:status],
            preview: result[:actionable_pass_preview]
          }
        )

        render json: result, status: :ok
      rescue StandardError => e
        render json: {
          status: "error",
          mode: "fallback",
          message: e.message,
          actionable_pass_preview: "AI Engine error encountered — fallback preserved."
        }, status: :internal_server_error
      end
    end
  end
end

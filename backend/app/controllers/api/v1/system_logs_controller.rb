module Api
  module V1
    class SystemLogsController < ApplicationController
      def index
        logs = SystemLog.order(created_at: :desc).limit(50)
        render json: {
          total: SystemLog.count,
          logs: logs
        }
      end

      def create
        log_params = params.fetch(:system_log, {}).permit(:event_type, :message, metadata: {})

        event_type = log_params[:event_type].presence || "SYNTHETIC_EVENT"
        message = log_params[:message].presence || "Synthetic event dispatched from Next.js dashboard at #{Time.current.strftime('%H:%M:%S')}."
        metadata = log_params[:metadata].presence || {
          client: "Next.js App Router",
          environment: Rails.env,
          triggered_at: Time.current.iso8601
        }

        created_log = SystemLog.create!(
          event_type: event_type,
          message: message,
          metadata: metadata
        )

        logs = SystemLog.order(created_at: :desc).limit(50)

        render json: {
          success: true,
          created_log: created_log,
          total: SystemLog.count,
          logs: logs
        }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { success: false, errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end
end

# frozen_string_literal: true

module Api
  module V1
    class AlertsController < ApplicationController
      before_action :set_alert, only: [:show]

      def index
        scope = Alert.includes(:service).order(created_at: :desc)

        if params[:service_id].present? && params[:service_id] != "all"
          scope = scope.where(service_id: params[:service_id])
        elsif params[:service_slug].present? && params[:service_slug] != "all"
          service = Service.find_by(slug: params[:service_slug])
          scope = service ? scope.where(service_id: service.id) : scope.none
        end

        if params[:incident_id].present? && params[:incident_id] != "all"
          scope = scope.where(incident_id: params[:incident_id])
        end

        if params[:status].present? && params[:status] != "all"
          scope = scope.where(status: params[:status])
        end

        if params[:severity].present? && params[:severity] != "all"
          scope = scope.where(severity: params[:severity])
        end

        if params[:source].present? && params[:source] != "all"
          scope = scope.where(source: params[:source])
        end

        total_count = scope.count
        page = [params[:page].to_i, 1].max
        per_page = params[:limit].present? ? [[params[:limit].to_i, 1].max, 200].min : 50

        paginated_alerts = scope.offset((page - 1) * per_page).limit(per_page)

        render json: {
          alerts: paginated_alerts.as_json,
          total: total_count,
          meta: {
            total: total_count,
            page: page,
            per_page: per_page,
            total_pages: total_count.zero? ? 1 : (total_count.to_f / per_page).ceil
          }
        }
      end

      def show
        render json: { alert: @alert.as_json }
      end

      def create
        service = Service.find_by(id: alert_params[:service_id]) ||
                  Service.find_by(slug: alert_params[:service_slug])
        unless service
          return render json: { error: "Service not found" }, status: :unprocessable_entity
        end

        alert = Alert.new(
          service: service,
          source: alert_params[:source],
          severity: alert_params[:severity].presence || "warning",
          status: alert_params[:status].presence || "unprocessed",
          message: alert_params[:message],
          fingerprint: alert_params[:fingerprint].presence || "#{service.slug}:#{SecureRandom.hex(8)}",
          metadata: alert_params[:metadata].presence || {},
          incident_id: alert_params[:incident_id]
        )

        if alert.save
          render json: { alert: alert.as_json, success: true }, status: :created
        else
          render json: { error: alert.errors.full_messages }, status: :unprocessable_entity
        end
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def metrics
        scope = Alert.all
        incident_scope = Incident.all

        if params[:service_id].present? && params[:service_id] != "all"
          scope = scope.where(service_id: params[:service_id])
          incident_scope = incident_scope.where(service_id: params[:service_id])
        elsif params[:service_slug].present? && params[:service_slug] != "all"
          svc = Service.find_by(slug: params[:service_slug])
          if svc
            scope = scope.where(service_id: svc.id)
            incident_scope = incident_scope.where(service_id: svc.id)
          end
        end

        total = scope.count
        grouped = scope.where(status: "grouped").count
        suppressed = scope.where(status: "suppressed_noise").count
        unprocessed = scope.where(status: "unprocessed").count

        consolidated_incidents = incident_scope.where(id: scope.where(status: "grouped").select(:incident_id)).distinct.count
        consolidated_incidents = [consolidated_incidents, incident_scope.active.count].max

        evaluated = grouped + suppressed
        ratio = evaluated.positive? ? (suppressed.to_f / evaluated).round(3) : (total.positive? ? (suppressed.to_f / total).round(3) : 0.0)
        percentage = evaluated.positive? ? ((suppressed.to_f / evaluated) * 100).round(1) : (total.positive? ? ((suppressed.to_f / total) * 100).round(1) : 0.0)

        render json: {
          total_alerts: total,
          grouped_alerts: grouped,
          suppressed_noise: suppressed,
          unprocessed_alerts: unprocessed,
          consolidated_incidents: consolidated_incidents,
          noise_reduction_ratio: ratio,
          noise_reduction_percentage: percentage
        }
      end

      def simulate_storm
        service_slug = params[:service_slug].presence
        service_id = params[:service_id].presence
        burst_size = params[:burst_size].present? ? params[:burst_size].to_i : 30

        result = Aiops::AlertStormSimulatorService.call(
          service_slug: service_slug,
          service_id: service_id,
          incident_id: params[:incident_id],
          burst_size: burst_size
        )

        render json: {
          success: true,
          incident: incident_payload(result[:incident]),
          storm_summary: result[:storm_summary],
          alerts: result[:alerts].map(&:as_json)
        }, status: :created
      rescue ActiveRecord::RecordNotFound => e
        render json: { error: e.message }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      private

      def set_alert
        @alert = Alert.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Alert not found" }, status: :not_found
      end

      def alert_params
        params.require(:alert).permit(:service_id, :service_slug, :source, :severity, :status, :message, :fingerprint, :incident_id, metadata: {})
      end

      def incident_payload(incident)
        return nil unless incident

        {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          error_signature: incident.error_signature,
          assigned_to: incident.assigned_to,
          acknowledged_at: incident.acknowledged_at,
          resolved_at: incident.resolved_at,
          created_at: incident.created_at,
          service: incident.service ? {
            id: incident.service.id,
            name: incident.service.name,
            slug: incident.service.slug,
            tier: incident.service.tier,
            status: incident.service.status,
            on_call_engineer: incident.service.on_call_engineer,
            escalation_policy: incident.service.escalation_policy
          } : nil,
          ai_triage_pass: incident.ai_triage_pass,
          events: incident.incident_events.map do |event|
            {
              id: event.id,
              actor: event.actor,
              action_type: event.action_type,
              detail: event.detail,
              created_at: event.created_at
            }
          end
        }
      end
    end
  end
end

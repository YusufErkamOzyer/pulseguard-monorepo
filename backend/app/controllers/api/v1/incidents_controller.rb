module Api
  module V1
    class IncidentsController < ApplicationController
      before_action :set_incident, only: [:show, :transition, :apply_ai_pass, :generate_postmortem]

      def index
        incidents = Incident.includes(:service, :postmortem).order(created_at: :desc)

        if params[:status].present? && params[:status] != "all"
          incidents = incidents.where(status: params[:status])
        end

        if params[:severity].present? && params[:severity] != "all"
          incidents = incidents.where(severity: params[:severity])
        end

        render json: {
          incidents: incidents.map { |inc| incident_payload(inc, include_events: false) },
          total: incidents.size
        }
      end

      def show
        render json: {
          incident: incident_payload(@incident, include_events: true)
        }
      end

      def create
        service = Service.find_by(id: incident_params[:service_id]) || Service.find_by(slug: incident_params[:service_slug])
        unless service
          return render json: { error: "Service not found" }, status: :unprocessable_entity
        end

        severity = incident_params[:severity].presence || "SEV-2"
        assigned_to = incident_params[:assigned_to].presence || service.on_call_engineer

        incident = Incident.new(
          service: service,
          title: incident_params[:title],
          severity: severity,
          status: "triggered",
          error_signature: incident_params[:error_signature],
          assigned_to: assigned_to
        )

        ActiveRecord::Base.transaction do
          incident.save!

          # Update service status according to severity
          if severity == "SEV-1"
            service.update!(status: "outage")
          elsif service.status == "healthy"
            service.update!(status: "degraded")
          end

          # Create initial trigger event
          actor_trigger = incident_params[:actor].presence || "Cisco Catalyst Monitoring"
          incident.incident_events.create!(
            actor: actor_trigger,
            action_type: "triggered",
            detail: "Alert triggered for #{service.name}: #{incident.title}"
          )

          # Generate AI Remediation Pass
          pass = Ai::IncidentPassGeneratorService.call(incident)
          incident.update!(ai_triage_pass: pass)

          # Record AI Analysis in timeline
          conf = pass["confidence_score"] || 94
          incident.incident_events.create!(
            actor: "PulseGuard AI Agent",
            action_type: "ai_analyzed",
            detail: "⚡ 1-Click Remediation Pass synthesized with #{conf}% confidence. Runbook ready: `#{pass['suggested_runbook_command']}`"
          )
        end

        render json: {
          incident: incident_payload(incident.reload, include_events: true),
          success: true
        }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def transition
        event = params[:event].to_s.downcase
        actor = params[:actor].presence || "SRE On-Call"

        case event
        when "acknowledge", "ack"
          @incident.acknowledge!(actor)
        when "resolve"
          @incident.resolve!(actor)
        else
          return render json: { error: "Invalid transition event: #{event}. Use 'acknowledge' or 'resolve'." }, status: :unprocessable_entity
        end

        render json: {
          incident: incident_payload(@incident.reload, include_events: true),
          success: true
        }
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def apply_ai_pass
        actor = params[:actor].presence || "PulseGuard AI Agent"
        @incident.apply_ai_pass!(actor)

        render json: {
          incident: incident_payload(@incident.reload, include_events: true),
          success: true,
          message: "1-Click AI Remediation Pass executed successfully. State resolved and postmortem drafted."
        }
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      def generate_postmortem
        pm = @incident.postmortem || @incident.build_postmortem
        pass = @incident.ai_triage_pass || {}

        summary = params[:summary].presence || pm.summary.presence ||
                  "Postmortem for #{@incident.title}. Root cause resolved via PulseGuard runbook execution."
        root_cause = params[:root_cause].presence || pm.root_cause.presence ||
                     pass["root_cause_hypothesis"] || "Root cause identified through signature analysis."
        impact_metrics = params[:impact_metrics].presence || pm.impact_metrics.presence ||
                         "MTTR saved: #{pass['estimated_time_saved_minutes'] || 18}m. 0 enterprise customer sessions lost."
        action_items = params[:action_items].presence || pm.action_items.presence || [
          { "task" => "Audit connection limits and TLS bundles in #{@incident.service.name}", "completed" => true },
          { "task" => "Add automated fallback runbook to Cisco Catalyst Center alert pipeline", "completed" => true }
        ]
        published = params[:published].nil? ? true : params[:published]

        pm.update!(
          summary: summary,
          root_cause: root_cause,
          impact_metrics: impact_metrics,
          action_items: action_items,
          published: published
        )

        render json: {
          postmortem: pm,
          incident: incident_payload(@incident.reload, include_events: true),
          success: true
        }
      rescue StandardError => e
        render json: { error: e.message }, status: :unprocessable_entity
      end

      private

      def set_incident
        @incident = Incident.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      end

      def incident_params
        params.require(:incident).permit(:service_id, :service_slug, :title, :severity, :error_signature, :assigned_to, :actor)
      end

      def incident_payload(incident, include_events: false)
        payload = {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          error_signature: incident.error_signature,
          assigned_to: incident.assigned_to,
          acknowledged_at: incident.acknowledged_at,
          resolved_at: incident.resolved_at,
          created_at: incident.created_at,
          updated_at: incident.updated_at,
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
          postmortem: incident.postmortem ? {
            id: incident.postmortem.id,
            summary: incident.postmortem.summary,
            root_cause: incident.postmortem.root_cause,
            impact_metrics: incident.postmortem.impact_metrics,
            action_items: incident.postmortem.action_items,
            published: incident.postmortem.published,
            created_at: incident.postmortem.created_at,
            updated_at: incident.postmortem.updated_at
          } : nil
        }

        if include_events
          payload[:events] = incident.incident_events.map do |event|
            {
              id: event.id,
              actor: event.actor,
              action_type: event.action_type,
              detail: event.detail,
              created_at: event.created_at
            }
          end
        end

        payload
      end
    end
  end
end

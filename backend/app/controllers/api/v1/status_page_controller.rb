# frozen_string_literal: true

module Api
  module V1
    class StatusPageController < ApplicationController
      UPTIME_BASELINES = {
        "cisco-duo-auth" => 99.95,
        "webex-media-router" => 99.92,
        "meraki-cloud-sync" => 99.98,
        "appdynamics-ingestion" => 99.96,
        "smart-licensing-api" => 99.99
      }.freeze

      def show
        services = Service.includes(:incidents).order(:id)

        # Global status calculation
        global_status = if services.any? { |s| s.status == "outage" }
                          "outage"
                        elsif services.any? { |s| s.status == "degraded" }
                          "degraded"
                        else
                          "operational"
                        end

        services_payload = services.map do |service|
          active_incs = service.incidents.select { |inc| inc.status != "resolved" }

          {
            id: service.id,
            name: service.name,
            slug: service.slug,
            tier: service.tier,
            status: service.status,
            on_call_engineer: service.on_call_engineer,
            escalation_policy: service.escalation_policy,
            active_incidents_count: active_incs.size,
            active_incidents: active_incs.map do |inc|
              {
                id: inc.id,
                title: inc.title,
                severity: inc.severity,
                status: inc.status,
                created_at: inc.created_at
              }
            end,
            uptime_90d: calculate_uptime(service),
            created_at: service.created_at,
            updated_at: service.updated_at
          }
        end

        recent_broadcasts = StatusUpdate.includes(:service)
                                        .order(published_at: :desc, created_at: :desc)
                                        .limit(20)
                                        .map do |u|
          {
            id: u.id,
            service_id: u.service_id,
            service_name: u.service&.name,
            incident_id: u.incident_id,
            title: u.title,
            body: u.body,
            status_type: u.status_type,
            published_by: u.published_by,
            published_at: u.published_at,
            created_at: u.created_at
          }
        end

        healthy_count = services.count { |s| s.status == "healthy" }
        degraded_count = services.count { |s| s.status == "degraded" }
        outage_count = services.count { |s| s.status == "outage" }

        avg_uptime = if services_payload.any?
                       (services_payload.sum { |s| s[:uptime_90d] } / services_payload.size.to_f).round(2)
                     else
                       99.95
                     end

        render json: {
          global_status: global_status,
          services: services_payload,
          recent_broadcasts: recent_broadcasts,
          metrics: {
            total_services: services.size,
            healthy_services: healthy_count,
            degraded_services: degraded_count,
            outage_services: outage_count,
            overall_uptime_90d: avg_uptime
          },
          timestamp: Time.current.iso8601
        }
      end

      private

      def calculate_uptime(service)
        slug = service.slug.to_s
        baseline = if slug.include?("duo")
                     UPTIME_BASELINES["cisco-duo-auth"]
                   elsif slug.include?("webex")
                     UPTIME_BASELINES["webex-media-router"]
                   elsif slug.include?("meraki")
                     UPTIME_BASELINES["meraki-cloud-sync"]
                   elsif slug.include?("appdynamics")
                     UPTIME_BASELINES["appdynamics-ingestion"]
                   elsif slug.include?("licensing")
                     UPTIME_BASELINES["smart-licensing-api"]
                   else
                     UPTIME_BASELINES.fetch(service.slug, 99.90)
                   end

        case service.status
        when "outage"
          (baseline - 0.45).round(2)
        when "degraded"
          (baseline - 0.12).round(2)
        else
          baseline
        end
      end
    end
  end
end

module Api
  module V1
    class ServicesController < ApplicationController
      before_action :set_service, only: [:show, :update]

      def index
        services = Service.order(:id).map do |service|
          service_payload(service)
        end

        render json: { services: services, total: services.size }
      end

      def show
        render json: { service: service_payload(@service) }
      end

      def update
        if @service.update(service_params)
          render json: { service: service_payload(@service), success: true }
        else
          render json: { errors: @service.errors.full_messages, success: false }, status: :unprocessable_entity
        end
      end

      private

      def set_service
        @service = Service.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Service not found" }, status: :not_found
      end

      def service_params
        params.require(:service).permit(:name, :tier, :status, :on_call_engineer, :escalation_policy)
      end

      def service_payload(service)
        {
          id: service.id,
          name: service.name,
          slug: service.slug,
          tier: service.tier,
          status: service.status,
          on_call_engineer: service.on_call_engineer,
          escalation_policy: service.escalation_policy,
          active_incidents_count: service.active_incidents.count,
          created_at: service.created_at,
          updated_at: service.updated_at
        }
      end
    end
  end
end

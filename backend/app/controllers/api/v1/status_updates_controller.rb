# frozen_string_literal: true

module Api
  module V1
    class StatusUpdatesController < ApplicationController
      def index
        updates = StatusUpdate.includes(:service, :incident)
                              .order(published_at: :desc, created_at: :desc)

        if params[:service_id].present? && params[:service_id] != "all"
          updates = updates.where(service_id: params[:service_id])
        end

        if params[:incident_id].present? && params[:incident_id] != "all"
          updates = updates.where(incident_id: params[:incident_id])
        end

        if params[:status_type].present? && params[:status_type] != "all"
          updates = updates.where(status_type: params[:status_type])
        end

        limit = (params[:limit].presence || 50).to_i.clamp(1, 100)
        updates = updates.limit(limit)

        render json: {
          status_updates: updates.map(&:as_json),
          total: updates.size
        }
      end

      def create
        update = StatusUpdate.new(resolved_params)

        if update.save
          render json: {
            status_update: update.as_json,
            success: true
          }, status: :created
        else
          render json: {
            error: update.errors.full_messages.join(", "),
            errors: update.errors.full_messages,
            success: false
          }, status: :unprocessable_entity
        end
      end

      private

      def resolved_params
        if params[:status_update].present?
          params.require(:status_update).permit(
            :service_id,
            :incident_id,
            :title,
            :body,
            :status_type,
            :published_by,
            :published_at
          )
        else
          params.permit(
            :service_id,
            :incident_id,
            :title,
            :body,
            :status_type,
            :published_by,
            :published_at
          )
        end
      end
    end
  end
end

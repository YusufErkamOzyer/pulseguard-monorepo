module Api
  module V1
    class PostmortemsController < ApplicationController
      before_action :set_postmortem, only: [:show, :update]

      def index
        postmortems = Postmortem.includes(incident: :service).order(created_at: :desc)

        if params[:published].present?
          postmortems = postmortems.where(published: params[:published] == "true")
        end

        render json: {
          postmortems: postmortems.map { |pm| postmortem_payload(pm) },
          total: postmortems.size
        }
      end

      def show
        render json: { postmortem: postmortem_payload(@postmortem) }
      end

      def update
        if @postmortem.update(postmortem_params)
          render json: { postmortem: postmortem_payload(@postmortem), success: true }
        else
          render json: { errors: @postmortem.errors.full_messages, success: false }, status: :unprocessable_entity
        end
      end

      private

      def set_postmortem
        @postmortem = Postmortem.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Postmortem not found" }, status: :not_found
      end

      def postmortem_params
        params.require(:postmortem).permit(:summary, :root_cause, :impact_metrics, :published, action_items: [:task, :completed])
      end

      def postmortem_payload(pm)
        {
          id: pm.id,
          summary: pm.summary,
          root_cause: pm.root_cause,
          impact_metrics: pm.impact_metrics,
          action_items: pm.action_items,
          published: pm.published,
          created_at: pm.created_at,
          updated_at: pm.updated_at,
          incident: pm.incident ? {
            id: pm.incident.id,
            title: pm.incident.title,
            severity: pm.incident.severity,
            status: pm.incident.status,
            service_name: pm.incident.service&.name,
            resolved_at: pm.incident.resolved_at
          } : nil
        }
      end
    end
  end
end

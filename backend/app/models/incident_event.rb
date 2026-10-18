class IncidentEvent < ApplicationRecord
  ACTION_TYPES = %w[
    triggered
    ai_analyzed
    acknowledged
    escalated
    runbook_executed
    resolved
    aiops_alert_storm
    broadcast_published
  ].freeze

  belongs_to :incident

  validates :actor, presence: true
  validates :action_type, inclusion: { in: ACTION_TYPES }
  validates :detail, presence: true

  default_scope { order(created_at: :asc) }
end

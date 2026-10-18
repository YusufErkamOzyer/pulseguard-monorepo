class Service < ApplicationRecord
  STATUSES = %w[healthy degraded outage].freeze
  TIERS = %w[Tier-1 Tier-2 Tier-3].freeze

  has_many :incidents, dependent: :destroy
  has_many :alerts, dependent: :destroy
  has_many :status_updates, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :tier, inclusion: { in: TIERS }

  scope :healthy, -> { where(status: "healthy") }
  scope :degraded, -> { where(status: "degraded") }
  scope :outage, -> { where(status: "outage") }

  def active_incidents
    incidents.where.not(status: "resolved")
  end

  def recalculate_status!(triggering_incident = nil)
    actives = active_incidents
    new_status = if actives.where(severity: "SEV-1").exists?
                   "outage"
                 elsif actives.exists?
                   "degraded"
                 else
                   "healthy"
                 end

    old_status = status
    if old_status != new_status
      update!(status: new_status)
      if old_status.in?(%w[outage degraded]) && new_status == "healthy"
        publish_recovery_status_update!(triggering_incident)
      end
    end

    new_status
  end

  def publish_recovery_status_update!(incident = nil, responder = "PulseGuard AI Broadcast")
    status_updates.create!(
      incident: incident,
      title: "Resolved: #{name} Restored to Normal Operations",
      body: "All systems for #{name} have been verified healthy and are operating within normal SLO parameters.",
      status_type: "resolved",
      published_by: responder,
      published_at: Time.current
    )
  end
end

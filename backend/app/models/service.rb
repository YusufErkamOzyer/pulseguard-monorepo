class Service < ApplicationRecord
  STATUSES = %w[healthy degraded outage].freeze
  TIERS = %w[Tier-1 Tier-2 Tier-3].freeze

  has_many :incidents, dependent: :destroy

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

  def recalculate_status!
    actives = active_incidents
    new_status = if actives.where(severity: "SEV-1").exists?
                   "outage"
                 elsif actives.exists?
                   "degraded"
                 else
                   "healthy"
                 end
    update!(status: new_status) if status != new_status
    new_status
  end
end

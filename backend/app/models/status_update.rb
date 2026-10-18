class StatusUpdate < ApplicationRecord
  STATUS_TYPES = %w[investigating identified monitoring resolved].freeze

  belongs_to :service
  belongs_to :incident, optional: true

  before_validation :set_defaults, on: :create

  validates :title, presence: true
  validates :body, presence: true
  validates :status_type, presence: true, inclusion: { in: STATUS_TYPES }
  validates :published_by, presence: true
  validates :published_at, presence: true

  scope :recent, -> { order(published_at: :desc, created_at: :desc) }
  scope :by_service, ->(service_id) { where(service_id: service_id) }
  scope :by_status_type, ->(status_type) { where(status_type: status_type) }
  scope :investigating, -> { where(status_type: "investigating") }
  scope :identified, -> { where(status_type: "identified") }
  scope :monitoring, -> { where(status_type: "monitoring") }
  scope :resolved, -> { where(status_type: "resolved") }

  delegate :name, to: :service, prefix: true, allow_nil: true

  def as_json(options = {})
    super((options || {}).merge(methods: [:service_name]))
  end

  private

  def set_defaults
    self.status_type ||= "investigating"
    self.published_by = "PulseGuard AI Broadcast" if published_by.blank?
    self.published_at ||= Time.current
  end
end

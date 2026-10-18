class Alert < ApplicationRecord
  STATUSES = %w[unprocessed grouped suppressed_noise].freeze
  SEVERITIES = %w[critical warning info].freeze
  SOURCES = [
    "Cisco Catalyst Center",
    "Datadog",
    "ThousandEyes",
    "AWS CloudWatch",
    "Kubernetes Event"
  ].freeze

  belongs_to :service
  belongs_to :incident, optional: true

  before_validation :set_defaults, on: :create

  validates :source, presence: true, inclusion: { in: SOURCES }
  validates :severity, presence: true, inclusion: { in: SEVERITIES }
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :message, presence: true
  validates :fingerprint, presence: true

  scope :unprocessed, -> { where(status: "unprocessed") }
  scope :grouped, -> { where(status: "grouped") }
  scope :suppressed, -> { where(status: "suppressed_noise") }
  scope :recent, -> { order(created_at: :desc) }
  scope :by_service, ->(service_id) { where(service_id: service_id) }
  scope :by_severity, ->(severity) { where(severity: severity) }
  scope :by_source, ->(source) { where(source: source) }

  delegate :name, to: :service, prefix: true, allow_nil: true

  def unprocessed?
    status == "unprocessed"
  end

  def grouped?
    status == "grouped"
  end

  def suppressed?
    status == "suppressed_noise"
  end

  def group_into!(incident)
    raise ArgumentError, "Incident must be a persisted Incident" unless incident.is_a?(Incident) && incident.persisted?

    update!(status: "grouped", incident: incident)
  end

  def suppress!(incident = nil)
    if incident.present? && (!incident.is_a?(Incident) || !incident.persisted?)
      raise ArgumentError, "Incident must be a persisted Incident"
    end

    attrs = { status: "suppressed_noise" }
    attrs[:incident] = incident if incident.present?
    update!(attrs)
  end

  def as_json(options = {})
    super((options || {}).merge(methods: [ :service_name ]))
  end

  private

  def set_defaults
    self.status ||= "unprocessed"
    self.severity ||= "warning"
    self.metadata ||= {}
  end
end

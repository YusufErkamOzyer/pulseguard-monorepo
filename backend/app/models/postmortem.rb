class Postmortem < ApplicationRecord
  belongs_to :incident

  validates :incident_id, uniqueness: true
  validates :summary, presence: true, if: :published?
  validates :root_cause, presence: true, if: :published?

  scope :published, -> { where(published: true) }
  scope :drafts, -> { where(published: false) }
end

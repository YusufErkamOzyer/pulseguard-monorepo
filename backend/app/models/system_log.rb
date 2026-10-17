class SystemLog < ApplicationRecord
  validates :event_type, presence: true
  validates :message, presence: true
end

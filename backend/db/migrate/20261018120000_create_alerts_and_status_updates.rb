# frozen_string_literal: true

class CreateAlertsAndStatusUpdates < ActiveRecord::Migration[8.1]
  def change
    create_table :alerts do |t|
      t.references :service, null: false, foreign_key: true
      t.references :incident, null: true, foreign_key: true
      t.string :source, null: false
      t.string :severity, default: "warning", null: false
      t.text :message, null: false
      t.string :fingerprint, null: false
      t.string :status, default: "unprocessed", null: false
      t.jsonb :metadata, default: {}, null: false

      t.timestamps
    end

    add_index :alerts, :status
    add_index :alerts, :fingerprint
    add_index :alerts, :created_at
    add_index :alerts, [:service_id, :status]

    create_table :status_updates do |t|
      t.references :service, null: false, foreign_key: true
      t.references :incident, null: true, foreign_key: true
      t.string :title, null: false
      t.text :body, null: false
      t.string :status_type, default: "investigating", null: false
      t.string :published_by, default: "PulseGuard AI Broadcast", null: false
      t.datetime :published_at, null: false

      t.timestamps
    end

    add_index :status_updates, :status_type
    add_index :status_updates, :published_at
    add_index :status_updates, [:service_id, :published_at]
  end
end

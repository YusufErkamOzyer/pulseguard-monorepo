class CreatePulseguardCoreTables < ActiveRecord::Migration[8.1]
  def change
    create_table :services do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :tier, default: "Tier-1", null: false
      t.string :status, default: "healthy", null: false
      t.string :on_call_engineer
      t.string :escalation_policy

      t.timestamps
    end
    add_index :services, :slug, unique: true

    create_table :incidents do |t|
      t.references :service, null: false, foreign_key: true
      t.string :title, null: false
      t.string :severity, default: "SEV-2", null: false
      t.string :status, default: "triggered", null: false
      t.text :error_signature
      t.string :assigned_to
      t.datetime :acknowledged_at
      t.datetime :resolved_at
      t.jsonb :ai_triage_pass, default: {}, null: false

      t.timestamps
    end
    add_index :incidents, :status
    add_index :incidents, :severity

    create_table :incident_events do |t|
      t.references :incident, null: false, foreign_key: true
      t.string :actor, null: false
      t.string :action_type, null: false
      t.text :detail

      t.timestamps
    end
    add_index :incident_events, :action_type

    create_table :postmortems do |t|
      t.references :incident, null: false, foreign_key: true, index: { unique: true }
      t.text :summary
      t.text :root_cause
      t.string :impact_metrics
      t.jsonb :action_items, default: [], null: false
      t.boolean :published, default: false, null: false

      t.timestamps
    end
  end
end

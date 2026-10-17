# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_17_173200) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "incident_events", force: :cascade do |t|
    t.bigint "incident_id", null: false
    t.string "actor", null: false
    t.string "action_type", null: false
    t.text "detail"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["action_type"], name: "index_incident_events_on_action_type"
    t.index ["incident_id"], name: "index_incident_events_on_incident_id"
  end

  create_table "incidents", force: :cascade do |t|
    t.bigint "service_id", null: false
    t.string "title", null: false
    t.string "severity", default: "SEV-2", null: false
    t.string "status", default: "triggered", null: false
    t.text "error_signature"
    t.string "assigned_to"
    t.datetime "acknowledged_at"
    t.datetime "resolved_at"
    t.jsonb "ai_triage_pass", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["service_id"], name: "index_incidents_on_service_id"
    t.index ["severity"], name: "index_incidents_on_severity"
    t.index ["status"], name: "index_incidents_on_status"
  end

  create_table "postmortems", force: :cascade do |t|
    t.bigint "incident_id", null: false
    t.text "summary"
    t.text "root_cause"
    t.string "impact_metrics"
    t.jsonb "action_items", default: [], null: false
    t.boolean "published", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["incident_id"], name: "index_postmortems_on_incident_id", unique: true
  end

  create_table "services", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "tier", default: "Tier-1", null: false
    t.string "status", default: "healthy", null: false
    t.string "on_call_engineer"
    t.string "escalation_policy"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_services_on_slug", unique: true
  end

  create_table "system_logs", force: :cascade do |t|
    t.string "event_type"
    t.text "message"
    t.jsonb "metadata"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "incident_events", "incidents"
  add_foreign_key "incidents", "services"
  add_foreign_key "postmortems", "incidents"
end

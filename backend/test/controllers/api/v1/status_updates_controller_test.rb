# frozen_string_literal: true

require "test_helper"

class Api::V1::StatusUpdatesControllerTest < ActionDispatch::IntegrationTest
  def setup
    @service = Service.create!(
      name: "Cisco Duo Auth Gateway",
      slug: "duo-su-ctrl-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "degraded",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )

    @incident = Incident.create!(
      service: @service,
      title: "Auth Gateway Degradation",
      severity: "SEV-2",
      status: "acknowledged",
      error_signature: "Connection pool exhaustion"
    )

    @status_update = StatusUpdate.create!(
      service: @service,
      incident: @incident,
      title: "Investigating Service Degradation",
      body: "Telemetry shows latency across European regions.",
      status_type: "investigating",
      published_by: "Alex Rivera",
      published_at: 20.minutes.ago
    )
  end

  test "GET /api/v1/status_updates returns list of status updates in reverse chronological order" do
    newer_update = StatusUpdate.create!(
      service: @service,
      incident: @incident,
      title: "Mitigation in Progress",
      body: "Connection pools restarted.",
      status_type: "monitoring",
      published_by: "Alex Rivera",
      published_at: 5.minutes.ago
    )

    get api_v1_status_updates_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json["status_updates"].is_a?(Array)
    assert_operator json["status_updates"].size, :>=, 2

    first_update = json["status_updates"].first
    assert_equal newer_update.id, first_update["id"]
  end

  test "GET /api/v1/status_updates filters by service_id" do
    other_service = Service.create!(
      name: "Meraki Cloud Sync",
      slug: "meraki-su-#{SecureRandom.hex(4)}",
      tier: "Tier-2",
      status: "healthy",
      on_call_engineer: "Sarah Chen"
    )
    other_update = StatusUpdate.create!(
      service: other_service,
      title: "Routine Maintenance",
      body: "Completed cleanly.",
      status_type: "resolved",
      published_by: "Sarah Chen",
      published_at: 1.minute.ago
    )

    get api_v1_status_updates_url, params: { service_id: @service.id }
    assert_response :success

    json = JSON.parse(response.body)
    assert json["status_updates"].all? { |su| su["service_id"] == @service.id }
    assert_not json["status_updates"].any? { |su| su["service_id"] == other_service.id }
  end

  test "POST /api/v1/status_updates creates a new status update successfully" do
    assert_difference("StatusUpdate.count", 1) do
      post api_v1_status_updates_url, params: {
        status_update: {
          service_id: @service.id,
          incident_id: @incident.id,
          title: "Maintenance Completed",
          body: "All systems verified healthy and operational.",
          status_type: "resolved",
          published_by: "Alex Rivera"
        }
      }
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "Maintenance Completed", json["status_update"]["title"]
    assert_equal "resolved", json["status_update"]["status_type"]
    assert_equal @service.name, json["status_update"]["service_name"]
  end

  test "POST /api/v1/status_updates returns 422 unprocessable_entity on invalid data" do
    post api_v1_status_updates_url, params: {
      status_update: {
        service_id: @service.id,
        title: "",
        body: ""
      }
    }

    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert json["error"].present? || json["errors"].present?
  end
end

# frozen_string_literal: true

require "test_helper"

class Api::V1::StatusPageControllerTest < ActionDispatch::IntegrationTest
  def setup
    @svc_healthy = Service.create!(
      name: "Meraki Dashboard Cloud Sync",
      slug: "meraki-sp-#{SecureRandom.hex(4)}",
      tier: "Tier-2",
      status: "healthy",
      on_call_engineer: "Sarah Chen (VP of Infrastructure)"
    )
    @svc_degraded = Service.create!(
      name: "Webex Global Media Router",
      slug: "webex-sp-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "degraded",
      on_call_engineer: "Elena Rostova (Staff Platform Eng)"
    )
    @svc_outage = Service.create!(
      name: "Cisco Duo Auth Gateway",
      slug: "duo-sp-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "outage",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )

    @status_update = StatusUpdate.create!(
      service: @svc_outage,
      title: "Investigating Authentication Latency",
      body: "Engineers are troubleshooting auth timeouts in US-East.",
      status_type: "investigating",
      published_by: "Alex Rivera",
      published_at: 10.minutes.ago
    )
  end

  test "GET /api/v1/status_page returns global_status outage when any service has outage" do
    get api_v1_status_page_url
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "outage", json["global_status"]
    assert json["services"].is_a?(Array)
    assert_operator json["services"].size, :>=, 3
    assert json["recent_broadcasts"].is_a?(Array)
    assert_operator json["recent_broadcasts"].size, :>=, 1
  end

  test "GET /api/v1/status_page returns global_status degraded when highest severity is degraded" do
    @svc_outage.update!(status: "healthy")

    get api_v1_status_page_url
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "degraded", json["global_status"]
  end

  test "GET /api/v1/status_page returns global_status operational when all services are healthy" do
    @svc_outage.update!(status: "healthy")
    @svc_degraded.update!(status: "healthy")

    get api_v1_status_page_url
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "operational", json["global_status"]
  end

  test "GET /api/v1/status_page serializes service details and recent broadcasts" do
    get api_v1_status_page_url
    assert_response :success

    json = JSON.parse(response.body)
    first_service = json["services"].first
    assert first_service["id"].present?
    assert first_service["name"].present?
    assert first_service["status"].present?
    assert first_service["tier"].present?
    assert first_service["on_call_engineer"].present?

    first_broadcast = json["recent_broadcasts"].first
    assert first_broadcast["title"].present?
    assert first_broadcast["body"].present?
    assert first_broadcast["status_type"].present?
    assert first_broadcast["published_at"].present?
  end
end

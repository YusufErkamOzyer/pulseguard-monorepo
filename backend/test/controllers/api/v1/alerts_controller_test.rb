# frozen_string_literal: true

require "test_helper"

class Api::V1::AlertsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @service1 = Service.create!(
      name: "Cisco Duo Auth Gateway",
      slug: "cisco-duo-ctrl-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "healthy",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )
    @service2 = Service.create!(
      name: "Webex Global Media Router",
      slug: "webex-ctrl-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "healthy",
      on_call_engineer: "Elena Rostova (Staff Platform Eng)"
    )
    @incident = Incident.create!(
      service: @service1,
      title: "Auth Gateway Storm",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Connection pool exhaustion"
    )

    @alert1 = Alert.create!(
      service: @service1,
      source: "Datadog",
      severity: "critical",
      message: "High latency on Duo Auth Gateway",
      fingerprint: "duo-lat-#{SecureRandom.hex(4)}",
      status: "unprocessed"
    )
    @alert2 = Alert.create!(
      service: @service1,
      source: "Cisco Catalyst Center",
      severity: "warning",
      message: "Interface flapping on auth gateway",
      fingerprint: "duo-flap-#{SecureRandom.hex(4)}",
      status: "grouped",
      incident: @incident
    )
    @alert3 = Alert.create!(
      service: @service2,
      source: "ThousandEyes",
      severity: "info",
      message: "BGP route change detected",
      fingerprint: "webex-bgp-#{SecureRandom.hex(4)}",
      status: "suppressed_noise",
      incident: @incident
    )
  end

  test "GET /api/v1/alerts returns list of alerts with metadata" do
    get api_v1_alerts_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json["alerts"].is_a?(Array)
    assert_operator json["alerts"].size, :>=, 3
    assert json["total"].present? || json["meta"].present?

    first = json["alerts"].first
    assert first["id"].present?
    assert first["service_name"].present?
    assert first["severity"].present?
    assert first["status"].present?
    assert first["source"].present?
    assert first["fingerprint"].present?
  end

  test "GET /api/v1/alerts filters by service_id" do
    get api_v1_alerts_url, params: { service_id: @service1.id }
    assert_response :success

    json = JSON.parse(response.body)
    assert json["alerts"].all? { |a| a["service_id"] == @service1.id }
    assert_not json["alerts"].any? { |a| a["service_id"] == @service2.id }
  end

  test "GET /api/v1/alerts filters by status" do
    get api_v1_alerts_url, params: { status: "suppressed_noise" }
    assert_response :success

    json = JSON.parse(response.body)
    assert_operator json["alerts"].size, :>=, 1
    assert json["alerts"].all? { |a| a["status"] == "suppressed_noise" }
  end

  test "GET /api/v1/alerts filters by severity" do
    get api_v1_alerts_url, params: { severity: "critical" }
    assert_response :success

    json = JSON.parse(response.body)
    assert_operator json["alerts"].size, :>=, 1
    assert json["alerts"].all? { |a| a["severity"] == "critical" }
  end

  test "GET /api/v1/alerts filters by source" do
    get api_v1_alerts_url, params: { source: "Datadog" }
    assert_response :success

    json = JSON.parse(response.body)
    assert_operator json["alerts"].size, :>=, 1
    assert json["alerts"].all? { |a| a["source"] == "Datadog" }
  end

  test "GET /api/v1/alerts/metrics returns aggregated noise reduction metrics" do
    get metrics_api_v1_alerts_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json.key?("total_alerts")
    assert json.key?("grouped_alerts")
    assert json.key?("suppressed_noise")
    assert json.key?("consolidated_incidents")
    assert json.key?("noise_reduction_ratio")
    assert json.key?("noise_reduction_percentage")

    assert_operator json["total_alerts"], :>=, 3
  end

  test "POST /api/v1/alerts/simulate_storm ingests 30 alerts and groups primary signals" do
    assert_difference("Alert.count", 30) do
      post simulate_storm_api_v1_alerts_url, params: { service_slug: @service1.slug }
    end

    assert_response :success
    json = JSON.parse(response.body)

    summary = json["storm_summary"]
    assert_equal 30, summary["raw_alerts_ingested"]
    assert_equal 28, summary["suppressed_count"]
    assert_equal 2, summary["grouped_count"]
    assert_operator summary["noise_reduction_ratio"].to_f, :>=, 0.90

    assert json["incident"].present?
    assert_equal "SEV-1", json["incident"]["severity"]
    assert_equal @service1.id, json["incident"]["service"]["id"]
  end

  test "POST /api/v1/alerts ingests single alert" do
    assert_difference("Alert.count", 1) do
      post api_v1_alerts_url, params: {
        alert: {
          service_id: @service1.id,
          source: "AWS CloudWatch",
          severity: "warning",
          message: "Standalone test metric anomaly",
          fingerprint: "standalone:cw:#{SecureRandom.hex(4)}"
        }
      }
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert json["success"]
    assert_equal "standalone test metric anomaly", json["alert"]["message"].downcase
  end
end

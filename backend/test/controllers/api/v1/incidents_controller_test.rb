require "test_helper"

class Api::V1::IncidentsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @service = Service.create!(
      name: "Cisco Duo Auth Test Svc",
      slug: "cisco-duo-api-test-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "outage",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )
    @incident = Incident.create!(
      service: @service,
      title: "Active Redis Incident",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Redis::CannotConnectError: pool exhausted"
    )
  end

  test "GET /api/v1/incidents returns list of incidents" do
    get api_v1_incidents_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json["incidents"].is_a?(Array)
    assert json["total"] >= 1
  end

  test "POST /api/v1/incidents creates incident and auto-synthesizes AI pass" do
    assert_difference("Incident.count", 1) do
      post api_v1_incidents_url, params: {
        incident: {
          service_id: @service.id,
          title: "New Synthetic SEV-1 Outage",
          severity: "SEV-1",
          error_signature: "Timeout connecting to auth broker: 504 Gateway Timeout"
        }
      }
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "New Synthetic SEV-1 Outage", json["incident"]["title"]
    assert json["incident"]["ai_triage_pass"].present?
    assert_equal "SEV-1", json["incident"]["severity"]
  end

  test "PATCH /api/v1/incidents/:id/transition acknowledges incident" do
    patch transition_api_v1_incident_url(@incident), params: {
      event: "acknowledge",
      actor: "Elena Rostova"
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "acknowledged", json["incident"]["status"]
    assert_equal "Elena Rostova", json["incident"]["assigned_to"]
  end

  test "POST /api/v1/incidents/:id/apply_ai_pass executes 1-click remediation" do
    post apply_ai_pass_api_v1_incident_url(@incident), params: {
      actor: "PulseGuard AI Agent"
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "resolved", json["incident"]["status"]
    assert json["incident"]["postmortem"].present?

    events = json["incident"]["events"]
    assert events.any? { |e| e["action_type"] == "runbook_executed" }
  end
end

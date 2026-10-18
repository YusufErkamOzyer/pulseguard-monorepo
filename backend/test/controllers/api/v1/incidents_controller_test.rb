# frozen_string_literal: true

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

  test "POST /api/v1/incidents/:id/draft_broadcast generates customer status draft" do
    post draft_broadcast_api_v1_incident_url(@incident), params: { tone: "customer" }
    assert_response :success

    json = JSON.parse(response.body)
    assert json["draft"].present?
    draft = json["draft"]
    assert draft["title"].present?
    assert draft["body"].present?
    assert draft["status_type"].present?
    assert_equal @incident.service_id, draft["service_id"]
  end

  test "POST /api/v1/incidents/:id/publish_broadcast persists status update linked to incident and service" do
    assert_difference("StatusUpdate.count", 1) do
      post publish_broadcast_api_v1_incident_url(@incident), params: {
        status_update: {
          title: "Degraded Auth Latency Notice",
          body: "Users may experience intermittent login delays. Mitigation is active.",
          status_type: "identified"
        }
      }
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert json["status_update"].present?
    update = json["status_update"]
    assert_equal "Degraded Auth Latency Notice", update["title"]
    assert_equal @incident.id, update["incident_id"]
    assert_equal @incident.service_id, update["service_id"]
    assert_equal "identified", update["status_type"]
  end

  test "PATCH /api/v1/incidents/:id/transition with event 'resolve' restores service to healthy and creates recovery status update" do
    @service.update!(status: "outage")

    assert_difference("@service.status_updates.count", 1) do
      patch transition_api_v1_incident_url(@incident), params: {
        event: "resolve",
        actor: "Alex Rivera"
      }
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "resolved", json["incident"]["status"]
    assert_equal "healthy", @service.reload.status

    recovery_update = @service.status_updates.last
    assert_equal "resolved", recovery_update.status_type
    assert_includes recovery_update.title, "Resolved:"
    assert_includes recovery_update.title, @service.name
  end

  test "POST /api/v1/incidents/:id/apply_ai_pass executes 1-click remediation, restores service to healthy, and creates recovery broadcast" do
    @service.update!(status: "outage")
    @incident.update!(status: "triggered")

    assert_difference("@service.status_updates.count", 1) do
      post apply_ai_pass_api_v1_incident_url(@incident), params: {
        actor: "PulseGuard AI Agent"
      }
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "resolved", json["incident"]["status"]
    assert_equal "healthy", @service.reload.status
    assert json["incident"]["postmortem"].present?

    events = json["incident"]["events"]
    assert events.any? { |e| e["action_type"] == "runbook_executed" }

    recovery_update = @service.status_updates.last
    assert_equal "resolved", recovery_update.status_type
    assert_includes recovery_update.title, "Resolved:"
  end

  test "resolving an incident leaves service in outage and creates NO recovery broadcast if another SEV-1 incident remains active" do
    @service.update!(status: "outage")
    incident2 = Incident.create!(
      service: @service,
      title: "Concurrent Cluster Failure",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Raft consensus timeout"
    )

    assert_no_difference("@service.status_updates.count") do
      patch transition_api_v1_incident_url(@incident), params: {
        event: "resolve",
        actor: "Alex Rivera"
      }
    end

    assert_response :success
    assert_equal "resolved", @incident.reload.status
    assert_equal "outage", @service.reload.status
  end
end

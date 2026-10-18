# frozen_string_literal: true

require "test_helper"
require "net/http"
require "json"
require "securerandom"

class StatusPageAndBroadcastStressTest < ActionDispatch::IntegrationTest
  def setup
    @orig_gemini_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = nil

    # Create isolated 5 Cisco services for status page testing
    @cisco_services_specs = [
      { name: "Cisco Duo Auth Gateway", slug: "cisco-duo-auth-#{SecureRandom.hex(4)}", tier: "Tier-1" },
      { name: "Webex Global Media Router", slug: "webex-media-router-#{SecureRandom.hex(4)}", tier: "Tier-1" },
      { name: "Meraki Dashboard Cloud Sync", slug: "meraki-cloud-sync-#{SecureRandom.hex(4)}", tier: "Tier-2" },
      { name: "AppDynamics Ingestion Pipeline", slug: "appdynamics-ingestion-#{SecureRandom.hex(4)}", tier: "Tier-1" },
      { name: "Smart Licensing API", slug: "smart-licensing-api-#{SecureRandom.hex(4)}", tier: "Tier-2" }
    ]

    @services = @cisco_services_specs.map do |spec|
      Service.create!(
        name: spec[:name],
        slug: spec[:slug],
        tier: spec[:tier],
        status: "healthy",
        on_call_engineer: "Test Engineer #{spec[:name].split.first}",
        escalation_policy: "Default Escalation"
      )
    end
    @service_by_name = @services.index_by(&:name)
  end

  def teardown
    ENV["GEMINI_API_KEY"] = @orig_gemini_key
  end

  # =========================================================================
  # 1. DETERMINISTIC FALLBACK MATRIX ACROSS 5 CISCO SERVICES X 4 STATUS TYPES
  # =========================================================================

  test "STRESS-B1: Fallback matrix covers all 5 Cisco services x 4 status types (20 combinations)" do
    status_types = %w[investigating identified monitoring resolved]

    @services.each do |svc|
      inc = Incident.create!(
        service: svc,
        title: "#{svc.name} Telemetry Anomaly",
        severity: "SEV-2",
        status: "triggered",
        error_signature: "Connection pool latency in #{svc.name}"
      )

      status_types.each do |st|
        draft = Ai::StakeholderBroadcastGeneratorService.call(
          incident: inc,
          status_type: st,
          tone: "empathetic"
        )

        assert draft.is_a?(Hash), "Draft for #{svc.slug} [#{st}] must be a Hash"
        assert draft["title"].present?, "Title must not be blank for #{svc.name} [#{st}]"
        assert draft["body"].present?, "Body must not be blank for #{svc.name} [#{st}]"
        assert_operator draft["body"].length, :>=, 30, "Body must be substantial for #{svc.name} [#{st}]"
        assert_includes draft["title"], svc.name, "Title must reference service name for #{svc.name} [#{st}]"
        assert_equal st, draft["status_type"], "status_type must match requested #{st}"
        assert_equal svc.id, draft["service_id"]
        assert_equal svc.name, draft["service_name"]
        assert_equal "deterministic_fallback", draft["mode"]
        assert_equal "gemini-3.8-flash", draft["model"]
        assert Time.iso8601(draft["generated_at"])
      end

      inc.destroy!
    end
  end

  test "STRESS-B2: Incident status automatically maps to status_type when omitted" do
    svc = @services.first
    inc = Incident.create!(service: svc, title: "State Mapping Test", severity: "SEV-2", status: "triggered")

    # triggered -> investigating
    d1 = Ai::StakeholderBroadcastGeneratorService.call(incident: inc)
    assert_equal "investigating", d1["status_type"]

    # acknowledged -> identified
    inc.update!(status: "acknowledged")
    d2 = Ai::StakeholderBroadcastGeneratorService.call(incident: inc)
    assert_equal "identified", d2["status_type"]

    # resolved -> resolved
    inc.update!(status: "resolved")
    d3 = Ai::StakeholderBroadcastGeneratorService.call(incident: inc)
    assert_equal "resolved", d3["status_type"]

    # invalid status_type fallback
    d4 = Ai::StakeholderBroadcastGeneratorService.call(incident: inc, status_type: "unrecognized")
    assert_equal "resolved", d4["status_type"]
  end

  test "STRESS-B3: Custom tone and generic service fallback" do
    generic_svc = Service.create!(
      name: "Custom Telemetry Router",
      slug: "custom-telemetry-router-#{SecureRandom.hex(3)}",
      tier: "Tier-3",
      status: "healthy"
    )
    generic_inc = Incident.create!(
      service: generic_svc,
      title: "Unknown Router Alert",
      severity: "SEV-3",
      status: "triggered"
    )

    draft = Ai::StakeholderBroadcastGeneratorService.call(
      incident: generic_inc,
      tone: "executive",
      status_type: "monitoring"
    )

    assert_equal "executive", draft["tone"]
    assert_equal "monitoring", draft["status_type"]
    assert_includes draft["title"], generic_svc.name
    assert draft["body"].present?
  end

  # =========================================================================
  # 2. GEMINI LIVE MOCKING, MARKDOWN SANITIZATION & FALLBACK RESILIENCE
  # =========================================================================

  test "STRESS-B4: Strips ```json and ``` code fences and extracts JSON amidst conversational chatter" do
    mock_svc = @services.first
    mock_inc = Incident.create!(service: mock_svc, title: "Mock Duo Inc", severity: "SEV-1", status: "triggered")
    ENV["GEMINI_API_KEY"] = "mock-gemini-key"

    gemini_output = <<~CHAT
      Certainly, here is the customer-facing stakeholder broadcast:
      ```json
      {
        "title": "Investigating Authentication Delays on Duo",
        "body": "Engineering responders are actively rerouting session traffic.",
        "status_type": "investigating"
      }
      ```
      Let me know if you need any adjustments.
    CHAT

    mock_resp = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_resp.define_singleton_method(:body) do
      { candidates: [{ content: { parts: [{ text: gemini_output }] } }] }.to_json
    end

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:request) { |_| mock_resp }

    orig_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) { |*| fake_http }

    begin
      draft = Ai::StakeholderBroadcastGeneratorService.call(incident: mock_inc)
      assert_equal "live_gemini", draft["mode"]
      assert_equal "Investigating Authentication Delays on Duo", draft["title"]
      assert_equal "investigating", draft["status_type"]
    ensure
      Net::HTTP.define_singleton_method(:new, orig_new)
    end
  end

  test "STRESS-B5: Gracefully handles thought parts and falls back on malformed JSON or timeout" do
    mock_svc = @services.first
    mock_inc = Incident.create!(service: mock_svc, title: "Mock Duo Inc 2", severity: "SEV-1", status: "triggered")
    ENV["GEMINI_API_KEY"] = "mock-gemini-key"

    # Thinking payload (Gemini 2.0 / 3.8 style)
    thought_resp = Net::HTTPSuccess.new("1.1", "200", "OK")
    thought_resp.define_singleton_method(:body) do
      {
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "I should draft an empathetic response." },
                { text: '{"title": "Duo Recovery Verified", "body": "All MFA sessions healthy.", "status_type": "resolved"}' }
              ]
            }
          }
        ]
      }.to_json
    end

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:request) { |_| thought_resp }

    orig_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) { |*| fake_http }

    begin
      draft = Ai::StakeholderBroadcastGeneratorService.call(incident: mock_inc)
      assert_equal "live_gemini", draft["mode"]
      assert_equal "Duo Recovery Verified", draft["title"]
      assert_equal "resolved", draft["status_type"]
    ensure
      Net::HTTP.define_singleton_method(:new, orig_new)
    end

    # Malformed JSON fallback
    bad_resp = Net::HTTPSuccess.new("1.1", "200", "OK")
    bad_resp.define_singleton_method(:body) do
      { candidates: [{ content: { parts: [{ text: "```json\n{ unclosed_json: " }] } }] }.to_json
    end
    fake_bad_http = Object.new
    fake_bad_http.define_singleton_method(:use_ssl=) { |_| }
    fake_bad_http.define_singleton_method(:open_timeout=) { |_| }
    fake_bad_http.define_singleton_method(:read_timeout=) { |_| }
    fake_bad_http.define_singleton_method(:request) { |_| bad_resp }

    Net::HTTP.define_singleton_method(:new) { |*| fake_bad_http }
    begin
      fallback_draft = Ai::StakeholderBroadcastGeneratorService.call(incident: mock_inc)
      assert_equal "deterministic_fallback", fallback_draft["mode"]
      assert fallback_draft["title"].present?
    ensure
      Net::HTTP.define_singleton_method(:new, orig_new)
    end
  end

  # =========================================================================
  # 3. DRAFT & PUBLISH BROADCAST API ENDPOINTS
  # =========================================================================

  test "STRESS-B6: POST draft_broadcast returns AI/fallback draft with status_type and tone" do
    svc = @services.first
    inc = Incident.create!(service: svc, title: "Draft API Test", severity: "SEV-2", status: "triggered")

    post draft_broadcast_api_v1_incident_url(inc), params: {
      tone: "transparent",
      status_type: "identified"
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert json["success"]
    assert json["draft"].present?
    assert_equal "identified", json["draft"]["status_type"]
    assert_equal "transparent", json["draft"]["tone"]
    assert_equal svc.id, json["draft"]["service_id"]
  end

  test "STRESS-B7: POST publish_broadcast persists StatusUpdate and records IncidentEvent" do
    svc = @services.first
    inc = Incident.create!(service: svc, title: "Publish API Test", severity: "SEV-1", status: "triggered")

    assert_difference "StatusUpdate.count", 1 do
      assert_difference "inc.incident_events.count", 1 do
        post publish_broadcast_api_v1_incident_url(inc), params: {
          status_update: {
            title: "MFA Gateway Mitigation Active",
            body: "Traffic has been shed to standby clusters.",
            status_type: "monitoring",
            published_by: "Alex Rivera (Principal SRE)"
          }
        }
      end
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert json["success"]

    su = StatusUpdate.last
    assert_equal "MFA Gateway Mitigation Active", su.title
    assert_equal "monitoring", su.status_type
    assert_equal inc.id, su.incident_id
    assert_equal svc.id, su.service_id
    assert_equal "Alex Rivera (Principal SRE)", su.published_by

    event = inc.incident_events.last
    assert_equal "broadcast_published", event.action_type
    assert_includes event.detail, "📢 Published customer status broadcast"
  end

  test "STRESS-B8: POST publish_broadcast validates presence of title and body, and validates status_type" do
    svc = @services.first
    inc = Incident.create!(service: svc, title: "Validation Test", severity: "SEV-2", status: "triggered")

    # Blank title
    post publish_broadcast_api_v1_incident_url(inc), params: {
      status_update: { title: "", body: "Some body" }
    }
    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert_equal false, json["success"]

    # Blank body
    post publish_broadcast_api_v1_incident_url(inc), params: {
      status_update: { title: "Some title", body: "" }
    }
    assert_response :unprocessable_entity

    # Invalid status_type
    post publish_broadcast_api_v1_incident_url(inc), params: {
      status_update: { title: "Title", body: "Body", status_type: "invalid_status" }
    }
    assert_response :unprocessable_entity
  end

  # =========================================================================
  # 4. STATUS PAGE API (GLOBAL STATUS, 90D UPTIME, 5 SERVICES, BROADCASTS)
  # =========================================================================

  test "STRESS-B9: GET /api/v1/status_page reflects correct global_status hierarchy (outage > degraded > operational)" do
    # All healthy initially
    @services.each { |s| s.update!(status: "healthy") }
    get api_v1_status_page_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "operational", json["global_status"]

    # 1 degraded
    @service_by_name["Webex Global Media Router"].update!(status: "degraded")
    get api_v1_status_page_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "degraded", json["global_status"]

    # 1 outage (outage takes precedence over degraded)
    @service_by_name["Cisco Duo Auth Gateway"].update!(status: "outage")
    get api_v1_status_page_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "outage", json["global_status"]
  end

  test "STRESS-B10: 90-day uptime math matches baselines and penalty formulas" do
    # duo in outage: 99.95 - 0.45 = 99.50
    duo = @service_by_name["Cisco Duo Auth Gateway"]
    duo.update!(status: "outage")

    # webex in degraded: 99.92 - 0.12 = 99.80
    webex = @service_by_name["Webex Global Media Router"]
    webex.update!(status: "degraded")

    # others healthy
    @service_by_name["Meraki Dashboard Cloud Sync"].update!(status: "healthy")
    @service_by_name["AppDynamics Ingestion Pipeline"].update!(status: "healthy")
    @service_by_name["Smart Licensing API"].update!(status: "healthy")

    get api_v1_status_page_url
    assert_response :success
    json = JSON.parse(response.body)

    svc_map = json["services"].index_by { |s| s["id"] }
    assert_equal 99.50, svc_map[duo.id]["uptime_90d"]
    assert_equal 99.80, svc_map[webex.id]["uptime_90d"]
    assert_equal 99.98, svc_map[@service_by_name["Meraki Dashboard Cloud Sync"].id]["uptime_90d"]
    assert_equal 99.96, svc_map[@service_by_name["AppDynamics Ingestion Pipeline"].id]["uptime_90d"]
    assert_equal 99.99, svc_map[@service_by_name["Smart Licensing API"].id]["uptime_90d"]

    # Check metrics overall uptime
    assert json["metrics"]["overall_uptime_90d"].present?
    assert_operator json["metrics"]["overall_uptime_90d"], :>, 99.0
  end

  # =========================================================================
  # 5. AUTOMATED RECOVERY REFLECTION ON INCIDENT RESOLUTION
  # =========================================================================

  test "STRESS-B11: Transition 'resolve' restores service to healthy and automatically publishes recovery broadcast" do
    svc = @service_by_name["Webex Global Media Router"]
    svc.update!(status: "degraded")

    inc = Incident.create!(
      service: svc,
      title: "Audio Packet Drop Incident",
      severity: "SEV-2",
      status: "triggered"
    )

    initial_broadcasts = svc.status_updates.count

    patch transition_api_v1_incident_url(inc), params: {
      event: "resolve",
      actor: "Elena Rostova (Staff Platform Eng)"
    }
    assert_response :success

    svc.reload
    assert_equal "healthy", svc.status, "Service must recover to healthy"
    assert_equal initial_broadcasts + 1, svc.status_updates.count, "Must publish recovery broadcast"

    recovery = svc.status_updates.last
    assert_equal "resolved", recovery.status_type
    assert_includes recovery.title, "Resolved: #{svc.name}"
    assert_equal inc.id, recovery.incident_id

    # Verify status page reflection
    get api_v1_status_page_url
    sp_json = JSON.parse(response.body)
    sp_svc = sp_json["services"].find { |s| s["id"] == svc.id }
    assert_equal "healthy", sp_svc["status"]
    assert_equal 0, sp_svc["active_incidents_count"]

    latest_bc = sp_json["recent_broadcasts"].first
    assert_equal "resolved", latest_bc["status_type"]
    assert_includes latest_bc["title"], svc.name
  end

  test "STRESS-B12: apply_ai_pass restores service to healthy and automatically publishes recovery broadcast" do
    svc = @service_by_name["Cisco Duo Auth Gateway"]
    svc.update!(status: "outage")

    inc = Incident.create!(
      service: svc,
      title: "Critical Auth Outage",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Connection pool exhausted"
    )

    initial_broadcasts = svc.status_updates.count

    post apply_ai_pass_api_v1_incident_url(inc), params: {
      actor: "PulseGuard AI Agent"
    }
    assert_response :success
    json = JSON.parse(response.body)
    assert json["success"]
    assert_equal "resolved", json["incident"]["status"]

    svc.reload
    assert_equal "healthy", svc.status
    assert_equal initial_broadcasts + 1, svc.status_updates.count

    rec = svc.status_updates.last
    assert_equal "resolved", rec.status_type
    assert_includes rec.title, svc.name
  end

  test "STRESS-B13: Multi-incident concurrency prevents premature recovery broadcast until all incidents resolved" do
    svc = @service_by_name["Meraki Dashboard Cloud Sync"]
    svc.update!(status: "outage")

    inc1 = Incident.create!(service: svc, title: "Meraki Outage 1", severity: "SEV-1", status: "triggered")
    inc2 = Incident.create!(service: svc, title: "Meraki Degraded 2", severity: "SEV-2", status: "triggered")

    updates_before = svc.status_updates.count

    # Resolve SEV-1 incident
    patch transition_api_v1_incident_url(inc1), params: { event: "resolve", actor: "Sarah Chen" }
    assert_response :success

    svc.reload
    assert_equal "degraded", svc.status, "Service must transition to degraded, not healthy"
    assert_equal updates_before, svc.status_updates.count, "No recovery broadcast while incident 2 active"

    # Resolve SEV-2 incident
    patch transition_api_v1_incident_url(inc2), params: { event: "resolve", actor: "Sarah Chen" }
    assert_response :success

    svc.reload
    assert_equal "healthy", svc.status, "Service must now transition to healthy"
    assert_equal updates_before + 1, svc.status_updates.count, "Recovery broadcast published on full resolution"
  end
end

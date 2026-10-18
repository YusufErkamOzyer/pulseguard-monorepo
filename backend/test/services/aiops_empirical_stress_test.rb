# frozen_string_literal: true

require "test_helper"

class AiopsEmpiricalStressTest < ActionDispatch::IntegrationTest
  def setup
    @duo_service = Service.create!(
      name: "Cisco Duo Auth Gateway",
      slug: "cisco-duo-auth-stress-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "healthy",
      on_call_engineer: "Alex Rivera (Principal SRE)",
      escalation_policy: "SRE Pager -> Tier 1 Infra Lead -> VP Ops"
    )

    @webex_service = Service.create!(
      name: "Webex Global Media Router",
      slug: "webex-media-stress-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "healthy",
      on_call_engineer: "Elena Rostova (Staff Platform Eng)",
      escalation_policy: "Media SRE -> Network Lead -> VP Webex Ops"
    )
  end

  # =========================================================================
  # 1. CORE STORM SIMULATOR INGESTION & MATH VERIFICATION
  # =========================================================================

  test "STRESS-1A: Duo Auth alert storm ingests exactly 30 alerts, 2 grouped, 28 suppressed, ratio 0.933 (93.3% >= 90%)" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)

    assert result[:success], "Expected success to be true"
    summary = result[:storm_summary]
    incident = result[:incident]
    alerts = result[:alerts]

    assert_equal 30, summary[:raw_alerts_ingested]
    assert_equal 2, summary[:grouped_count]
    assert_equal 28, summary[:suppressed_count]
    assert_equal 0.933, summary[:noise_reduction_ratio]
    assert_equal 93.3, summary[:noise_reduction_percentage]
    assert_operator summary[:noise_reduction_percentage], :>=, 90.0

    assert_equal 30, alerts.size
    grouped = alerts.select(&:grouped?)
    suppressed = alerts.select(&:suppressed?)

    assert_equal 2, grouped.size
    assert_equal 28, suppressed.size

    # Verify grouped alerts are critical
    grouped.each do |a|
      assert_equal "critical", a.severity
      assert_equal @duo_service.id, a.service_id
      assert_equal incident.id, a.incident_id
    end

    # Verify all fingerprints are strictly unique
    fingerprints = alerts.map(&:fingerprint)
    assert_equal 30, fingerprints.uniq.size, "All 30 fingerprints must be unique"

    # Verify all sources and severities match allowed schemas
    alerts.each do |a|
      assert_includes Alert::SOURCES, a.source
      assert_includes Alert::SEVERITIES, a.severity
      assert a.message.present?
      assert a.fingerprint.present?
      assert a.persisted?
    end
  end

  test "STRESS-1B: Webex alert storm templates generate 30 alerts, 2 grouped, 28 suppressed, ratio 0.933 (93.3%)" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: @webex_service.slug)

    summary = result[:storm_summary]
    incident = result[:incident]
    alerts = result[:alerts]

    assert_equal 30, summary[:raw_alerts_ingested]
    assert_equal 2, summary[:grouped_count]
    assert_equal 28, summary[:suppressed_count]
    assert_equal 0.933, summary[:noise_reduction_ratio]
    assert_equal 93.3, summary[:noise_reduction_percentage]

    assert_equal 30, alerts.size
    assert_equal 2, alerts.count(&:grouped?)
    assert_equal 28, alerts.count(&:suppressed?)

    # Check Webex specific fingerprints
    fingerprints = alerts.map(&:fingerprint)
    assert_equal 30, fingerprints.uniq.size
    assert fingerprints.any? { |fp| fp.include?("bgp_flap") }
    assert fingerprints.any? { |fp| fp.include?("rtp_packet_loss") }
  end

  test "STRESS-1C: Dynamic burst sizes scale properly and compute accurate noise reduction" do
    # Test burst_size: 50
    result_50 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug, burst_size: 50)
    summary_50 = result_50[:storm_summary]
    assert_equal 50, summary_50[:raw_alerts_ingested]
    assert_equal 2, summary_50[:grouped_count]
    assert_equal 48, summary_50[:suppressed_count]
    assert_equal 0.96, summary_50[:noise_reduction_ratio]
    assert_equal 96.0, summary_50[:noise_reduction_percentage]

    # Test burst_size: 10
    result_10 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug, burst_size: 10)
    summary_10 = result_10[:storm_summary]
    assert_equal 10, summary_10[:raw_alerts_ingested]
    assert_equal 2, summary_10[:grouped_count]
    assert_equal 8, summary_10[:suppressed_count]
    assert_equal 0.8, summary_10[:noise_reduction_ratio]
    assert_equal 80.0, summary_10[:noise_reduction_percentage]

    # Test non-positive burst_size falls back to default 30
    result_neg = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug, burst_size: -10)
    assert_equal 30, result_neg[:storm_summary][:raw_alerts_ingested]

    result_zero = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug, burst_size: 0)
    assert_equal 30, result_zero[:storm_summary][:raw_alerts_ingested]
  end

  # =========================================================================
  # 2. INCIDENT ASSOCIATION & INCIDENTEVENT TIMELINE CREATION
  # =========================================================================

  test "STRESS-2A: Storm creates SEV-1 incident, transitions service to outage, and creates timeline events" do
    assert_equal "healthy", @duo_service.status

    result = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    incident = result[:incident]

    # Service status transitioned to outage
    assert_equal "outage", @duo_service.reload.status

    # Incident attributes
    assert_equal "SEV-1", incident.severity
    assert_equal "triggered", incident.status
    assert_includes incident.title, "Alert Storm"
    assert incident.ai_triage_pass.present?
    assert incident.ai_triage_pass["suggested_runbook_command"].present?

    # Timeline events
    events = incident.incident_events.order(created_at: :asc)
    assert_operator events.count, :>=, 2

    # Check triggered event
    triggered_evt = events.find_by(action_type: "triggered")
    assert_not_nil triggered_evt
    assert_equal "PulseGuard AIOps Engine", triggered_evt.actor

    # Check aiops_alert_storm event
    storm_evt = events.find_by(action_type: "aiops_alert_storm")
    assert_not_nil storm_evt
    assert_equal "PulseGuard AIOps Engine", storm_evt.actor
    assert_includes storm_evt.detail, "30 raw alerts"
    assert_includes storm_evt.detail, "2 primary incident signals"
    assert_includes storm_evt.detail, "28 noise alerts"
    assert_includes storm_evt.detail, "93.3% noise reduction"
  end

  test "STRESS-2B: Reuses existing active incident without creating duplicate incident" do
    # Step 1: Trigger first storm
    res1 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    inc1 = res1[:incident]
    initial_incident_count = @duo_service.incidents.count

    # Step 2: Trigger second storm on same service
    res2 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    inc2 = res2[:incident]

    # Must reuse the same active incident
    assert_equal inc1.id, inc2.id
    assert_equal initial_incident_count, @duo_service.incidents.count

    # Incident now has 60 total alerts (4 grouped, 56 suppressed)
    assert_equal 60, inc1.alerts.count
    assert_equal 4, inc1.grouped_alerts.count
    assert_equal 56, inc1.suppressed_alerts.count

    # Timeline has 2 aiops_alert_storm events
    storm_events = inc1.incident_events.where(action_type: "aiops_alert_storm")
    assert_equal 2, storm_events.count
  end

  test "STRESS-2C: Explicit incident_id attaches alerts to that incident" do
    custom_incident = Incident.create!(
      service: @webex_service,
      title: "Manual War Room Incident",
      severity: "SEV-2",
      status: "acknowledged",
      error_signature: "Manual triage ongoing"
    )

    result = Aiops::AlertStormSimulatorService.call(
      service_slug: @webex_service.slug,
      incident_id: custom_incident.id
    )

    assert_equal custom_incident.id, result[:incident].id
    assert_equal 30, custom_incident.alerts.count
    assert_not_nil custom_incident.incident_events.find_by(action_type: "aiops_alert_storm")
  end

  # =========================================================================
  # 3. MULTI-FILTER ALERTS API & METRICS ENDPOINT
  # =========================================================================

  test "STRESS-3A: GET /api/v1/alerts multi-filtering across all combinations" do
    # Trigger storms on both services to populate alerts
    Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    Aiops::AlertStormSimulatorService.call(service_slug: @webex_service.slug)

    # 1. Filter by service_id
    get api_v1_alerts_url, params: { service_id: @duo_service.id }
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal 30, json["alerts"].size
    assert json["alerts"].all? { |a| a["service_id"] == @duo_service.id }

    # 2. Filter by service_slug
    get api_v1_alerts_url, params: { service_slug: @webex_service.slug }
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal 30, json["alerts"].size
    assert json["alerts"].all? { |a| a["service_id"] == @webex_service.id }

    # 3. Filter by status: grouped
    get api_v1_alerts_url, params: { status: "grouped" }
    assert_response :success
    json = JSON.parse(response.body)
    assert_operator json["alerts"].size, :>=, 4
    assert json["alerts"].all? { |a| a["status"] == "grouped" }

    # 4. Multi-filter: service_slug + status
    get api_v1_alerts_url, params: { service_slug: @duo_service.slug, status: "grouped" }
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal 2, json["alerts"].size
    assert json["alerts"].all? { |a| a["status"] == "grouped" && a["service_id"] == @duo_service.id }

    # 5. Multi-filter: status + severity + source
    get api_v1_alerts_url, params: { status: "grouped", severity: "critical", source: "Datadog" }
    assert_response :success
    json = JSON.parse(response.body)
    assert_operator json["alerts"].size, :>=, 1
    assert json["alerts"].all? { |a| a["status"] == "grouped" && a["severity"] == "critical" && a["source"] == "Datadog" }

    # 6. 'all' wildcard parameters do not restrict scope
    get api_v1_alerts_url, params: { service_id: "all", status: "all", severity: "all", source: "all", limit: 100 }
    assert_response :success
    json = JSON.parse(response.body)
    assert_operator json["meta"]["total"], :>=, 60
    assert_operator json["alerts"].size, :>=, 60

    # 7. Pagination bounds: negative page defaults to 1, excessive limit capped at 200
    get api_v1_alerts_url, params: { page: -5, limit: 999 }
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal 1, json["meta"]["page"]
    assert_equal 200, json["meta"]["per_page"]
  end

  test "STRESS-3B: GET /api/v1/alerts/metrics computes accurate global and per-service noise reduction" do
    Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    Aiops::AlertStormSimulatorService.call(service_slug: @webex_service.slug)

    # 1. Global metrics
    get metrics_api_v1_alerts_url
    assert_response :success
    global = JSON.parse(response.body)

    assert_operator global["total_alerts"], :>=, 60
    assert_operator global["grouped_alerts"], :>=, 4
    assert_operator global["suppressed_noise"], :>=, 56
    assert_operator global["noise_reduction_ratio"].to_f, :>=, 0.90
    assert_operator global["noise_reduction_percentage"].to_f, :>=, 90.0
    assert_operator global["consolidated_incidents"], :>=, 2

    # Math consistency
    expected_ratio = (global["suppressed_noise"].to_f / (global["grouped_alerts"] + global["suppressed_noise"])).round(3)
    assert_equal expected_ratio, global["noise_reduction_ratio"].to_f

    # 2. Per-service metrics (by service_id)
    get metrics_api_v1_alerts_url, params: { service_id: @duo_service.id }
    assert_response :success
    duo_metrics = JSON.parse(response.body)
    assert_equal 30, duo_metrics["total_alerts"]
    assert_equal 2, duo_metrics["grouped_alerts"]
    assert_equal 28, duo_metrics["suppressed_noise"]
    assert_equal 0.933, duo_metrics["noise_reduction_ratio"].to_f
    assert_equal 93.3, duo_metrics["noise_reduction_percentage"].to_f

    # 3. Per-service metrics (by service_slug)
    get metrics_api_v1_alerts_url, params: { service_slug: @webex_service.slug }
    assert_response :success
    webex_metrics = JSON.parse(response.body)
    assert_equal 30, webex_metrics["total_alerts"]
    assert_equal 2, webex_metrics["grouped_alerts"]
    assert_equal 28, webex_metrics["suppressed_noise"]
    assert_equal 0.933, webex_metrics["noise_reduction_ratio"].to_f
    assert_equal 93.3, webex_metrics["noise_reduction_percentage"].to_f
  end

  # =========================================================================
  # 4. EDGE CASES, ERROR HANDLING & CONCURRENCY
  # =========================================================================

  test "STRESS-4A: POST /api/v1/alerts/simulate_storm with invalid service_slug returns 404 Not Found" do
    post simulate_storm_api_v1_alerts_url, params: { service_slug: "nonexistent-service-slug-xyz" }
    assert_response :not_found
    json = JSON.parse(response.body)
    assert_equal "Target service not found", json["error"]
  end

  test "STRESS-4B: POST /api/v1/alerts/simulate_storm with invalid service_id returns 404 Not Found" do
    post simulate_storm_api_v1_alerts_url, params: { service_id: 99999999 }
    assert_response :not_found
    json = JSON.parse(response.body)
    assert_equal "Target service not found", json["error"]
  end

  test "STRESS-4C: POST /api/v1/alerts single ingestion validation errors return 422" do
    # Missing source and message
    post api_v1_alerts_url, params: {
      alert: {
        service_id: @duo_service.id,
        source: "InvalidSource",
        severity: "invalid_severity"
      }
    }
    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert json["error"].present?

    # Invalid service
    post api_v1_alerts_url, params: {
      alert: {
        service_id: 99999999,
        source: "Datadog",
        message: "Test message"
      }
    }
    assert_response :unprocessable_entity
    json = JSON.parse(response.body)
    assert_equal "Service not found", json["error"]
  end

  test "STRESS-4D: Concurrent storm triggers execute cleanly without database locks or crashes" do
    threads = []
    results = []
    errors = []

    3.times do
      threads << Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          res = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
          results << res
        rescue StandardError => e
          errors << e
        end
      end
    end

    threads.each(&:join)

    assert_empty errors, "Expected zero errors during concurrent storm triggers: #{errors.map(&:message).join(', ')}"
    assert_equal 3, results.size
    results.each do |res|
      assert res[:success]
      assert_equal 30, res[:storm_summary][:raw_alerts_ingested]
    end

    # Total alerts for this service should now be 3 * 30 = 90
    assert_equal 90, @duo_service.alerts.count
  end

  test "STRESS-4E: Metrics API behavior with nonexistent service_slug vs nonexistent service_id" do
    # When service_id is nonexistent integer
    get metrics_api_v1_alerts_url, params: { service_id: 999999 }
    assert_response :success
    json_by_id = JSON.parse(response.body)
    assert_equal 0, json_by_id["total_alerts"]
    assert_equal 0, json_by_id["grouped_alerts"]

    # When service_slug is nonexistent string:
    # In index action, service ? scope.where(...) : scope.none returns 0 alerts:
    get api_v1_alerts_url, params: { service_slug: "nonexistent-slug" }
    assert_response :success
    index_json = JSON.parse(response.body)
    assert_equal 0, index_json["meta"]["total"]
    assert_empty index_json["alerts"]

    # In metrics action, if svc is nil, scope is not scoped to scope.none:
    get metrics_api_v1_alerts_url, params: { service_slug: "nonexistent-slug" }
    assert_response :success
    json_by_slug = JSON.parse(response.body)
    # Empirically confirm this returns global total instead of 0
    assert_equal Alert.count, json_by_slug["total_alerts"]
  end

  # =========================================================================
  # 5. TRANSACTION ROLLBACK, INCIDENT LIFECYCLE & MODEL INVARIANTS
  # =========================================================================

  test "STRESS-5A: Simulating storm after resolving previous incident creates a new active incident" do
    # Trigger storm 1
    res1 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    inc1 = res1[:incident]
    assert_equal "triggered", inc1.status

    # Resolve incident 1
    inc1.resolve!("Alex Rivera")
    assert_equal "resolved", inc1.reload.status

    # Trigger storm 2
    res2 = Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
    inc2 = res2[:incident]

    # Verify a new incident was created and NOT the resolved one
    assert_not_equal inc1.id, inc2.id
    assert_equal "triggered", inc2.status
    assert_equal 30, inc2.alerts.count
    assert_equal "outage", @duo_service.reload.status
  end

  test "STRESS-5B: Cross-service incident_id is ignored to prevent cross-service alert association" do
    # Incident belonging to Webex service
    webex_incident = Incident.create!(
      service: @webex_service,
      title: "Webex Incident",
      severity: "SEV-1",
      status: "triggered"
    )

    # Attempt to trigger storm on Duo Auth service while passing Webex incident id
    res = Aiops::AlertStormSimulatorService.call(
      service_slug: @duo_service.slug,
      incident_id: webex_incident.id
    )

    # Duo service must NOT attach alerts to webex_incident
    duo_incident = res[:incident]
    assert_not_equal webex_incident.id, duo_incident.id
    assert_equal @duo_service.id, duo_incident.service_id
    assert_equal 0, webex_incident.alerts.count
    assert_equal 30, duo_incident.alerts.count
  end

  test "STRESS-5C: Alert model validation invariants on source, severity, status, and fingerprint" do
    # Invalid source
    a1 = Alert.new(service: @duo_service, source: "Prometheus", severity: "warning", message: "msg", fingerprint: "fp-1")
    assert_not a1.valid?
    assert_includes a1.errors[:source], "is not included in the list"

    # Invalid severity
    a2 = Alert.new(service: @duo_service, source: "Datadog", severity: "extreme", message: "msg", fingerprint: "fp-2")
    assert_not a2.valid?
    assert_includes a2.errors[:severity], "is not included in the list"

    # Invalid status
    a3 = Alert.new(service: @duo_service, source: "Datadog", severity: "info", status: "corrupted", message: "msg", fingerprint: "fp-3")
    assert_not a3.valid?
    assert_includes a3.errors[:status], "is not included in the list"

    # group_into! with unpersisted incident raises ArgumentError
    valid_alert = Alert.create!(service: @duo_service, source: "Datadog", severity: "info", message: "msg", fingerprint: "fp-4")
    assert_raises(ArgumentError) do
      valid_alert.group_into!(Incident.new(title: "Unpersisted"))
    end

    # suppress! with unpersisted incident raises ArgumentError
    assert_raises(ArgumentError) do
      valid_alert.suppress!(Incident.new(title: "Unpersisted"))
    end
  end

  test "STRESS-5D: Transaction rollback on failure leaves zero orphan alerts or partial incidents" do
    initial_alert_count = Alert.count
    initial_incident_count = Incident.count

    singleton = class << Alert; self; end
    singleton.send(:alias_method, :orig_create!, :create!)
    singleton.send(:define_method, :create!) do |*args|
      raise ActiveRecord::RecordInvalid.new(Alert.new)
    end

    begin
      assert_raises(ActiveRecord::RecordInvalid) do
        Aiops::AlertStormSimulatorService.call(service_slug: @duo_service.slug)
      end
    ensure
      singleton.send(:alias_method, :create!, :orig_create!)
      singleton.send(:remove_method, :orig_create!)
    end

    # Verify zero alerts or incidents created due to transaction rollback
    assert_equal initial_alert_count, Alert.count, "Transaction must rollback all alerts on failure"
    assert_equal initial_incident_count, Incident.count, "Transaction must rollback incident on failure"
  end
end

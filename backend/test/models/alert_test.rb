require "test_helper"

class AlertTest < ActiveSupport::TestCase
  def setup
    @service = Service.create!(
      name: "Cisco Duo Auth Test Service",
      slug: "cisco-duo-test-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "outage",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )

    @incident = Incident.create!(
      service: @service,
      title: "Redis Connection Storm",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Redis::CannotConnectError: Connection pool exhausted."
    )

    @valid_attributes = {
      service: @service,
      source: "Cisco Catalyst Center",
      severity: "critical",
      message: "High latency detected on Duo Auth gateway",
      fingerprint: "duo-auth-latency-#{SecureRandom.hex(6)}",
      status: "unprocessed",
      metadata: { "interface" => "GigabitEthernet0/1", "jitter_ms" => 42 }
    }
  end

  test "valid alert saves successfully" do
    alert = Alert.new(@valid_attributes)
    assert alert.valid?
    assert alert.save
  end

  test "requires service" do
    alert = Alert.new(@valid_attributes.except(:service))
    assert_not alert.valid?
    assert_includes alert.errors[:service], "must exist"
  end

  test "requires source" do
    alert = Alert.new(@valid_attributes.merge(source: nil))
    assert_not alert.valid?
    assert_includes alert.errors[:source], "can't be blank"
  end

  test "validates source inclusion in SOURCES" do
    Alert::SOURCES.each do |src|
      alert = Alert.new(@valid_attributes.merge(source: src))
      assert alert.valid?, "Expected '#{src}' to be a valid source"
    end

    invalid_alert = Alert.new(@valid_attributes.merge(source: "Unknown SolarWinds Monitor"))
    assert_not invalid_alert.valid?
    assert_includes invalid_alert.errors[:source], "is not included in the list"
  end

  test "requires severity" do
    alert = Alert.new(@valid_attributes.merge(severity: nil))
    alert.valid?
    assert_equal "warning", alert.severity
  end

  test "validates severity inclusion in SEVERITIES" do
    Alert::SEVERITIES.each do |sev|
      alert = Alert.new(@valid_attributes.merge(severity: sev))
      assert alert.valid?, "Expected '#{sev}' to be a valid severity"
    end

    invalid_alert = Alert.new(@valid_attributes.merge(severity: "catastrophic"))
    assert_not invalid_alert.valid?
    assert_includes invalid_alert.errors[:severity], "is not included in the list"
  end

  test "requires message" do
    alert = Alert.new(@valid_attributes.merge(message: nil))
    assert_not alert.valid?
    assert_includes alert.errors[:message], "can't be blank"
  end

  test "requires fingerprint" do
    alert = Alert.new(@valid_attributes.merge(fingerprint: nil))
    assert_not alert.valid?
    assert_includes alert.errors[:fingerprint], "can't be blank"
  end

  test "validates status inclusion in STATUSES" do
    Alert::STATUSES.each do |st|
      alert = Alert.new(@valid_attributes.merge(status: st))
      assert alert.valid?, "Expected '#{st}' to be a valid status"
    end

    invalid_alert = Alert.new(@valid_attributes.merge(status: "closed"))
    assert_not invalid_alert.valid?
    assert_includes invalid_alert.errors[:status], "is not included in the list"
  end

  test "defaults status to unprocessed and metadata to empty hash on create" do
    alert = Alert.create!(
      service: @service,
      source: "Datadog",
      message: "JVM Memory Pressure",
      fingerprint: "jvm-heap-#{SecureRandom.hex(4)}"
    )
    assert_equal "unprocessed", alert.status
    assert_equal "warning", alert.severity
    assert_equal({}, alert.metadata)
  end

  test "belongs to incident optionally" do
    alert_without_incident = Alert.create!(@valid_attributes.merge(incident: nil))
    assert_nil alert_without_incident.incident

    alert_with_incident = Alert.create!(@valid_attributes.merge(incident: @incident, status: "grouped"))
    assert_equal @incident, alert_with_incident.incident
    assert_includes @incident.alerts, alert_with_incident
  end

  test "service destroy deletes associated alerts" do
    alert = Alert.create!(@valid_attributes)
    alert_id = alert.id

    assert_difference("Alert.count", -1) do
      @service.destroy
    end
    assert_not Alert.exists?(alert_id)
  end

  test "incident destroy nullifies incident_id on alert" do
    alert = Alert.create!(@valid_attributes.merge(incident: @incident, status: "grouped"))
    alert_id = alert.id

    @incident.destroy
    assert Alert.exists?(alert_id)
    assert_nil alert.reload.incident_id
  end

  test "scopes filter alerts by status" do
    unprocessed = Alert.create!(@valid_attributes.merge(status: "unprocessed", fingerprint: "fp-1-#{SecureRandom.hex(3)}"))
    grouped = Alert.create!(@valid_attributes.merge(status: "grouped", incident: @incident, fingerprint: "fp-2-#{SecureRandom.hex(3)}"))
    suppressed = Alert.create!(@valid_attributes.merge(status: "suppressed_noise", fingerprint: "fp-3-#{SecureRandom.hex(3)}"))

    assert_includes Alert.unprocessed, unprocessed
    assert_not_includes Alert.unprocessed, grouped
    assert_not_includes Alert.unprocessed, suppressed

    assert_includes Alert.grouped, grouped
    assert_not_includes Alert.grouped, unprocessed
    assert_not_includes Alert.grouped, suppressed

    assert_includes Alert.suppressed, suppressed
    assert_not_includes Alert.suppressed, unprocessed
    assert_not_includes Alert.suppressed, grouped
  end

  test "recent scope orders by created_at desc" do
    a1 = Alert.create!(@valid_attributes.merge(fingerprint: "fp-a-#{SecureRandom.hex(3)}", created_at: 2.hours.ago))
    a2 = Alert.create!(@valid_attributes.merge(fingerprint: "fp-b-#{SecureRandom.hex(3)}", created_at: 10.minutes.ago))

    recent_ids = Alert.recent.pluck(:id)
    assert_operator recent_ids.index(a2.id), :<, recent_ids.index(a1.id)
  end

  test "group_into! transitions status to grouped and links incident" do
    alert = Alert.create!(@valid_attributes)
    assert alert.unprocessed?

    alert.group_into!(@incident)

    assert alert.grouped?
    assert_equal "grouped", alert.status
    assert_equal @incident.id, alert.incident_id
  end

  test "group_into! raises ArgumentError when passed nil or unpersisted incident" do
    alert = Alert.create!(@valid_attributes)
    unpersisted_incident = Incident.new(service: @service, title: "Unsaved", severity: "SEV-1", status: "triggered")

    error = assert_raises(ArgumentError) { alert.group_into!(nil) }
    assert_equal "Incident must be a persisted Incident", error.message

    error = assert_raises(ArgumentError) { alert.group_into!(unpersisted_incident) }
    assert_equal "Incident must be a persisted Incident", error.message

    error = assert_raises(ArgumentError) { alert.group_into!("invalid") }
    assert_equal "Incident must be a persisted Incident", error.message

    assert_equal "unprocessed", alert.reload.status
    assert_nil alert.reload.incident_id
  end

  test "suppress! transitions status to suppressed_noise" do
    alert = Alert.create!(@valid_attributes)
    alert.suppress!(@incident)

    assert alert.suppressed?
    assert_equal "suppressed_noise", alert.status
    assert_equal @incident.id, alert.incident_id
  end

  test "suppress! handles standalone suppression and guards against unpersisted incident" do
    alert = Alert.create!(@valid_attributes)
    unpersisted_incident = Incident.new(service: @service, title: "Unsaved", severity: "SEV-1", status: "triggered")

    # Standalone suppression without incident
    alert.suppress!
    assert alert.suppressed?
    assert_nil alert.incident_id

    # Suppress with nil explicitly
    alert.update!(status: "unprocessed")
    alert.suppress!(nil)
    assert alert.suppressed?
    assert_nil alert.incident_id

    # Suppress with unpersisted incident raises ArgumentError
    error = assert_raises(ArgumentError) { alert.suppress!(unpersisted_incident) }
    assert_equal "Incident must be a persisted Incident", error.message

    # Suppress with invalid object raises ArgumentError
    error = assert_raises(ArgumentError) { alert.suppress!("invalid") }
    assert_equal "Incident must be a persisted Incident", error.message
  end

  test "service_name and as_json serialization" do
    alert = Alert.create!(@valid_attributes)
    assert_equal @service.name, alert.service_name

    json = alert.as_json
    assert_equal @service.name, json["service_name"]
    assert_equal "critical", json["severity"]
    assert_equal alert.fingerprint, json["fingerprint"]
  end
end

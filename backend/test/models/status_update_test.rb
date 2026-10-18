require "test_helper"

class StatusUpdateTest < ActiveSupport::TestCase
  def setup
    @service = Service.create!(
      name: "Webex Global Media Router",
      slug: "webex-media-router-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "degraded",
      on_call_engineer: "Elena Rostova (Staff Platform Eng)"
    )

    @incident = Incident.create!(
      service: @service,
      title: "RTP Jitter Buffer Overflow",
      severity: "SEV-2",
      status: "triggered",
      error_signature: "Audio packet loss exceeds 4.5% across EMEA region."
    )

    @valid_attributes = {
      service: @service,
      incident: @incident,
      title: "Investigating Elevated Latency on Webex Media Router",
      body: "Engineers are actively investigating RTP audio jitter in EMEA. Media traffic is rerouting to Frankfurt PoP.",
      status_type: "investigating",
      published_by: "PulseGuard AI Broadcast",
      published_at: Time.current
    }
  end

  test "valid status update saves successfully" do
    su = StatusUpdate.new(@valid_attributes)
    assert su.valid?
    assert su.save
  end

  test "requires service" do
    su = StatusUpdate.new(@valid_attributes.except(:service))
    assert_not su.valid?
    assert_includes su.errors[:service], "must exist"
  end

  test "requires title" do
    su = StatusUpdate.new(@valid_attributes.merge(title: nil))
    assert_not su.valid?
    assert_includes su.errors[:title], "can't be blank"
  end

  test "requires body" do
    su = StatusUpdate.new(@valid_attributes.merge(body: nil))
    assert_not su.valid?
    assert_includes su.errors[:body], "can't be blank"
  end

  test "validates inclusion of status_type in STATUS_TYPES" do
    StatusUpdate::STATUS_TYPES.each do |st|
      su = StatusUpdate.new(@valid_attributes.merge(status_type: st))
      assert su.valid?, "Expected '#{st}' to be a valid status_type"
    end

    invalid = StatusUpdate.new(@valid_attributes.merge(status_type: "pending_review"))
    assert_not invalid.valid?
    assert_includes invalid.errors[:status_type], "is not included in the list"
  end

  test "defaults published_by, status_type, and published_at on create if blank" do
    su = StatusUpdate.create!(
      service: @service,
      title: "Automated System Alert",
      body: "Health check degraded."
    )

    assert_equal "investigating", su.status_type
    assert_equal "PulseGuard AI Broadcast", su.published_by
    assert_not_nil su.published_at
  end

  test "belongs to incident optionally" do
    su_without_incident = StatusUpdate.create!(@valid_attributes.merge(incident: nil))
    assert_nil su_without_incident.incident

    su_with_incident = StatusUpdate.create!(@valid_attributes)
    assert_equal @incident, su_with_incident.incident
    assert_includes @incident.status_updates, su_with_incident
  end

  test "service destroy deletes associated status updates" do
    su = StatusUpdate.create!(@valid_attributes)
    su_id = su.id

    assert_difference("StatusUpdate.count", -1) do
      @service.destroy
    end
    assert_not StatusUpdate.exists?(su_id)
  end

  test "incident destroy nullifies incident_id on status update" do
    su = StatusUpdate.create!(@valid_attributes)
    su_id = su.id

    @incident.destroy
    assert StatusUpdate.exists?(su_id)
    assert_nil su.reload.incident_id
  end

  test "scopes order recent and filter by status_type" do
    old_update = StatusUpdate.create!(@valid_attributes.merge(published_at: 3.hours.ago, status_type: "investigating"))
    new_update = StatusUpdate.create!(@valid_attributes.merge(published_at: 10.minutes.ago, status_type: "resolved"))

    recent_ids = StatusUpdate.recent.pluck(:id)
    assert_operator recent_ids.index(new_update.id), :<, recent_ids.index(old_update.id)

    assert_includes StatusUpdate.resolved, new_update
    assert_not_includes StatusUpdate.resolved, old_update
    assert_includes StatusUpdate.investigating, old_update
  end

  test "service_name and as_json serialization" do
    su = StatusUpdate.create!(@valid_attributes)
    assert_equal @service.name, su.service_name

    json = su.as_json
    assert_equal @service.name, json["service_name"]
    assert_equal "investigating", json["status_type"]
    assert_equal su.title, json["title"]
  end

  test "resolving last incident automatically publishes recovery status update" do
    @service.update!(status: "outage")
    assert_difference("@service.status_updates.count", 1) do
      @incident.resolve!("Alex Rivera")
    end
    recovery_update = @service.status_updates.last
    assert_equal "resolved", recovery_update.status_type
    assert_includes recovery_update.title, "Resolved:"
    assert_equal "healthy", @service.reload.status
  end
end

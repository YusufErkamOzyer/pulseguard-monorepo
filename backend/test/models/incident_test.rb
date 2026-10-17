require "test_helper"

class IncidentTest < ActiveSupport::TestCase
  def setup
    @service = Service.create!(
      name: "Cisco Duo Auth Test",
      slug: "cisco-duo-test-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "outage",
      on_call_engineer: "Alex Rivera (Principal SRE)"
    )
    @incident = Incident.create!(
      service: @service,
      title: "Redis Pool Exhaustion Test",
      severity: "SEV-1",
      status: "triggered",
      error_signature: "Redis::CannotConnectError: Connection pool exhausted."
    )
  end

  test "acknowledge! transitions status and creates event" do
    assert_equal "triggered", @incident.status
    @incident.acknowledge!("Elena Rostova")

    assert_equal "acknowledged", @incident.status
    assert_equal "Elena Rostova", @incident.assigned_to
    assert_not_nil @incident.acknowledged_at

    ack_event = @incident.incident_events.find_by(action_type: "acknowledged")
    assert_not_nil ack_event
    assert_equal "Elena Rostova", ack_event.actor
  end

  test "resolve! transitions status and resets service to healthy when no other incidents" do
    @incident.resolve!("Alex Rivera")

    assert_equal "resolved", @incident.status
    assert_not_nil @incident.resolved_at
    assert_equal "healthy", @service.reload.status

    resolve_event = @incident.incident_events.find_by(action_type: "resolved")
    assert_not_nil resolve_event
    assert_equal "Alex Rivera", resolve_event.actor
  end

  test "apply_ai_pass! executes runbook, resolves incident and drafts postmortem" do
    @incident.apply_ai_pass!("PulseGuard AI Agent")

    assert_equal "resolved", @incident.status
    assert_equal "healthy", @service.reload.status

    # Check runbook event created
    runbook_event = @incident.incident_events.find_by(action_type: "runbook_executed")
    assert_not_nil runbook_event
    assert_includes runbook_event.detail, "Executed automated runbook"

    # Check postmortem created
    assert_not_nil @incident.postmortem
    assert_equal false, @incident.postmortem.published
    assert_includes @incident.postmortem.root_cause, "Redis connection pool"
  end
end

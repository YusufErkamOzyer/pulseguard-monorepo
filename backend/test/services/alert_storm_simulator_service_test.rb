# frozen_string_literal: true

require "test_helper"

class AlertStormSimulatorServiceTest < ActiveSupport::TestCase
  def setup
    @service = Service.create!(
      name: "Cisco Duo Auth Gateway",
      slug: "cisco-duo-auth-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "healthy",
      on_call_engineer: "Alex Rivera (Principal SRE)",
      escalation_policy: "SRE Pager -> Tier 1 Infra Lead -> VP Ops"
    )
  end

  test "simulates burst of 30 alerts, grouping 2 and suppressing 28 as noise" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: @service.slug)

    assert result.is_a?(Hash)
    summary = result[:storm_summary] || result["storm_summary"]
    incident = result[:incident] || result["incident"]

    assert_not_nil summary, "Expected storm_summary in result"
    assert_not_nil incident, "Expected incident in result"

    raw_count = summary[:raw_alerts_ingested] || summary["raw_alerts_ingested"]
    grouped_count = summary[:grouped_count] || summary["grouped_count"]
    suppressed_count = summary[:suppressed_count] || summary["suppressed_count"]

    assert_equal 30, raw_count
    assert_equal 2, grouped_count
    assert_equal 28, suppressed_count

    noise_ratio = (summary[:noise_reduction_ratio] || summary["noise_reduction_ratio"]).to_f
    assert_operator noise_ratio, :>=, 0.90

    assert incident.persisted?
    assert_equal "SEV-1", incident.severity
    assert_equal "triggered", incident.status
    assert_equal @service.id, incident.service_id

    assert_equal 30, incident.alerts.count
    assert_equal 2, incident.grouped_alerts.count
    assert_equal 28, incident.suppressed_alerts.count
  end

  test "creates timeline event with action_type aiops_alert_storm" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: @service.slug)
    incident = result[:incident] || result["incident"]

    storm_event = incident.incident_events.find_by(action_type: "aiops_alert_storm")
    assert_not_nil storm_event, "Expected incident event with action_type 'aiops_alert_storm'"
    assert_equal "PulseGuard AIOps Engine", storm_event.actor
    assert_includes storm_event.detail.downcase, "noise"
  end

  test "sets service status to outage upon SEV-1 storm creation" do
    Aiops::AlertStormSimulatorService.call(service_slug: @service.slug)
    assert_equal "outage", @service.reload.status
  end

  test "falls back to first available service if service_slug is nil or empty" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: nil)
    incident = result[:incident] || result["incident"]
    assert incident.present?
    assert incident.persisted?

    summary = result[:storm_summary] || result["storm_summary"]
    raw_count = summary[:raw_alerts_ingested] || summary["raw_alerts_ingested"]
    assert_equal 30, raw_count
  end

  test "ensures all 30 generated alerts have valid sources, severities, and unique fingerprints" do
    result = Aiops::AlertStormSimulatorService.call(service_slug: @service.slug)
    incident = result[:incident] || result["incident"]

    alerts = incident.alerts
    assert_equal 30, alerts.count

    fingerprints = alerts.pluck(:fingerprint)
    assert_equal 30, fingerprints.uniq.count, "All fingerprints in storm burst must be unique"

    alerts.each do |alert|
      assert_includes Alert::SOURCES, alert.source
      assert_includes Alert::SEVERITIES, alert.severity
      assert alert.message.present?
    end
  end
end

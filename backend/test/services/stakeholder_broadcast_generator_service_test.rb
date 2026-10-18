# frozen_string_literal: true

require "test_helper"
require "net/http"
require "json"

class StakeholderBroadcastGeneratorServiceTest < ActiveSupport::TestCase
  def setup
    @service = Service.create!(
      name: "Webex Global Media Router",
      slug: "webex-media-router-#{SecureRandom.hex(4)}",
      tier: "Tier-1",
      status: "degraded",
      on_call_engineer: "Elena Rostova (Staff Platform Eng)",
      escalation_policy: "Audio/Video Escalation Chain -> VP Ops"
    )

    @incident = Incident.create!(
      service: @service,
      title: "RTP Media Stream Degradation",
      severity: "SEV-2",
      status: "triggered",
      error_signature: "Audio packet loss exceeds 4.5% across EMEA region."
    )
  end

  test "generates deterministic customer broadcast fallback when GEMINI_API_KEY is missing" do
    orig_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = nil

    begin
      result = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident)

      assert result.is_a?(Hash)
      title = result["title"] || result[:title]
      body = result["body"] || result[:body]
      status_type = result["status_type"] || result[:status_type]
      tone = result["tone"] || result[:tone]
      service_id = result["service_id"] || result[:service_id]

      assert title.present?, "Broadcast title must not be blank"
      assert body.present?, "Broadcast body must not be blank"
      assert_includes title, @service.name
      assert_includes StatusUpdate::STATUS_TYPES, status_type
      assert_equal @service.id, service_id
      assert tone.present?
    ensure
      ENV["GEMINI_API_KEY"] = orig_key
    end
  end

  test "supports tone customization (e.g. empathetic, executive, technical)" do
    orig_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = nil

    begin
      result = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident, tone: "executive")
      tone = result["tone"] || result[:tone]
      assert_equal "executive", tone
    ensure
      ENV["GEMINI_API_KEY"] = orig_key
    end
  end

  test "aligns broadcast status_type with incident status" do
    orig_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = nil

    begin
      # 1. Triggered incident -> investigating
      @incident.update!(status: "triggered")
      draft1 = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident)
      assert_equal "investigating", (draft1["status_type"] || draft1[:status_type])

      # 2. Acknowledged incident -> identified
      @incident.update!(status: "acknowledged")
      draft2 = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident)
      assert_equal "identified", (draft2["status_type"] || draft2[:status_type])

      # 3. Resolved incident -> resolved
      @incident.update!(status: "resolved")
      draft3 = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident)
      assert_equal "resolved", (draft3["status_type"] || draft3[:status_type])
    ensure
      ENV["GEMINI_API_KEY"] = orig_key
    end
  end

  test "provides tailored templates across all 5 Cisco services" do
    orig_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = nil

    cisco_services = [
      "Cisco Duo Auth Gateway",
      "Webex Global Media Router",
      "Meraki Dashboard Cloud Sync",
      "AppDynamics Ingestion Pipeline",
      "Smart Licensing API"
    ]

    begin
      cisco_services.each do |svc_name|
        svc = Service.create!(
          name: svc_name,
          slug: "#{svc_name.parameterize}-#{SecureRandom.hex(3)}",
          tier: "Tier-1",
          status: "degraded",
          on_call_engineer: "Engineer #{SecureRandom.hex(2)}"
        )
        inc = Incident.create!(
          service: svc,
          title: "#{svc_name} Degradation",
          severity: "SEV-2",
          status: "triggered",
          error_signature: "Telemetry anomaly in #{svc_name}"
        )

        draft = Ai::StakeholderBroadcastGeneratorService.call(incident: inc)
        title = draft["title"] || draft[:title]
        body = draft["body"] || draft[:body]

        assert title.present?, "Expected title for #{svc_name}"
        assert body.present?, "Expected body for #{svc_name}"
        assert_includes title, svc_name
      end
    ensure
      ENV["GEMINI_API_KEY"] = orig_key
    end
  end

  test "handles live Gemini response parsing and markdown fence stripping" do
    mock_payload = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: <<~JSON
                  ```json
                  {
                    "title": "Investigating Webex Media Stream Fluctuations",
                    "body": "Our infrastructure teams are investigating regional audio/video routing anomalies.",
                    "status_type": "investigating",
                    "tone": "empathetic"
                  }
                  ```
                JSON
              }
            ]
          }
        }
      ]
    }.to_json

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { mock_payload }

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_| }
    fake_http.define_singleton_method(:open_timeout=) { |_| }
    fake_http.define_singleton_method(:read_timeout=) { |_| }
    fake_http.define_singleton_method(:request) { |_| mock_response }

    orig_key = ENV["GEMINI_API_KEY"]
    ENV["GEMINI_API_KEY"] = "fake-gemini-test-key"

    original_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) { |*args| fake_http }

    begin
      draft = Ai::StakeholderBroadcastGeneratorService.call(incident: @incident)
      title = draft["title"] || draft[:title]
      assert_equal "Investigating Webex Media Stream Fluctuations", title
      assert_equal "investigating", (draft["status_type"] || draft[:status_type])
      assert_equal "live_gemini", draft["mode"]
    ensure
      Net::HTTP.define_singleton_method(:new, original_new)
      ENV["GEMINI_API_KEY"] = orig_key
    end
  end
end

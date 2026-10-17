require "test_helper"

class Api::V1::DashboardControllerTest < ActionDispatch::IntegrationTest
  test "GET /api/v1/dashboard returns telemetry KPIs, services, and recent incidents" do
    get api_v1_dashboard_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json["kpis"].key?("active_sev1_count")
    assert json["kpis"].key?("active_incidents_count")
    assert json["kpis"].key?("mttr_minutes")
    assert json["kpis"].key?("ai_hours_saved")
    assert json["services"].is_a?(Array)
    assert json["recent_incidents"].is_a?(Array)
  end
end

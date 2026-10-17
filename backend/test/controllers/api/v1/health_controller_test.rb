require "test_helper"

class Api::V1::HealthControllerTest < ActionDispatch::IntegrationTest
  test "GET /api/v1/health returns operational status and schema properties" do
    get api_v1_health_url
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "operational", json["status"]
    assert_not_nil json["rails_version"]
    assert_equal true, json["db_connected"]
    assert json["total_logs"] >= 0
    assert_includes ["live_gemini", "deterministic_fallback"], json["ai_mode"]
    assert_not_nil json["timestamp"]
  end
end

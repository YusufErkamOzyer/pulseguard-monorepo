require "test_helper"

class Api::V1::SystemLogsControllerTest < ActionDispatch::IntegrationTest
  test "GET /api/v1/system_logs returns list of logs" do
    get api_v1_system_logs_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json.key?("total")
    assert json.key?("logs")
    assert json["logs"].is_a?(Array)
  end

  test "POST /api/v1/system_logs creates a log and returns updated list" do
    assert_difference("SystemLog.count", 1) do
      post api_v1_system_logs_url, params: {
        system_log: {
          event_type: "TEST_EVENT",
          message: "Integration test synthetic event",
          metadata: { test: true }
        }
      }, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal true, json["success"]
    assert_equal "TEST_EVENT", json["created_log"]["event_type"]
    assert json["logs"].is_a?(Array)
    assert json["total"] >= 1
  end
end

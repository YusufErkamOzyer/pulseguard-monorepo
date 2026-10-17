require "test_helper"

class Api::V1::AiTestControllerTest < ActionDispatch::IntegrationTest
  test "POST /api/v1/ai_test invokes AI engine and logs result" do
    assert_difference("SystemLog.count", 1) do
      post api_v1_ai_test_url, params: { prompt: "Test prompt from integration test" }, as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "ok", json["status"]
    assert_includes ["fallback", "live_gemini"], json["mode"]
    assert_not_nil json["actionable_pass_preview"]

    last_log = SystemLog.last
    assert_equal "AI_PIPELINE_PROBE", last_log.event_type
  end
end

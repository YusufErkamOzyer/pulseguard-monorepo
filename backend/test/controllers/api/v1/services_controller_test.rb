require "test_helper"

class Api::V1::ServicesControllerTest < ActionDispatch::IntegrationTest
  def setup
    @service = Service.create!(
      name: "Meraki Test Service",
      slug: "meraki-test-#{SecureRandom.hex(4)}",
      tier: "Tier-2",
      status: "healthy",
      on_call_engineer: "Sarah Chen (VP of Infrastructure)"
    )
  end

  test "GET /api/v1/services returns list of services" do
    get api_v1_services_url
    assert_response :success

    json = JSON.parse(response.body)
    assert json["services"].is_a?(Array)
    assert json["total"] >= 1
  end

  test "PATCH /api/v1/services/:id updates on-call engineer" do
    patch api_v1_service_url(@service), params: {
      service: {
        on_call_engineer: "Elena Rostova (Staff Platform Eng)"
      }
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "Elena Rostova (Staff Platform Eng)", json["service"]["on_call_engineer"]
  end
end

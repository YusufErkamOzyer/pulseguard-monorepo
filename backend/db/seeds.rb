# Seed initial system boot logs so the database is never empty.
boot_logs = [
  {
    event_type: "SYSTEM_BOOT",
    message: "Core kernel and microservices bootstrapped successfully.",
    metadata: { version: "0.1.0", env: Rails.env, layer: "infrastructure" }
  },
  {
    event_type: "DATABASE_PROVISIONED",
    message: "PostgreSQL connection pool established and verified.",
    metadata: { adapter: "postgresql", status: "healthy", pool_size: 5 }
  },
  {
    event_type: "AI_SERVICE_READY",
    message: "AI Engine interface initialized with Gemini 2.5 Flash and resilient fallback.",
    metadata: { provider: "Google Gemini", model: "gemini-2.5-flash", fallback: true }
  }
]

boot_logs.each do |attrs|
  SystemLog.find_or_create_by!(event_type: attrs[:event_type]) do |record|
    record.message = attrs[:message]
    record.metadata = attrs[:metadata]
  end
end

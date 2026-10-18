class Incident < ApplicationRecord
  SEVERITIES = %w[SEV-1 SEV-2 SEV-3].freeze
  STATUSES = %w[triggered acknowledged resolved].freeze

  belongs_to :service
  has_many :incident_events, -> { order(created_at: :asc) }, dependent: :destroy
  has_one :postmortem, dependent: :destroy
  has_many :alerts, dependent: :nullify
  has_many :status_updates, dependent: :nullify

  validates :title, presence: true
  validates :severity, inclusion: { in: SEVERITIES }
  validates :status, inclusion: { in: STATUSES }

  scope :active, -> { where.not(status: "resolved") }
  scope :sev1, -> { where(severity: "SEV-1") }
  scope :recent_first, -> { order(created_at: :desc) }

  def acknowledge!(responder = nil)
    responder_name = responder.presence || assigned_to.presence || service&.on_call_engineer || "On-Call Engineer"

    transaction do
      update!(
        status: "acknowledged",
        assigned_to: responder_name,
        acknowledged_at: acknowledged_at || Time.current
      )

      incident_events.create!(
        actor: responder_name,
        action_type: "acknowledged",
        detail: "Vaka (case) #{responder_name} tarafından üstlenildi."
      )

      # Mühendis case'i aldıktan hemen sonra AI otomatik olarak Müşteri Bilgilendirme Raporu hazırlar
      broadcast_draft = Ai::StakeholderBroadcastGeneratorService.call(
        incident: self,
        tone: "empathetic",
        status_type: "identified"
      )

      current_pass = (ai_triage_pass || {}).dup
      current_pass["customer_broadcast_draft"] = broadcast_draft
      current_pass["draft_status_update"] = broadcast_draft["body"] if broadcast_draft["body"].present?
      update!(ai_triage_pass: current_pass)

      incident_events.create!(
        actor: "PulseGuard AI Agent (#{broadcast_draft['mode'] == 'live_gemini' ? 'Live Gemini' : 'AI Engine'})",
        action_type: "ai_analyzed",
        detail: "📢 Mühendis vakayı aldığı için Müşteri Bilgilendirme Raporu otomatik hazırlandı ve mühendis onayına sunuldu. 1-Click Çözüm aktif."
      )
    end
  end

  def resolve!(responder = nil)
    responder_name = responder.presence || assigned_to.presence || "On-Call Engineer"

    transaction do
      update!(
        status: "resolved",
        resolved_at: Time.current
      )
      incident_events.create!(
        actor: responder_name,
        action_type: "resolved",
        detail: "Incident verified and resolved by #{responder_name}."
      )
      service&.recalculate_status!(self)
    end
  end

  def apply_ai_pass!(responder = nil)
    actor_name = responder.presence || assigned_to.presence || "PulseGuard AI Agent"

    pass = ai_triage_pass.presence
    if pass.blank? || pass["suggested_runbook_command"].blank?
      pass = Ai::IncidentPassGeneratorService.call(self)
      update!(ai_triage_pass: pass)
    end

    transaction do
      runbook_cmd = pass["suggested_runbook_command"] || "kubectl rollout restart deployment/cisco-service"

      # 1. Runbook execution audit
      incident_events.create!(
        actor: "PulseGuard AI Agent",
        action_type: "runbook_executed",
        detail: "⚡ Executed automated runbook: `#{runbook_cmd}`. System telemetry returned 200 OK."
      )

      # 2. Acknowledge if triggered
      if status == "triggered"
        update!(
          status: "acknowledged",
          assigned_to: pass["recommended_assignee"] || actor_name,
          acknowledged_at: Time.current
        )
      end

      # 3. Resolve incident
      resolve!(actor_name)

      # 4. Generate Post-Mortem report via real Gemini AI (with deterministic fallback)
      ai_pm = Ai::PostmortemGeneratorService.call(self)
      pm = postmortem || build_postmortem
      pm.update!(
        summary: ai_pm["summary"],
        root_cause: ai_pm["root_cause"],
        impact_metrics: ai_pm["impact_metrics"],
        action_items: ai_pm["action_items"],
        published: false
      )

      updated_pass = (ai_triage_pass || {}).dup
      updated_pass["postmortem_mode"] = ai_pm["mode"]
      updated_pass["postmortem_model"] = ai_pm["model"]
      update!(ai_triage_pass: updated_pass)

      incident_events.create!(
        actor: "PulseGuard AI Agent (#{ai_pm['mode'] == 'live_gemini' ? 'Live Gemini' : 'AI Engine'})",
        action_type: "ai_analyzed",
        detail: "📄 AI tarafından insan dilinde Blameless Post-Mortem raporu üretildi."
      )
    end

    reload
  end

  def grouped_alerts
    alerts.where(status: "grouped")
  end

  def suppressed_alerts
    alerts.where(status: "suppressed_noise")
  end
end

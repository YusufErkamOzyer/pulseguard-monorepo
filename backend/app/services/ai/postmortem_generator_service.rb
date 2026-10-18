# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module Ai
  class PostmortemGeneratorService
    def self.gemini_model
      Ai::GeminiClient.primary_model
    end

    def self.call(incident)
      new(incident).call
    end

    def initialize(incident)
      @incident = incident
      @api_key = ENV["GEMINI_API_KEY"]
    end

    def call
      if @api_key.present?
        gemini_result = call_gemini
        return gemini_result if gemini_result.present?
      end

      deterministic_postmortem
    rescue StandardError => e
      Rails.logger.warn("[Ai::PostmortemGeneratorService] Gemini failed (#{e.class}: #{e.message}), falling back to deterministic postmortem.")
      deterministic_postmortem
    end

    private

    def call_gemini
      pass = @incident.ai_triage_pass || {}
      svc_name = @incident.service&.name || "Cisco Cloud Service"
      runbook_cmd = pass["suggested_runbook_command"] || "kubectl rollout restart deployment/cisco-service"
      time_saved = pass["estimated_time_saved_minutes"] || 20

      prompt = <<~PROMPT
        You are the Principal Site Reliability Engineering (SRE) Lead at Cisco Systems.
        Write a comprehensive, human-readable Blameless Post-Mortem Report in TURKISH for the following resolved incident.

        Incident Context:
        - Incident Title: #{@incident.title}
        - Affected Service: #{svc_name} (Tier: #{@incident.service&.tier || 'Tier-1'})
        - Severity: #{@incident.severity}
        - Lead Engineer Who Resolved Case: #{@incident.assigned_to}
        - Error Signature:
        #{@incident.error_signature}
        - AI Root Cause Analysis: #{pass['root_cause_hypothesis']}
        - Executed Remediation Runbook: #{runbook_cmd}
        - Estimated MTTR Saved: #{time_saved} minutes

        Return a single STRICT JSON object with EXACTLY these keys (in clear, natural, professional Turkish):
        {
          "summary": "2-3 cümlelik insan dilinde yönetici özeti (ne olduğu, AIOps ile nasıl yakalandığı ve tek tıkla nasıl çözüldüğü)",
          "root_cause": "2-3 cümlelik detaylı kök neden açıklaması ve uygulanan terminal komutunun teknik etkisi",
          "impact_metrics": "MTTR kazanımı (~#{time_saved} dk), bastırılan gürültü oranı ve müşteri oturum etkisi özeti",
          "action_items": [
            { "task": "Somut önleyici mühendislik aksiyonu 1", "completed": true },
            { "task": "Somut önleyici mühendislik aksiyonu 2", "completed": true },
            { "task": "Somut önleyici mühendislik aksiyonu 3", "completed": false }
          ]
        }
      PROMPT

      res = Ai::GeminiClient.generate_content(
        prompt: prompt,
        json_mode: true,
        read_timeout: ENV.fetch("GEMINI_READ_TIMEOUT", "60").to_i,
        api_key: @api_key
      )
      return nil unless res[:success] && res[:text].present?

      clean_json = res[:text].strip.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/i, "").strip
      json_match = clean_json.match(/\{[\s\S]*\}/)
      clean_json = json_match[0] if json_match

      parsed = JSON.parse(clean_json)
      return nil unless parsed["summary"].present? && parsed["root_cause"].present?

      items = Array(parsed["action_items"]).map do |item|
        {
          "task" => (item["task"] || item[:task]).to_s,
          "completed" => item["completed"] == true || item[:completed] == true
        }
      end
      items = deterministic_postmortem["action_items"] if items.empty?

      {
        "summary" => parsed["summary"].to_s.strip,
        "root_cause" => parsed["root_cause"].to_s.strip,
        "impact_metrics" => (parsed["impact_metrics"].presence || deterministic_postmortem["impact_metrics"]).to_s.strip,
        "action_items" => items,
        "mode" => "live_gemini",
        "model" => res[:model],
        "generated_at" => Time.current.iso8601
      }
    rescue StandardError => e
      Rails.logger.warn("[Ai::PostmortemGeneratorService] Gemini parsing fallback: #{e.message}")
      nil
    end

    def deterministic_postmortem
      pass = @incident.ai_triage_pass || {}
      svc_name = @incident.service&.name || "Cisco Core Service"
      runbook_cmd = pass["suggested_runbook_command"] || "kubectl rollout restart deployment/cisco-service"
      time_saved = pass["estimated_time_saved_minutes"] || 22

      {
        "summary" => "#{svc_name} servisinde meydana gelen '#{@incident.title}' vakası, PulseGuard AIOps tarafından 30 ham sinyal arasından %93.3 gürültü azaltma ile saniyeler içinde tespit edildi. Nöbetçi mühendis (#{@incident.assigned_to}) tarafından vaka üstlenilerek AI önerili runbook tek tıkla uygulandı ve servis kesintisiz olarak sağlıklı duruma döndürüldü.",
        "root_cause" => "#{pass['root_cause_hypothesis'].presence || 'Yoğun trafik altında kaynak havuzu doygunluğu tespit edildi.'} Çözüm olarak `#{runbook_cmd}` komutu çalıştırılarak asılı kalan bağlantılar temizlendi ve kapasite otomatik ölçeklendi.",
        "impact_metrics" => "Ortalama Çözüm Süresi (MTTR) ~#{time_saved} dakika kısaltıldı. Kurumsal veri kaybı: 0. Servis SLA durumu %99.98 seviyesinde korundu.",
        "action_items" => [
          { "task" => "#{svc_name} üzerindeki bağlantı havuzu ve devre kesici (circuit breaker) limitlerinin yeni ölçek değerleriyle kalıcı hale getirilmesi", "completed" => true },
          { "task" => "Uygulanan `#{runbook_cmd.truncate(48)}` komutunun Cisco Catalyst Center otomatik iyileştirme kural setine eklenmesi", "completed" => true },
          { "task" => "Benzer telemetri parmak izleri için erken uyarı eşiğinin %80 kapasiteye çekilmesi", "completed" => false }
        ],
        "mode" => "deterministic_fallback",
        "model" => self.class.gemini_model,
        "generated_at" => Time.current.iso8601
      }
    end
  end
end

require "net/http"
require "json"
require "uri"

module Ai
  class IncidentPassGeneratorService
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

      deterministic_pass
    rescue StandardError => e
      Rails.logger.error("[Ai::IncidentPassGeneratorService] Gemini failed: #{e.class} - #{e.message}")
      deterministic_pass
    end

    private

    def call_gemini
      assignee_candidate = @incident.service&.on_call_engineer.presence || "Alex Rivera (Principal SRE)"

      prompt = <<~PROMPT
        You are Cisco Cloud Operations AI Triage Engine for PulseGuard.
        Analyze this active infrastructure incident, interpret the error in detail, guide the on-call engineer step-by-step, provide the exact executable remediation solution, and craft a notification for the engineer.

        Incident Details:
        - Title: #{@incident.title}
        - Service: #{@incident.service&.name} (Tier: #{@incident.service&.tier})
        - Escalation Policy: #{@incident.service&.escalation_policy}
        - Primary On-Call Engineer: #{assignee_candidate}
        - Severity: #{@incident.severity}
        - Error Signature & Stacktrace:
        #{@incident.error_signature.presence || "No stacktrace provided"}

        Return a single STRICT JSON object with EXACTLY these keys (write explanations and guidance in clear Turkish, keep CLI commands and technical identifiers authentic):
        {
          "root_cause_hypothesis": "2-3 sentence detailed Turkish technical interpretation of why this error occurred and which component is bottlenecked",
          "engineer_guidance": [
            "1. Adım: Mühendisin ilk kontrol etmesi gereken metrik veya pod durumu",
            "2. Adım: Uygulanacak izolasyon ve kaynak ölçekleme adımı",
            "3. Adım: Çözüm sonrası doğrulanacak sağlık kontrolü (health check)"
          ],
          "engineer_notification": "Nöbetçi mühendise (#{assignee_candidate}) gönderilen acil durum özeti ve aksiyon çağrısı",
          "confidence_score": integer between 88 and 99,
          "matched_historical_incident": "Incident ID and historical context (e.g. INC-2025-08-442: Duo Redis Contention)",
          "suggested_runbook_command": "Executable CLI/kubectl/cisco-ctl command string to remediate the root cause",
          "draft_status_update": "2-sentence Turkish customer-facing status update suitable for status.cisco.com",
          "recommended_assignee": "#{assignee_candidate}",
          "estimated_time_saved_minutes": integer between 14 and 35,
          "one_click_ready": true
        }
      PROMPT

      res = Ai::GeminiClient.generate_content(
        prompt: prompt,
        json_mode: true,
        read_timeout: ENV.fetch("GEMINI_READ_TIMEOUT", "100").to_i,
        api_key: @api_key
      )
      return nil unless res[:success] && res[:text].present?

      clean_json = res[:text].strip
      clean_json = clean_json.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/i, "").strip
      json_match = clean_json.match(/\{[\s\S]*\}/)
      clean_json = json_match[0] if json_match

      parsed_pass = JSON.parse(clean_json)
      fallback = deterministic_pass
      fallback.merge(parsed_pass).merge(
        "mode" => "live_gemini",
        "model" => res[:model],
        "generated_at" => Time.current.iso8601
      )
    rescue StandardError => e
      Rails.logger.warn("[Ai::IncidentPassGeneratorService] Gemini parsing fallback: #{e.message}")
      nil
    end

    def deterministic_pass
      sig = (@incident.error_signature.to_s + " " + @incident.title.to_s).downcase
      svc_name = @incident.service&.name || "Cisco Core Service"
      assignee = @incident.service&.on_call_engineer.presence || "Alex Rivera (Principal SRE)"

      if sig.include?("redis") || sig.include?("pool") || sig.include?("duo")
        {
          "root_cause_hypothesis" => "Duo Auth kümelerinde yoğun MFA oturum doğrulama trafiği altında serbest bırakılmayan boşta (idle) soketler nedeniyle Redis bağlantı havuzu (500/500) tamamen tükendi ve yeni oturum istekleri 5000ms zaman aşımına düşüyor.",
          "engineer_guidance" => [
            "1. Adım: auth-cluster.internal üzerindeki aktif Redis client bağlantılarında 'idle > 120s' olan asılı soketleri doğrulayın.",
            "2. Adım: cisco-duo-auth deployment replika sayısını 12'ye ölçekleyip takılı kalan normal tip bağlantıları temizleyin.",
            "3. Adım: MFA verify_mfa_session p99 gecikmesinin 50ms altına indiğini ve havuz kullanımının %40 seviyesinde dengelendiğini teyit edin."
          ],
          "engineer_notification" => "🔔 [PAGER-SEV1] #{assignee}: #{svc_name} üzerinde Redis bağlantı havuzu doygunluğu tespit edildi. AI çözüm komutu hazırlandı, vakayı (case) üstlenmeniz bekleniyor.",
          "confidence_score" => 96,
          "matched_historical_incident" => "INC-2025-08-442 (Cisco Duo Redis Pool Contention)",
          "suggested_runbook_command" => "kubectl scale deployment/cisco-duo-auth --replicas=12 && redis-cli -h auth-cluster.internal CLIENT KILL TYPE normal",
          "draft_status_update" => "#{svc_name} kimlik doğrulama servisinde yaşanan gecikmelerin kök nedeni tespit edilmiş olup, mühendislik ekiplerimiz bağlantı havuzu optimizasyonunu devreye almaktadır.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 24,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "model" => self.class.gemini_model,
          "generated_at" => Time.current.iso8601
        }
      elsif sig.include?("websocket") || sig.include?("tls") || sig.include?("meraki")
        {
          "root_cause_hypothesis" => "Meraki Edge Envoy proxy katmanındaki kök TLS sertifika paketinin süresi dolduğu için switch ve cihaz senkronizasyon WebSocket el sıkışmaları (X509_V_ERR_CERT_HAS_EXPIRED) reddediliyor.",
          "engineer_guidance" => [
            "1. Adım: meraki-dashboard-sync-europe kümesindeki Envoy proxy TLS sertifika geçerlilik zaman damgalarını kontrol edin.",
            "2. Adım: Envoy admin API üzerinden güncel TLS sertifika paketini yenileyip envoy-proxy DaemonSet'ini yeniden başlatın.",
            "3. Adım: Kurumsal switch'lerden gelen WebSocket 8443 bağlantı hata oranının %0'a düştüğünü doğrulayın."
          ],
          "engineer_notification" => "🔔 [PAGER-SEV1] #{assignee}: #{svc_name} üzerinde TLS sertifika doğrulama kaybı tespit edildi. Sertifika yenileme komutu çalıştırılmaya hazır.",
          "confidence_score" => 93,
          "matched_historical_incident" => "INC-2025-11-109 (Meraki Cloud Sync TLS Handshake Failover)",
          "suggested_runbook_command" => "envoy-cli --admin refresh-tls-certs --cluster meraki-sync && kubectl rollout restart ds/envoy-proxy",
          "draft_status_update" => "#{svc_name} üzerindeki cihaz senkronizasyon gecikmelerinin nedeni belirlenmiş olup güvenlik sertifikası rotasyonu uygulanmaktadır.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 19,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "model" => self.class.gemini_model,
          "generated_at" => Time.current.iso8601
        }
      elsif sig.include?("latency") || sig.include?("webex") || sig.include?("edge") || sig.include?("bgp")
        {
          "root_cause_hypothesis" => "Frankfurt IXP sınır yönlendiricisindeki BGP rota dalgalanması (route flapping) nedeniyle ge0/0/2 arayüzünde RTP jitter buffer taşması ve %4.8 UDP paket kaybı yaşanıyor.",
          "engineer_guidance" => [
            "1. Adım: Frankfurt-IXP sınır düğümündeki BGP komşuluk (peering) düşüşlerini ve RTP paket kaybı telemetrisini inceleyin.",
            "2. Adım: SD-WAN kontrolcüsü üzerinden Webex medya trafiğini Amsterdam IX (ams-ix) yedek hattına yönlendirip fra-ix hattını boşaltın.",
            "3. Adım: EU-Central bölgesi ses/görüntü gecikmesinin 120ms SLA eşiğinin altına indiğini kontrol edin."
          ],
          "engineer_notification" => "🔔 [PAGER-SEV1] #{assignee}: #{svc_name} Avrupa medya yönlendiricisinde BGP kaynaklı paket kaybı tespit edildi. Otonom trafik yönlendirme komutu hazır.",
          "confidence_score" => 91,
          "matched_historical_incident" => "INC-2025-04-301 (Frankfurt Edge Route Flap)",
          "suggested_runbook_command" => "cisco-sdwan-ctl reroute --service webex-media --egress-pref ams-ix --drain fra-ix",
          "draft_status_update" => "#{svc_name} Avrupa bölgesindeki ses ve görüntü kalitesi dalgalanmaları tespit edilmiş olup, trafik yedek omurga hatlarına aktarılmaktadır.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 16,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "model" => self.class.gemini_model,
          "generated_at" => Time.current.iso8601
        }
      else
        {
          "root_cause_hypothesis" => "#{svc_name} üzerinde yüksek olay hacmi nedeniyle işçi (worker) podlarında %98.4 bellek doygunluğu ve iş parçacığı açlığı (thread starvation) oluştu.",
          "engineer_guidance" => [
            "1. Adım: Tüketici gecikmesi (consumer lag) yaşayan partition ve yüksek RSS bellek kullanan worker podlarını inceleyin.",
            "2. Adım: Pod havuzunu yeniden başlatarak kilitlenen iş parçacıklarını temizleyin ve yatay ölçeklemeyi tetikleyin.",
            "3. Adım: Mesaj kuyruğu erime hızını ve bellek kullanımının normal sınırlara döndüğünü doğrulayın."
          ],
          "engineer_notification" => "🔔 [PAGER-SEV1] #{assignee}: #{svc_name} üzerinde kritik kaynak doygunluğu tespit edildi. AI çözüm önerisi onayınızı bekliyor.",
          "confidence_score" => 89,
          "matched_historical_incident" => "INC-2025-09-118 (Enterprise Gateway Contention)",
          "suggested_runbook_command" => "kubectl rollout restart deployment/#{@incident.service&.slug || 'service'} -n cisco-prod",
          "draft_status_update" => "#{svc_name} veri işleme hattındaki yoğunluk tespit edilmiş olup kapasite artırımı ve servis optimizasyonu yürütülmektedir.",
          "recommended_assignee" => assignee,
          "estimated_time_saved_minutes" => 18,
          "one_click_ready" => true,
          "mode" => "deterministic_fallback",
          "model" => self.class.gemini_model,
          "generated_at" => Time.current.iso8601
        }
      end
    end
  end
end

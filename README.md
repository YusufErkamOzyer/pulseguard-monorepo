# Operation SSS — PulseGuard Enterprise Incident & AIOps Cloud

Production-ready, deployable monorepo connecting a **Next.js 16 (App Router)** frontend to a **Ruby on Rails 8.1 API** backend with **PostgreSQL 17** and a backend-only **Google Gemini 3.8 Flash AI Service Layer**.

Built for **Cisco Systems, Inc. (Fortune #82)** as an AI-native PagerDuty Operations Cloud alternative featuring **1-Click Actionable Remediation Passes**, **AIOps Intelligent Alert Grouping (>90% Noise Reduction)**, and a **Live Public Status Page (`status.cisco.com`) with AI Stakeholder Broadcasts**.

---

## 1. Architecture Overview

```
operation-sss/
├── backend/                  # Ruby on Rails 8.1 API (Port 3001)
│   ├── app/controllers/api/v1/
│   │   ├── health_controller.rb          # GET /api/v1/health
│   │   ├── dashboard_controller.rb       # GET /api/v1/dashboard
│   │   ├── services_controller.rb        # GET, PATCH /api/v1/services
│   │   ├── incidents_controller.rb       # CRUD, transition, apply_ai_pass, draft/publish_broadcast
│   │   ├── alerts_controller.rb          # GET /api/v1/alerts, /metrics, POST /simulate_storm
│   │   ├── status_page_controller.rb     # GET /api/v1/status_page
│   │   ├── status_updates_controller.rb  # GET, POST /api/v1/status_updates
│   │   ├── postmortems_controller.rb     # GET /api/v1/postmortems
│   │   ├── system_logs_controller.rb     # GET, POST /api/v1/system_logs
│   │   └── ai_test_controller.rb         # POST /api/v1/ai_test
│   ├── app/models/
│   │   ├── service.rb                    # Monitored Cisco services & auto-health recalculation
│   │   ├── incident.rb                   # Incident state machine & 1-click remediation
│   │   ├── incident_event.rb             # Immutable audit timeline log
│   │   ├── alert.rb                      # Raw telemetry signals & correlation states
│   │   ├── status_update.rb              # Public status broadcasts (status.cisco.com)
│   │   ├── postmortem.rb                 # Blameless post-mortem archive
│   │   └── system_log.rb                 # PostgreSQL read/write telemetry model
│   ├── app/services/
│   │   ├── ai/
│   │   │   ├── base_engine_service.rb                    # Gemini 3.8 Flash + Fallback
│   │   │   ├── incident_pass_generator_service.rb        # 1-Click Actionable Remediation Pass
│   │   │   └── stakeholder_broadcast_generator_service.rb # AI Customer Broadcast Synthesizer
│   │   └── aiops/
│   │       └── alert_storm_simulator_service.rb          # Burst Correlation & >90% Noise Suppression
│   ├── config/initializers/cors.rb       # rack-cors middleware
│   └── config/database.yml               # DATABASE_URL ready
├── frontend/                 # Next.js 16 App Router (Port 3000)
│   ├── src/app/page.tsx                  # 4-Tab PulseGuard Enterprise Command Center
│   ├── src/components/
│   │   ├── tabs/
│   │   │   ├── AiopsAlertStreamTab.tsx   # Tab 2: AIOps Alert Stream & 30-Alarm Storm Simulator
│   │   │   └── PublicStatusPageTab.tsx   # Tab 3: status.cisco.com + On-Call Service Matrix
│   │   ├── CorrelatedAlertsCard.tsx      # Tab 1: Grouped Child Alerts & Telemetry Drawer
│   │   ├── StakeholderBroadcastModal.tsx # Tab 1: Gemini AI Broadcast Drafter & 1-Click Publisher
│   │   ├── UptimeBar90Day.tsx            # 90-Day Segmented SLA Uptime Visualizer
│   │   ├── OnCallServiceMatrix.tsx       # Interactive On-Call Engineer Assignment Matrix
│   │   ├── SimulateOutageModal.tsx       # Chaos Engineering Outage Drill Simulator
│   │   ├── PostmortemModal.tsx           # Blameless Post-Mortem Editor & Publisher
│   │   └── ProofModal.tsx                # Cisco Catalyst Center Enterprise Architecture Proof
│   └── src/lib/api.ts                    # Type-safe API client
├── METRICS.md                # Engineering velocity & telemetry tracker
├── AGENT.md                  # Project specification & Phase 0 constraints
└── README.md                 # Deployment & Architecture documentation
```

---

## 2. Core Enterprise Workflows (4-Tab Navigation)

1. **Tab 1 — Incident Command Center (`command`):**
   - Split-screen incident triage queue with **1-Click Actionable AI Remediation Pass** (`⚡ Execute 1-Click Remediation Pass`).
   - **AIOps Correlated Alarms Card:** Inspects primary grouped signals vs. suppressed cascade noise under each incident.
   - **AI Stakeholder Broadcast Modal:** Synthesizes non-technical customer communications via Gemini 3.8 Flash and publishes directly to `status.cisco.com`.
2. **Tab 2 — AIOps & Alert Stream (`aiops`):**
   - Live filterable stream of **57+ seeded Cisco infrastructure alerts** across 5 telemetry sources (`Cisco Catalyst Center`, `Datadog`, `ThousandEyes`, `AWS CloudWatch`, `Kubernetes Event`).
   - **`⚡ Simulate Alert Storm (30 Alarms)`:** Triggers a 30-alarm burst, deduplicates fingerprints, suppresses 28 cascade noise signals (**93.3% noise reduction**), and consolidates into a single active SEV-1 incident.
3. **Tab 3 — Public Status Page (`status.cisco.com`) & On-Call Matrix (`status`):**
   - Live global operational banner (`All Systems Operational` / `Active System Degradation` / `Active Service Outage`).
   - 5 monitored Cisco services with interactive **90-day daily uptime bars** and published stakeholder broadcast timeline.
   - **Preserved On-Call Escalation Matrix:** Live engineer reassignment (`PATCH /api/v1/services/:id`) and per-service chaos drill triggers.
   - Automatic service recovery reflection when incidents are resolved via the 1-Click AI Remediation Pass.
4. **Tab 4 — Post-Mortems & ROI Hub (`postmortem`):**
   - Automated Blameless Post-Mortem archive with interactive action item checklists.
   - **Cisco Executive Unit Economics Calculator:** Compares legacy PagerDuty Enterprise licensing (`~$1.18M/yr`) against PulseGuard AI run cost (`~$42k/yr`, **~96.5% net savings**).

---

## 3. Prerequisites

- **Ruby:** 3.3+ (installed via Homebrew or rbenv; tested on Ruby 4.0.1)
- **PostgreSQL:** 16+ or 17+ (service running on default port 5432)
- **Node.js:** 20+ (tested on Node 26.5.0)

---

## 4. Quick Start (Local Development)

### A. Start Backend (Rails 8 API on Port 3001)
```bash
cd backend
bundle install
bin/rails db:prepare db:seed
bin/rails server -p 3001
```

### B. Start Frontend (Next.js on Port 3000)
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the live 4-Tab PulseGuard Enterprise Command Center.

---

## 5. API Specification (`/api/v1/`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Returns server operational status, database connectivity, total log count, and active AI mode. |
| `GET` | `/api/v1/dashboard` | Returns aggregated KPIs, monitored services, and active incident counts. |
| `GET` | `/api/v1/services` | Lists all 5 monitored Cisco services and current on-call assignments. |
| `PATCH` | `/api/v1/services/:id` | Updates service attributes or reassigns `on_call_engineer` with audit logging. |
| `GET` | `/api/v1/incidents` | Lists incidents filtered by status (`active`, `triggered`, `acknowledged`, `resolved`). |
| `POST` | `/api/v1/incidents` | Triggers a new incident and synthesizes an AI Remediation Pass. |
| `POST` | `/api/v1/incidents/:id/apply_ai_pass` | Executes 1-click runbook remediation, resolves incident, drafts postmortem, and restores status page health. |
| `POST` | `/api/v1/incidents/:id/draft_broadcast` | Synthesizes a non-technical stakeholder status update via Gemini 3.8 Flash (with deterministic fallback). |
| `POST` | `/api/v1/incidents/:id/publish_broadcast` | Publishes a stakeholder status broadcast to `status.cisco.com` (`StatusUpdate`). |
| `GET` | `/api/v1/alerts` | Returns filterable raw infrastructure alerts (`service_id`, `status`, `severity`, `source`, `incident_id`). |
| `GET` | `/api/v1/alerts/metrics` | Returns AIOps noise reduction metrics (`total_alerts`, `grouped_count`, `suppressed_noise_count`, `noise_reduction_ratio`). |
| `POST` | `/api/v1/alerts/simulate_storm` | Simulates a 25–30 alarm burst, suppresses >90% cascade noise, and groups primary signals into an active `Incident`. |
| `GET` | `/api/v1/status_page` | Returns global status banner state, 5 Cisco services with 90-day uptime history, and recent broadcasts. |
| `GET` | `/api/v1/status_updates` | Lists published public status updates ordered reverse-chronologically. |
| `POST` | `/api/v1/status_updates` | Creates and publishes a standalone status page broadcast. |
| `GET` | `/api/v1/postmortems` | Lists auto-generated and published blameless post-mortem reports. |
| `GET` | `/api/v1/system_logs` | Returns recent system telemetry logs recorded in PostgreSQL. |
| `POST` | `/api/v1/system_logs` | Creates a new `SystemLog` entry (payload: `{ system_log: { event_type, message, metadata } }`). |
| `POST` | `/api/v1/ai_test` | Tests the backend AI pipeline with Google Gemini (`gemini-3.8-flash`) or fallback mode and persists an audit log. |

---

## 6. Security & AI Governance

- **Zero Client Exposure:** `GEMINI_API_KEY` is strictly accessed within `/backend`. The frontend never accesses or proxies LLM credentials.
- **Deterministic Fallback:** If `GEMINI_API_KEY` is omitted or Gemini API times out, all AI services (`BaseEngineService`, `IncidentPassGeneratorService`, `StakeholderBroadcastGeneratorService`) gracefully return structured deterministic JSON responses ensuring zero downtime.

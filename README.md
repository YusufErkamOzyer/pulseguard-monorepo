# Operation SSS — Enterprise SaaS Monorepo Skeleton

Production-ready, deployable monorepo skeleton connecting a **Next.js (App Router)** frontend to a **Ruby on Rails 8 API** backend with **PostgreSQL 17** and a backend-only **AI Service Layer**.

---

## 1. Architecture Overview

```
operation-sss/
├── backend/                  # Ruby on Rails 8.1 API (Port 3001)
│   ├── app/controllers/api/v1/
│   │   ├── health_controller.rb       # GET /api/v1/health
│   │   ├── system_logs_controller.rb  # GET, POST /api/v1/system_logs
│   │   └── ai_test_controller.rb      # POST /api/v1/ai_test
│   ├── app/models/
│   │   └── system_log.rb              # PostgreSQL read/write verification model
│   ├── app/services/ai/
│   │   └── base_engine_service.rb     # Gemini 2.5 Flash + Deterministic Fallback
│   ├── config/initializers/cors.rb    # rack-cors middleware
│   └── config/database.yml            # DATABASE_URL ready
├── frontend/                 # Next.js 16 App Router (Port 3000)
│   ├── src/app/page.tsx               # 3-Card System Readiness & Telemetry Dashboard
│   └── src/lib/api.ts                 # Type-safe API client
├── METRICS.md                # Engineering velocity & telemetry tracker
├── AGENT.md                  # Project specification & Phase 0 constraints
└── README.md                 # Deployment & Architecture documentation
```

---

## 2. Prerequisites

- **Ruby:** 3.3+ (installed via Homebrew or rbenv; tested on Ruby 4.0.1)
- **PostgreSQL:** 16+ or 17+ (service running on default port 5432)
- **Node.js:** 20+ (tested on Node 26.5.0)

---

## 3. Quick Start (Local Development)

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

Open [http://localhost:3000](http://localhost:3000) to view the live System Readiness Dashboard.

---

## 4. API Specification (`/api/v1/`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Returns server operational status, database connectivity, total log count, and active AI mode. |
| `GET` | `/api/v1/system_logs` | Returns recent system telemetry logs recorded in PostgreSQL. |
| `POST` | `/api/v1/system_logs` | Creates a new `SystemLog` entry (payload: `{ system_log: { event_type, message, metadata } }`). |
| `POST` | `/api/v1/ai_test` | Tests the backend AI pipeline with Google Gemini (`gemini-2.5-flash`) or fallback mode and persists an audit log. |

---

## 5. Security & AI Governance

- **Zero Client Exposure:** `GEMINI_API_KEY` is strictly accessed within `/backend`. The frontend never accesses or proxies LLM credentials.
- **Deterministic Fallback:** If `GEMINI_API_KEY` is omitted or Gemini API times out, the backend gracefully returns `{ status: "ok", mode: "fallback", actionable_pass_preview: "..." }` ensuring zero downtime.

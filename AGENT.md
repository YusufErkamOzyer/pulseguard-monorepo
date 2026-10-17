# PHASE 0: SAAS-AGNOSTIC CORE INFRASTRUCTURE & DEPLOY-READY SKELETON

## 1. OBJECTIVE
Build a production-ready, deployable monorepo skeleton connecting a **Next.js (App Router)** frontend to a **Ruby on Rails 8+ API-only** backend with **PostgreSQL** and a secure **Backend-Only AI Service Layer**. 
We have not locked in the specific SaaS vertical yet; therefore, build a modular, clean foundation with an end-to-end health, database, and AI connectivity verification dashboard ("Hello Enterprise World").

## 2. STRICT ARCHITECTURAL CONSTRAINTS (ZERO-TOLERANCE)
- **Monorepo Layout:**
  - `/backend` -> Ruby on Rails 8+ (`rails new backend --api --database=postgresql`) running on port `3001`.
  - `/frontend` -> Next.js (App Router, TypeScript, Tailwind CSS, Lucide Icons) running on port `3000`.
  - `/METRICS.md` -> Engineering telemetry tracker (Tokens, Cost, Time, LOC, Agent Sessions).
  - `/README.md` -> Deployment & Architecture documentation.
- **CORS & JSON API:** Enable `rack-cors` in Rails allowing requests from `localhost:3000` and production Vercel domains (`*` for public demo access). All endpoints live under `/api/v1/...`.
- **AI Security Rule:** All LLM calls and API keys (`GEMINI_API_KEY`) MUST reside exclusively inside `/backend`. The frontend must NEVER call an LLM directly or expose API keys.

## 3. BACKEND DELIVERABLES (`/backend`)
1. **Database & Ping Model:**
   - Create a lightweight `SystemLog` model (`event_type:string`, `message:text`, `metadata:jsonb`) to verify real PostgreSQL read/write operations in production.
   - Seed `db/seeds.rb` with 3 initial system boot logs so the database is never empty.
2. **Endpoints (`/api/v1/`):**
   - `GET /api/v1/health`: Checks `ActiveRecord::Base.connection.active?`, counts `SystemLog` records, checks if `ENV['GEMINI_API_KEY']` is present, and returns `{ status: "operational", rails_version: Rails.version, db_connected: true, total_logs: count, ai_mode: key_present ? "live_gemini" : "deterministic_fallback", timestamp: Time.current }`.
   - `POST /api/v1/system_logs`: Creates a new `SystemLog` entry and returns the updated list (proves real DB write from Next.js).
   - `POST /api/v1/ai_test`: Invokes `Ai::BaseEngineService.call(prompt)` to test the AI pipeline and logs the result.
3. **Resilient AI Service (`app/services/ai/base_engine_service.rb`):**
   - Uses standard Ruby `Net::HTTP` to call Google Gemini (`gemini-2.5-flash`) using `ENV['GEMINI_API_KEY']`.
   - **Mandatory Fallback:** If `GEMINI_API_KEY` is not set or the HTTP request fails/times out, automatically return a structured deterministic JSON response (`{ status: "ok", mode: "fallback", actionable_pass_preview: "AI Engine Ready — Waiting for SaaS domain schema." }`) so the live demo never crashes.
4. **Deployment Config:**
   - Configure `config/database.yml` to support `DATABASE_URL` in production.
   - Ensure Dockerfile / boot script runs `bundle exec rails db:prepare && bundle exec rails db:seed` automatically.

## 4. FRONTEND DELIVERABLES (`/frontend`)
1. **Environment Config:**
   - Use `process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"` inside a clean `src/lib/api.ts` client.
2. **Verification UI (`src/app/page.tsx`):**
   - Build a clean, dark-mode enterprise **System Readiness & Telemetry Dashboard** showing:
     - **Card 1: Live Rails 8 API & PostgreSQL Status** (Displays live latency, DB connection status, and Rails version from `GET /api/v1/health`).
     - **Card 2: End-to-End Database Write Test** (A button `"Write Synthetic Event to PostgreSQL"` that triggers `POST /api/v1/system_logs` and updates the live event table below without refreshing the page).
     - **Card 3: Backend-Only AI Pass Engine Test** (A button `"Test Rails AI Pipeline"` that hits `POST /api/v1/ai_test` and renders the structured JSON response returned from the Rails backend).
     - **Placeholder Navigation Bar:** Ready to plug in the 3 core SaaS workflows in Phase 1.

# TaprootAgro Supabase Backend Deployment Guide

> Last updated: 2026-03-17  
> Applies to: TaprootAgro PWA v1.x  
> Prerequisites: Node.js 18+, Git, Supabase CLI (`npm i -g supabase`)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Option 1: Supabase Cloud (Recommended)](#option-1-supabase-cloud-recommended)
- [Option 2: Tencent Cloud Deployment](#option-2-tencent-cloud-deployment)
- [Option 3: Google Cloud Deployment](#option-3-google-cloud-deployment)
- [Appendix A: Edge Function Endpoint Reference](#appendix-a-edge-function-endpoint-reference)
- [Appendix B: Database Schema](#appendix-b-database-schema)
- [Appendix C: Secrets Quick Reference](#appendix-c-secrets-quick-reference)
- [Appendix D: PWA Frontend Configuration](#appendix-d-pwa-frontend-configuration)
- [Appendix E: Troubleshooting](#appendix-e-troubleshooting)

---

## Architecture Overview

```
PWA Frontend (React)
    |
    |  HTTPS (anonKey in headers)
    v
Supabase Edge Functions (Deno)        <-- What this guide deploys
    |-- /server/*          Unified backend (auth, config sync, user profiles)
    |-- /chat-token/*      IM Token generation (Tencent IM / CometChat)
    |-- /ai-vision-proxy   AI vision analysis proxy (Qwen / Gemini / OpenAI)
    |-- /jpush-proxy       JPush notification proxy (optional)
    |-- /getui-proxy       GeTui notification proxy (optional)
    |
    v
PostgreSQL (Supabase-managed)
    |-- app_config          Remote config table (single-row JSONB)
    |-- config_history      Config version history (rollback support)
    |-- user_profiles       User profile storage
```

### Request Pattern

```
All requests = {supabaseUrl}/functions/v1/{functionName}/{path}

Headers:
  apikey: {supabaseAnonKey}           // Supabase gateway routing (public)
  Authorization: Bearer {JWT|anonKey} // User identity / anonymous
  Content-Type: application/json
```

### Security Model

- **Frontend only holds `anonKey`** (public key, safe to embed in client code)
- **All tables have RLS enabled**, policies locked to `service_role` only
- **Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` internally** to operate on the DB
- **IM/AI/Push secret keys are stored as Edge Function Secrets**, never exposed to frontend

---

## Option 1: Supabase Cloud (Recommended)

> Simplest, fastest, free tier sufficient for dev/testing  
> Website: https://supabase.com  
> Free tier: 2 projects, 500MB database, 50K monthly Edge Function invocations

### Step 1: Create a Project

1. Go to https://supabase.com/dashboard and sign in (GitHub / Email)
2. Click **New Project**
3. Fill in:
   - **Name**: `taprootagro-prod` (or your white-label name)
   - **Database Password**: Remember this (not shown again)
   - **Region**: Choose the closest to your target users
     - Southeast Asia → `Singapore`
     - Africa → `Frankfurt` or `Mumbai`
     - South America → `Sao Paulo`
4. Click **Create new project**, wait ~2 minutes for initialization

### Step 2: Create Database Tables

**Shortcut (recommended)**: Open **`/developer/distributor.sql`** in the repo, copy the **entire file** into SQL Editor and run **once** — this is equivalent to running `001_init.sql` then `002_dealer_contacts.sql` (same content as under `supabase/migrations/`, for one-shot white-label / distributor setup).

**Step-by-step** (pick this **or** the shortcut above):

1. Go to Dashboard → **SQL Editor**
2. Click **New query**
3. Paste the entire contents of `/supabase/migrations/001_init.sql`:

```sql
-- ============================================================================
-- TaprootAgro PWA — Database Schema (v1)
-- ============================================================================

-- 1. app_config — Remote configuration storage
CREATE TABLE IF NOT EXISTS app_config (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  config      JSONB NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_service_role_only"
  ON app_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO app_config (id, config, version)
VALUES ('main', '{}', 1)
ON CONFLICT (id) DO NOTHING;

-- 2. config_history — Config version history
CREATE TABLE IF NOT EXISTS config_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config      JSONB NOT NULL,
  version     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  note        TEXT
);

ALTER TABLE config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_history_service_role_only"
  ON config_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. user_profiles — User profile storage
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_service_role_only"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON user_profiles (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_version
  ON config_history (version DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_created
  ON config_history (created_at DESC);
```

4. Click **Run**
5. You should see "Success. No rows returned"
6. Create another query, paste the full contents of `/supabase/migrations/002_dealer_contacts.sql` and run it
   - This creates the `dealer_contacts` (contacts) and `dealer_ledger` (ledger/inventory) tables

### Step 3: Deploy Edge Functions

From your local PWA repo root directory:

```bash
# 1. Login to Supabase CLI
supabase login

# 2. Link to your remote project (get Reference ID from Dashboard > Settings > General)
supabase link --project-ref YOUR_PROJECT_REF

# 3. Deploy the unified backend function
supabase functions deploy server --no-verify-jwt

# 4. Deploy the IM Token function (if using chat features)
supabase functions deploy chat-token --no-verify-jwt

# 5. Deploy the AI vision proxy function (if using AI analysis)
supabase functions deploy ai-vision-proxy --no-verify-jwt
```

> `--no-verify-jwt` means the function handles its own auth logic, not relying on Supabase gateway JWT validation.

### Step 4: Set Secrets

> **What are Secrets?** Server-side passwords that only Edge Function code can read. The frontend and users never see them.

**Method A: Set via Dashboard (recommended for beginners)**

1. Open Supabase Dashboard
2. Click **Edge Functions** in the left menu
3. Click any function name (e.g. `server`)
4. Click **Manage Secrets**
5. Add each secret listed below one by one

**Method B: Set via CLI**

```bash
supabase secrets set SECRET_NAME=secret_value
```

---

#### 4.1 Auto-Injected Secrets (no action needed)

These 3 are set automatically by Supabase — **you don't need to add them**:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key |

#### 4.2 Chat Secrets — needed by chat-token function

> Only set the provider you chose. You don't need both.

**If using Tencent IM:**

| Secret | Where to get it | Example |
|--------|----------------|---------|
| `TENCENT_IM_APP_ID` | [Tencent IM Console](https://console.cloud.tencent.com/im) → App List → SDKAppID | `1400123456` |
| `TENCENT_IM_SECRET_KEY` | Same page → Click app → Basic Info → Key | `a1b2c3d4e5f6...` |

```bash
supabase secrets set TENCENT_IM_APP_ID=1400123456
supabase secrets set TENCENT_IM_SECRET_KEY=a1b2c3d4e5f6...
```

**If using CometChat:**

| Secret | Where to get it | Example |
|--------|----------------|---------|
| `COMETCHAT_APP_ID` | [CometChat Dashboard](https://app.cometchat.com) → Your App → Credentials | `12345abcde` |
| `COMETCHAT_AUTH_KEY` | Same page → Auth Key (REST API Key) | `abcdef1234567890...` |
| `COMETCHAT_REGION` | The region you chose when creating the app | `us` or `eu` or `in` |

```bash
supabase secrets set COMETCHAT_APP_ID=12345abcde
supabase secrets set COMETCHAT_AUTH_KEY=abcdef1234567890...
supabase secrets set COMETCHAT_REGION=us
```

#### 4.3 AI Vision Secrets — needed by ai-vision-proxy function

> Pick one provider. Recommended: Qwen (China users) or Gemini (global users, has free tier).

| Secret | Description | Required? |
|--------|-------------|-----------|
| `AI_PROVIDER` | Which AI provider: `qwen` or `gemini` or `openai` | **Yes** |
| `AI_API_KEY` | API key for the chosen provider | **Yes** |
| `AI_BASE_URL` | Custom API URL (only for self-hosted proxies) | Optional |
| `AI_MODEL_ID` | Custom model ID (uses default if not set) | Optional |

**Where to get your API key:**

| `AI_PROVIDER` value | Provider | Sign up URL | Default model | Free tier |
|---------------------|----------|-------------|---------------|-----------|
| `qwen` | Qwen (Alibaba) | [DashScope Console](https://dashscope.console.aliyun.com/) | `qwen-vl-plus` | Free quota available |
| `gemini` | Google Gemini | [Google AI Studio](https://aistudio.google.com/apikey) | `gemini-2.0-flash` | 15 requests/minute free |
| `openai` | OpenAI | [OpenAI Platform](https://platform.openai.com/api-keys) | `gpt-4o` | No free tier, pay-per-use |

```bash
# Example: Using Qwen
supabase secrets set AI_PROVIDER=qwen
supabase secrets set AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# Example: Using Gemini
supabase secrets set AI_PROVIDER=gemini
supabase secrets set AI_API_KEY=AIzaSy...

# Example: Using OpenAI
supabase secrets set AI_PROVIDER=openai
supabase secrets set AI_API_KEY=sk-proj-...
```

#### 4.4 Push Notification Secrets (optional, not yet implemented)

```bash
# JPush
supabase secrets set JPUSH_APP_KEY=xxx JPUSH_MASTER_SECRET=xxx
# GeTui
supabase secrets set GETUI_APP_ID=xxx GETUI_APP_KEY=xxx GETUI_MASTER_SECRET=xxx
```

### Step 5: Get Frontend Configuration Credentials

Go to Dashboard → **Settings** → **API**:

| Field | Location | Example |
|-------|----------|---------|
| **Project URL** | `URL` section | `https://abcdefgh.supabase.co` |
| **Anon Key** | `anon` `public` | `eyJhbGciOiJIUzI1NiIs...` |

> **Never put Service Role Key in the frontend!** It's only used internally by Edge Functions (auto-injected).

### Step 6: Configure PWA Frontend

**Method A: ConfigManager UI (Recommended)**

Open PWA → Settings → Backend Configuration:
1. Enter **Supabase URL** and **Anon Key**
2. Toggle **Enable Backend Proxy**
3. Select your IM provider and enter its App ID
4. Click **Test Connection** to verify
5. Save

**Method B: Environment Variables (.env)**

```bash
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Step 7: Verify Deployment

```bash
# Test health endpoint
curl -i https://abcdefgh.supabase.co/functions/v1/server/health \
  -H "apikey: your_anon_key"

# Expected: 200 OK + {"status":"ok"}

# Test chat-token health
curl -i https://abcdefgh.supabase.co/functions/v1/chat-token/health \
  -H "apikey: your_anon_key"

# Test ai-vision-proxy health
curl -i https://abcdefgh.supabase.co/functions/v1/ai-vision-proxy/health \
  -H "apikey: your_anon_key"
```

---

> **Options 2 & 3 (Tencent Cloud / Google Cloud)**: See the Chinese version (`SUPABASE_CN.md`) for complete deployment guides for alternative cloud providers. The steps are identical except for the hosting environment.

---

## Appendix A: Edge Function Endpoint Reference

| Function | Endpoint | Method | Description |
|----------|----------|--------|-------------|
| `server` | `/server/health` | GET | Health check |
| `server` | `/server/send-code` | POST | Send OTP verification code |
| `server` | `/server/auth` | POST | Verify OTP + return JWT |
| `server` | `/server/oauth-exchange` | POST | OAuth authorization code exchange |
| `server` | `/server/profile` | GET | Get user profile |
| `server` | `/server/profile` | POST | Save user profile |
| `server` | `/server/config` | GET | Read remote config |
| `server` | `/server/config` | POST | Write remote config (optimistic locking) |
| `server` | `/server/config/history` | GET | List config version history |
| `server` | `/server/config/rollback` | POST | Rollback to a previous config version |
| `server` | `/server/contacts` | GET | List dealer's farmer contacts (requires JWT) |
| `server` | `/server/contacts` | POST | Add/upsert a farmer contact (requires JWT) |
| `server` | `/server/contacts/:id` | PATCH | Update a contact (mute, rename, etc.) |
| `server` | `/server/contacts/:id` | DELETE | Remove a contact |
| `server` | `/server/ledger` | GET | Get dealer's ledger data (requires JWT) |
| `server` | `/server/ledger` | POST | Save dealer's ledger data (requires JWT, optimistic lock) |
| `chat-token` | `/chat-token/health` | GET | Health check (shows supported IM providers) |
| `chat-token` | `/chat-token/token` | POST | Generate IM token (Tencent UserSig / CometChat authToken) |
| `ai-vision-proxy` | `/ai-vision-proxy/health` | GET | Health check (shows current AI provider and model) |
| `ai-vision-proxy` | `/ai-vision-proxy` | POST | AI analysis (image / text follow-up / voice follow-up, auto-detected) |

> **chat-token/token POST body**: `{ "uid": "user_id", "provider": "tencent-im or cometchat" }`
>
> **ai-vision-proxy POST body** — three modes:
> - Image analysis: `{ "image": "base64_image", "detections": [...], "modelId": "optional" }`
> - Text follow-up: `{ "followUp": true, "userMessage": "question", "previousAnalysis": "context" }`
> - Voice follow-up: `{ "voiceFollowUp": true, "audio": "base64_audio", "previousAnalysis": "context" }`
>
> **ledger GET response**: `{ "data": {...LedgerState}, "version": 3, "updatedAt": "..." }`
>
> **ledger POST body**: `{ "data": {...LedgerState}, "version": 3 }`
> - Success 200: `{ "success": true, "version": 4 }`
> - Conflict 409: `{ "success": false, "conflict": true, "serverVersion": 5 }`

## Appendix B: Database Schema

| Table | Primary Key | Purpose | RLS |
|-------|-------------|---------|-----|
| `app_config` | `id` (TEXT, fixed 'main') | Remote config (single-row JSONB) | service_role only |
| `config_history` | `id` (BIGINT, auto-increment) | Config version history | service_role only |
| `user_profiles` | `user_id` (UUID → auth.users) | User profiles | service_role only |
| `dealer_contacts` | `id` (UUID, auto) | Dealer's farmer contacts | service_role only |
| `dealer_ledger` | `dealer_id` (UUID → auth.users) | Dealer's ledger data (single-row JSONB) | service_role only |

## Appendix C: Secrets Quick Reference

> "Auto" = set automatically. "As needed" = only set for your chosen provider.

| Secret | Used by | Description | Required? |
|--------|---------|-------------|-----------|
| `SUPABASE_URL` | server | Project URL | Auto |
| `SUPABASE_ANON_KEY` | server | Public key | Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Admin key (DB operations) | Auto |
| `TENCENT_IM_APP_ID` | chat-token | Tencent IM SDKAppID (numeric) | As needed |
| `TENCENT_IM_SECRET_KEY` | chat-token | Tencent IM key (generates UserSig) | As needed |
| `COMETCHAT_APP_ID` | chat-token | CometChat App ID | As needed |
| `COMETCHAT_AUTH_KEY` | chat-token | CometChat REST API Key | As needed |
| `COMETCHAT_REGION` | chat-token | CometChat region (us/eu/in) | As needed |
| `AI_PROVIDER` | ai-vision-proxy | AI provider: `qwen`/`gemini`/`openai` | As needed |
| `AI_API_KEY` | ai-vision-proxy | API key for chosen AI provider | As needed |
| `AI_BASE_URL` | ai-vision-proxy | Custom API URL (default: not set) | Optional |
| `AI_MODEL_ID` | ai-vision-proxy | Custom model ID (default: not set) | Optional |

## Appendix D: PWA Frontend Configuration

The PWA frontend connects to the backend via these fields:

```typescript
interface BackendProxyConfig {
  supabaseUrl: string;       // Backend URL (Supabase or compatible gateway)
  supabaseAnonKey: string;   // Public API key
  edgeFunctionName: string;  // Default "server"
  enabled: boolean;          // Enable toggle
  chatProvider: 'tencent-im' | 'cometchat';
  imMode: 'im-provider-direct';
  tencentAppId: string;      // Tencent IM SDKAppID (public)
  cometchatAppId: string;    // CometChat App ID (public)
  cometchatRegion: string;   // CometChat region
}
```

**Configuration priority**: ConfigManager UI > localStorage > .env > backend.json

## Appendix E: Troubleshooting

### Q1: Test connection says "Connected but app_config table not found"

Run the `001_init.sql` schema script in SQL Editor. Confirm it returns "Success".

### Q2: Edge Function returns 401

Verify your request headers include `apikey: {anon_key}`. The Supabase gateway uses the `apikey` header to route requests.

### Q3: chat-token returns "not configured"

Check that the correct secrets are set for your chosen IM provider. Use the health endpoint to verify: `GET /chat-token/health`.

### Q4: ai-vision-proxy returns "AI provider not configured"

Set `AI_PROVIDER` and `AI_API_KEY` secrets. Use the health endpoint to verify: `GET /ai-vision-proxy/health`.
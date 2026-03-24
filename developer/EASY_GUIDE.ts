/**
 * ============================================================================
 *
 *   TaprootAgro — Easy Deployment Guide (For Non-Technical Users)
 *
 *   Total time: ~30 minutes | No coding required
 *
 * ============================================================================
 *
 *   ① Code issues can be fixed online anytime. 1 TB of CDN traffic
 *     covers ~3 million users, costing only about $20. So the most
 *     important thing is to get your PWA/App onto farmers' phones
 *     as fast as possible.
 *
 *   ② If you can't set up the backend right away, start by editing
 *      content in the built-in Config Manager, generate a QR code / APK,
 *      and get your spot first — claim your market before anyone else.
 *
 *   ③ Good Luck!
 *
 *   ————————————————————————————————————————————————————————————————————
 *
 *   1. 代码如有问题可以在线修复。1TB 流量可覆盖约 300 万用户，CDN 成本
 *      约 20 美金。所以最重要的事情，是快速把 PWA/App 推广到农户手机上。
 *
 *   2. 如果你短时间搞不定后端设置，先在内置的内容管理器里编辑信息，
 *      生成二维码/App，先去占位子。
 *
 *   3. Good Luck!
 *
 * ============================================================================
 *
 *   OVERVIEW — What you'll do:
 *
 *     Step 1: Set up Supabase backend (database + APIs)
 *     Step 2: Deploy your PWA website
 *     Step 3: Fork the builder repo on GitHub to get your Android APK
 *
 *   How to update content (including all personalization):
 *
 *     In Cursor: open this repo → edit ConfigManagerPage / taprootagrosetting/*.json
 *       (use AI chat + preview, or run the PWA locally and use the in-app Config Manager UI)
 *       → Commit & push to GitHub → auto-deploy to Cloudflare Pages / Vercel / Netlify / EdgeOne
 *       → Farmers' phones auto-update within ~1 minute
 *
 *     That's it. Edit in Cursor, push once, everyone gets the update.
 *
 * ============================================================================
 */


// ============================================================================
//
//   STEP 1: SET UP SUPABASE BACKEND
//   ~15 minutes | Your database + API + auth
//
// ============================================================================
/**
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │  You have THREE options for Supabase — choose ONE:                │
 *   │                                                                    │
 *   │  Option A: Supabase Cloud (supabase.com)                          │
 *   │            → Fastest to start, 5 minutes                          │
 *   │                                                                    │
 *   │  Option B: Self-hosted server + Supabase Docker                   │
 *   │            → Full data localization, complete control              │
 *   │                                                                    │
 *   │  Option C: Alibaba Cloud PolarDB Supabase                        │
 *   │            → Fully managed cloud hosting, zero maintenance        │
 *   │                                                                    │
 *   │  All three work identically with TaprootAgro.                     │
 *   │  The ONLY difference is the URL + Key you enter in Config Manager.│
 *   └────────────────────────────────────────────────────────────────────┘
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   OPTION A: Supabase Cloud (Fastest to start)
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   1.1A  Create a Supabase account
 *   ─────────────────────────────────
 *     ① Go to https://supabase.com → Sign up with GitHub (recommended)
 *     ② Click "New Project"
 *     ③ Name: anything you like (e.g., "greenfarm-backend")
 *     ④ Database password: set one and SAVE IT (you won't see it again)
 *     ⑤ Region: choose the closest to your farmers
 *        (Singapore for Southeast Asia, Mumbai for South Asia, etc.)
 *     ⑥ Click "Create new project" → wait ~2 minutes
 *
 *     Your credentials (find in Dashboard → Settings → API):
 *       Project URL:  https://xxxxxxxx.supabase.co
 *       Anon Key:     eyJhbGciOiJ...
 *
 *     → Skip to "ALL OPTIONS — Continue here" below.
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   OPTION B: Self-Hosted Server + Supabase Docker (Data Localization)
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   Why self-host?
 *     - Data stays on YOUR server — full sovereignty
 *     - Required by some countries' data localization laws
 *     - Works with any cloud provider (Tencent, AWS, Azure, etc.)
 *
 *   1.1B  Buy a cloud server (any provider)
 *   ─────────────────────────────────────────
 *     Recommended specs:
 *       - OS: Ubuntu 22.04 LTS
 *       - Specs: 4 vCPU, 8 GB RAM, 60 GB SSD (minimum)
 *       - Any provider works: Tencent Cloud Lighthouse, AWS Lightsail,
 *         DigitalOcean, Hetzner, etc.
 *
 *   1.2B  Install Supabase (4 commands)
 *   ─────────────────────────────────────
 *     SSH into your server, then run:
 *
 *     ```bash
 *     # 1. Install Docker
 *     curl -fsSL https://get.docker.com | sh
 *     sudo systemctl enable docker && sudo systemctl start docker
 *
 *     # 2. Clone Supabase Docker setup
 *     git clone --depth 1 https://github.com/supabase/supabase
 *     cd supabase/docker
 *
 *     # 3. Create config from template
 *     cp .env.example .env
 *
 *     # 4. Start everything
 *     docker compose up -d
 *     ```
 *
 *     Wait ~2 minutes. Open: http://YOUR_SERVER_IP:8000
 *
 *   1.3B  Secure your installation (important!)
 *   ──────────────────────────────────────────────
 *     Edit the .env file — CHANGE these default values:
 *
 *       POSTGRES_PASSWORD=your-strong-db-password
 *       JWT_SECRET=your-random-string-at-least-32-chars
 *       DASHBOARD_USERNAME=admin
 *       DASHBOARD_PASSWORD=your-dashboard-password
 *
 *     Then regenerate API keys:
 *       Go to https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
 *       Use your JWT_SECRET to generate ANON_KEY and SERVICE_ROLE_KEY.
 *       Put them in .env, then restart:
 *
 *     ```bash
 *     docker compose down && docker compose up -d
 *     ```
 *
 *   1.4B  Set up HTTPS (recommended)
 *   ──────────────────────────────────
 *     Point a domain to your server IP, then use any method you prefer:
 *       - Cloudflare proxy (easiest — just toggle the orange cloud)
 *       - Your cloud provider's free SSL certificate service
 *       - Certbot: sudo apt install certbot && sudo certbot --standalone
 *
 *     Your credentials:
 *       Supabase URL:  https://api.your-domain.com
 *       Anon Key:      (the ANON_KEY from your .env file)
 *
 *     → Skip to "ALL OPTIONS — Continue here" below.
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   OPTION C: Alibaba Cloud PolarDB Supabase (Fully Managed)
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   Why PolarDB Supabase?
 *     - Fully managed — zero server maintenance
 *     - One-click deployment from Alibaba Cloud console
 *     - Includes database, auth, API, realtime — all components
 *     - Same Supabase API, no code changes needed
 *
 *   1.1C  Deploy PolarDB Supabase
 *   ───────────────────────────────
 *     ① Open: https://www.alibabacloud.com
 *       Search "PolarDB Supabase" → click "Deploy Now"
 *     ② Follow the wizard — select region, confirm resources
 *     ③ Wait ~5 minutes for provisioning
 *     ④ Get your Supabase URL + Anon Key from the console
 *
 *     For detailed steps, see:
 *       Alibaba Cloud documentation: "Supabase 一站式构建云上应用"
 *
 *     Your credentials:
 *       Supabase URL:  (from PolarDB Supabase console)
 *       Anon Key:      (from PolarDB Supabase console)
 *
 *     → Continue below.
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   ALL OPTIONS — Continue here
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   1.5  Run the database setup script
 *   ────────────────────────────────────
 *     ① In your Supabase Dashboard, click "SQL Editor" (left sidebar)
 *     ② Click "New query"
 *     ③ Open /developer/distributor.sql (single file = 001 + 002 merged), OR run
 *        /supabase/migrations/001_init.sql then 002_dealer_contacts.sql separately
 *     ④ Copy ALL content → paste into SQL Editor → click "Run"
 *     ⑤ See "Success" → done!
 *
 *     This creates all tables, triggers, helper functions, and dealer tables.
 *
 *
 *   1.6  Deploy Edge Functions
 *   ──────────────────────────
 *     Option A (Supabase Cloud): Use CLI
 *       ```
 *       supabase login
 *       supabase link --project-ref YOUR_PROJECT_REF
 *       supabase functions deploy server
 *       supabase functions deploy chat-token
 *       supabase functions deploy ai-vision-proxy
 *       ```
 *
 *     Option B (Self-hosted / PolarDB): Copy function files to Docker
 *
 *       You only need 3 small files — no need to clone the whole PWA repo
 *       to the server. From YOUR computer (where you have the PWA project):
 *
 *       ```bash
 *       # On YOUR computer — send the 3 files to your server:
 *       scp supabase/functions/server/index.tsx      root@YOUR_SERVER_IP:~/server.tsx
 *       scp supabase/functions/chat-token/index.tsx   root@YOUR_SERVER_IP:~/chat-token.tsx
 *       scp supabase/functions/ai-vision-proxy/index.tsx root@YOUR_SERVER_IP:~/ai-vision-proxy.tsx
 *       ```
 *
 *       Then SSH into the server and move them into place:
 *
 *       ```bash
 *       # On the SERVER:
 *       cd ~/supabase/docker
 *       mkdir -p volumes/functions/{server,chat-token,ai-vision-proxy}
 *       mv ~/server.tsx          volumes/functions/server/index.tsx
 *       mv ~/chat-token.tsx      volumes/functions/chat-token/index.tsx
 *       mv ~/ai-vision-proxy.tsx volumes/functions/ai-vision-proxy/index.tsx
 *       docker compose restart functions
 *       ```
 *
 *       Alternative: open each file on GitHub, copy the content,
 *       SSH into server, paste with nano/vim. Same result.
 *
 *     Don't want to use CLI? Ask your developer to run these commands once.
 *
 *
 *   1.7  Set secrets (API keys) — optional
 *   ────────────────────────────────────────
 *     In Supabase Dashboard → Project Settings → Edge Functions → Secrets:
 *
 *     ┌───────────────────────────┬────────────────────────────────────────┐
 *     │  Secret Name              │  Where to get it                      │
 *     ├───────────────────────────┼────────────────────────────────────────┤
 *     │  TENCENT_IM_APP_ID       │  Tencent Cloud IM Console             │
 *     │  TENCENT_IM_SECRET_KEY   │  Tencent Cloud IM Console             │
 *     ├───────────────────────────┼────────────────────────────────────────┤
 *     │  AI_PROVIDER             │  "qwen" or "gemini" or "openai"       │
 *     │  AI_API_KEY              │  DashScope / Google AI / OpenAI key    │
 *     └───────────────────────────┴────────────────────────────────────────┘
 *
 *     Note: IM and AI secrets are optional. App works in demo mode without them.
 *
 *
 *   1.8  Save your Supabase credentials
 *   ──────────────────────────────────────────────────────────────────
 *       Project URL:  https://xxxxxxxx.supabase.co    ← Copy this
 *       Anon Key:     eyJhbGciOiJ...                  ← Copy this
 *
 *     You'll enter these in Cursor: ConfigManagerPage or taprootagrosetting/backend.json
 *     (see the update workflow in Step 2 below).
 *
 */


// ============================================================================
//
//   STEP 2: DEPLOY YOUR PWA WEBSITE
//   ~5 minutes | Push to GitHub → auto-deploy → farmers get updates
//
// ============================================================================
/**
 *
 *   How the update pipeline works:
 *
 *     ┌──────────────┐     ┌──────────┐     ┌──────────────────────────┐
 *     │    Cursor    │────▶│  GitHub  │────▶│ Cloudflare Pages /       │
 *     │  (edit+push) │push │  (repo)  │auto │ Vercel / Netlify / EdgeOne │
 *     └──────────────┘     └──────────┘     └────────────┬─────────────┘
 *                                                         │ auto-update
 *                                                         ▼
 *                                                ┌─────────────────┐
 *                                                │  Farmers' phones │
 *                                                │  (PWA or APK)    │
 *                                                └─────────────────┘
 *
 *     Edit in Cursor, commit, push — your connected host rebuilds.
 *     Within ~1 minute the site is live. Farmers get the new version
 *     on next visit (browser PWA or APK WebView). No reinstall for content.
 *
 *
 *   2.0  Edit in Cursor (visual-friendly workflow)
 *   ────────────────────────────────────────────────
 *     ① File → Open Folder → select your TaprootAgro PWA repo
 *     ② To change branding, articles, market data: open taprootagrosetting/*.json
 *        OR src/app/components/ConfigManagerPage.tsx for the settings UI
 *     ③ Optional preview: Terminal → npm install && npm run dev → open the local URL
 *        in your browser; use the in-app **Config Manager** (password taprootagro)
 *        for form-based editing — still the fastest "visual" path for non-devs
 *     ④ Source Control (left sidebar) → Stage → Commit message → Push
 *        (or: Terminal → git add -A && git commit -m "update config" && git push)
 *
 *     Use Cursor Chat (Cmd/Ctrl+L) to ask: "Change the app name in branding to X"
 *     and apply the suggested edits — no need to hand-edit JSON by memory.
 *
 *
 *   2.1  Push to GitHub → connect hosting platform
 *   ─────────────────────────────────────────────────
 *     After your repo is on GitHub, connect ONE host below (CI builds on every push).
 *
 *     Choose one:
 *
 *     ┌──────────────────────────────────────────────────────────────────┐
 *     │                                                                  │
 *     │  Option A: Vercel (Recommended — easiest)                       │
 *     │    ① https://vercel.com → "Add New Project" → import GitHub repo│
 *     │    ② Framework: Vite → click "Deploy" → wait 1-2 min → DONE   │
 *     │    ③ Your URL: https://your-project.vercel.app                 │
 *     │    Every future git push auto-deploys within ~60 seconds.       │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  Option B: Netlify                                              │
 *     │    ① https://netlify.com → "Add new site" → import GitHub      │
 *     │    ② Build command: npm run build | Publish dir: dist           │
 *     │    ③ Your URL: https://your-project.netlify.app                │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  Option C: Tencent EdgeOne Pages                                │
 *     │    ① EdgeOne Console → create project → connect GitHub repo    │
 *     │    ② Build command: npm run build | Output dir: dist            │
 *     │    ③ Bind your custom domain                                   │
 *     │    Advantage: excellent CDN for users in Asia                   │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  Option D: Cloudflare Pages (global CDN, generous free tier)     │
 *     │    ① https://dash.cloudflare.com → Workers & Pages → Create      │
 *     │       application → Pages → Connect to Git                       │
 *     │    ② Select your GitHub repo + production branch (e.g. main)    │
 *     │    ③ Framework preset: Vite (or set manually):                   │
 *     │       Build command: npm run build                               │
 *     │       Build output directory: dist                               │
 *     │    ④ Environment variables (if needed): add VITE_* from .env    │
 *     │       example in repo root — same names as local dev            │
 *     │    ⑤ Deploy → you get https://<project>.pages.dev               │
 *     │    Every git push triggers a new build (~1–2 min).               │
 *     │    Custom domain: Pages project → Custom domains → add CNAME.   │
 *     │                                                                  │
 *     └──────────────────────────────────────────────────────────────────┘
 *
 *     After deployment, your PWA is live!
 *     Farmers can open it in any browser and "Add to Home Screen".
 *
 */


// ============================================================================
//
//   STEP 3: FORK THE BUILDER REPO ON GITHUB TO GET YOUR ANDROID APK
//   ~10 minutes | No software to install
//
// ============================================================================
/**
 *
 *   3.1  Fork the builder repository (one-time)
 *   ──────────────────────────────────────────────
 *     ① Go to: https://github.com/user/taprootagro-builder
 *        (Replace "user" with the actual account)
 *     ② Click "Fork" (top right) → "Create fork"
 *
 *
 *   3.2  Run the build (3 fields, 1 button)
 *   ─────────────────────────────────────────
 *     ① In YOUR forked repo → "Actions" tab
 *     ② Click "Build Android App" (left sidebar)
 *     ③ Click "Run workflow" dropdown → fill in:
 *
 *       ┌────────────────────────────────────────────────────────────┐
 *       │   App display name:    GreenFarm Ghana                    │
 *       │   Android package ID:  com.greenfarm.ghana                │
 *       │   PWA source repo URL: https://github.com/you/your-pwa   │
 *       │   Version:             1.0.0                              │
 *       └────────────────────────────────────────────────────────────┘
 *
 *     ④ Click "Run workflow" → wait ~8-12 minutes
 *
 *
 *   3.3  Download your APK
 *   ───────────────────────
 *     ① Click the completed run (green ✓) → scroll to "Artifacts"
 *     ② Download the ZIP → inside you'll find:
 *
 *       YourApp.apk          ← Install on Android phones
 *       YourApp.aab          ← Upload to Google Play Store
 *       release.keystore     ← YOUR SIGNING KEY — SAVE THIS!!
 *       keystore-info.txt    ← Passwords — SAVE THIS!!
 *
 *
 *   3.4  ⚠ CRITICAL: Save your signing key
 *   ────────────────────────────────────────
 *     You MUST keep release.keystore + keystore-info.txt forever.
 *     Without them, you cannot update your app on Google Play.
 *
 *     Best practice: store the keystore as a GitHub Secret:
 *       ① Your builder repo → Settings → Secrets → Actions
 *       ② Add secret: KEYSTORE_BASE64  = (base64 of release.keystore)
 *       ③ Add secret: KEYSTORE_PASS    = (password from keystore-info.txt)
 *
 *     How to base64-encode:
 *       Mac/Linux:  base64 release.keystore
 *       Windows:    certutil -encode release.keystore tmp.b64
 *
 *
 *   3.5  Distribute the APK to farmers
 *   ────────────────────────────────────
 *     Option A: Send .apk via WhatsApp/email → tap to install
 *     Option B: Upload .aab to Google Play Store ($25 one-time fee)
 *     Option C: Host .apk on your website → share download link
 *
 *
 *   3.6  When to rebuild?
 *   ──────────────────────
 *     ❌ NO rebuild needed for: content changes — edit in Cursor or in-app
 *        Config Manager, push to GitHub, auto-deploys within ~1 minute
 *
 *     ✅ Rebuild needed for: app icon change, package ID change,
 *        new Capacitor plugins, major version upgrade
 *
 */


// ============================================================================
//
//   QUICK REFERENCE FLOW CHART
//
// ============================================================================
/**
 *
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                                                                       │
 *   │   FIRST TIME SETUP (do once, ~30 min)                                │
 *   │                                                                       │
 *   │   ① Supabase: create project → run SQL → deploy functions            │
 *   │   ② Hosting: connect GitHub repo → Vercel/Netlify/EdgeOne            │
 *   │   ③ GitHub: fork builder → run Action → download APK                │
 *   │                                                                       │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │                                                                       │
 *   │   CONTENT & CONFIG UPDATES                                           │
 *   │                                                                       │
 *   │   Cursor → ConfigManagerPage / taprootagrosetting/*.json / Chat      │
 *   │     → push to GitHub → Cloudflare Pages / Vercel / Netlify / EdgeOne │
 *   │     → All users (PWA + APK) auto-update within ~1 minute             │
 *   │                                                                       │
 *   │   That's it. Edit in Cursor, push once, everyone gets the update.    │
 *   │                                                                       │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │                                                                       │
 *   │   CODE UPDATES (structural changes, bug fixes)                       │
 *   │                                                                       │
 *   │   Cursor → push to GitHub → same CDN host auto-deploys               │
 *   │     → All users (PWA + APK) auto-update within ~1 minute             │
 *   │                                                                       │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 */


// ============================================================================
//
//   FAQ
//
// ============================================================================
/**
 *
 *   Q: Do I need to know how to code?
 *   A: No. Run the PWA locally or on your URL and open **Config Manager**
 *      (in-app form editor). Or in Cursor, use Chat: "update banner title to …"
 *      and apply. Then push to GitHub.
 *
 *   Q: Do I need to edit JSON files?
 *   A: Optional. You can use only the in-app Config Manager. Power users may
 *      edit taprootagrosetting/*.json in Cursor for bulk changes.
 *
 *   Q: How do content updates reach farmers?
 *   A: Save in Config Manager (or commit JSON edits in Cursor) → push to GitHub →
 *      Cloudflare Pages / Vercel / etc. rebuilds → ~1 min later the site updates.
 *      Farmers see it on next visit. Same for PWA and APK WebView.
 *
 *   Q: Which Supabase option should I choose?
 *   A: Option A (Supabase Cloud): fastest start, free tier covers ~50K users.
 *      Option B (Self-hosted): when you need data to stay on your own server.
 *      Option C (Alibaba Cloud PolarDB): fully managed, no maintenance needed.
 *      All three use the same API — switching is just changing URL + Key.
 *
 *   Q: How much does this cost?
 *   A: Supabase Cloud free tier: ~50,000 monthly users. $0/month.
 *      Self-hosted: depends on server (~$10-30/month).
 *      Alibaba Cloud PolarDB: pay-as-you-go pricing.
 *      Vercel / Cloudflare Pages free tiers: sufficient for most apps. $0/month.
 *      CDN: ~$20 per 1 TB on paid tiers (covers ~3 million users).
 *
 *   Q: Can multiple people use the Config Manager?
 *   A: Yes. Anyone with the password "taprootagro" can access it.
 *      The optimistic locking system prevents conflicts.
 *
 *   Q: What if I break the config?
 *   A: Every save creates an automatic backup. To rollback:
 *      Supabase SQL Editor → SELECT rollback_config(N);
 *      where N is the version you want to restore.
 *
 *   Q: Self-hosted Supabase — how to update?
 *   A: SSH → cd supabase/docker → docker compose pull → docker compose up -d
 *      Takes ~2 minutes, zero downtime.
 *
 */
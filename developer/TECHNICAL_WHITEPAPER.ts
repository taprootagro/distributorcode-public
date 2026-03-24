/**
 * ============================================================================
 * TaprootAgro Technical Whitepaper — PWA & App Architecture Guide
 * ============================================================================
 *
 * Document Version: 1.0.0
 * Created: 2026-03-18
 * Classification: Client Technical Deliverable
 * Target Audience: Engineering teams, CTOs, technical evaluators
 *
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 *
 *   1.  Executive Summary
 *   2.  Architecture Overview
 *   3.  Technology Stack
 *   4.  Repository Structure
 *   5.  Dual-Mode Runtime (PWA + Native App)
 *   6.  Capacitor Bridge — 27 Plugin Abstraction Layer
 *   7.  Configuration Management System
 *   8.  Remote Content Management (Hot Update)
 *   9.  Authentication System
 *   10. Instant Messaging (IM) Architecture
 *   11. Cloud AI Vision Analysis
 *   12. Internationalization (i18n) — 20 Languages
 *   13. Push Notification Multi-Provider Architecture
 *   14. Resilience Engineering
 *   15. Performance Optimization
 *   16. Security Model
 *   17. Supabase Backend — Edge Functions & Database
 *   18. Android App Build Pipeline
 *   18b. Service Worker — Remote Config Update URL
 *   19. White-Label Customization Guide
 *   20. Deployment Checklist
 *
 * ============================================================================
 */


// ============================================================================
// 1. EXECUTIVE SUMMARY
// ============================================================================
/**
 * TaprootAgro is a production-grade Progressive Web Application (PWA) designed
 * for farmers in developing countries. It ships as a single codebase that runs
 * in two modes:
 *
 *   - PWA Mode: Accessed via browser (installable to home screen)
 *   - Native App Mode: PWA source bundled into an Android APK via Capacitor
 *
 * Key design principles:
 *   - Offline-first: Works without network connectivity
 *   - Low-device-friendly: Optimized for 1-2 GB RAM Android devices
 *   - Multilingual: 20 languages including RTL (Arabic, Urdu, Persian)
 *   - White-label ready: Every UI element, text, and asset is configurable
 *   - Zero-downtime updates: Remote config hot-update without app rebuild
 *   - Backend-optional: Full demo mode when no backend is connected
 */


// ============================================================================
// 2. ARCHITECTURE OVERVIEW
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         CLIENT (Single Codebase)                       │
 * │                                                                        │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
 * │  │   HomePage    │  │  MarketPage  │  │ CommunityPage│  │ProfilePage│  │
 * │  │  (Banners,    │  │ (Products,   │  │  (IM Chat,   │  │ (QR Code, │  │
 * │  │   Articles,   │  │  Categories, │  │  Voice Msg)  │  │  Settings)│  │
 * │  │   LiveStream) │  │  Ads)        │  │              │  │           │  │
 * │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
 * │         │                  │                  │                │        │
 * │  ┌──────┴──────────────────┴──────────────────┴────────────────┴─────┐  │
 * │  │                    ConfigProvider (Singleton)                      │  │
 * │  │         deepMerge( defaultConfig, remoteConfig, localStorage )    │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │  ┌──────────────────────────┴────────────────────────────────────────┐  │
 * │  │                    Service Layer                                   │  │
 * │  │  ConfigSyncService │ ChatProxyService │ CloudAIService │ Auth     │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │  ┌──────────────────────────┴────────────────────────────────────────┐  │
 * │  │                    Utility Layer                                    │  │
 * │  │  apiClient │ safeStorage │ capacitor-bridge │ errorMonitor │ db   │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │         ┌───────────────────┼──────────────────┐                       │
 * │         ▼                   ▼                  ▼                       │
 * │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐                │
 * │  │  PWA APIs   │  │  Capacitor   │  │  localStorage  │                │
 * │  │  (Browser)  │  │  Plugins     │  │  + IndexedDB   │                │
 * │  └─────────────┘  └──────────────┘  └────────────────┘                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         SUPABASE BACKEND                               │
 * │                                                                        │
 * │  Edge Functions:                    Database:                          │
 * │  ┌─────────────────┐               ┌─────────────────┐                │
 * │  │ /server          │               │ app_config      │                │
 * │  │  /health         │               │ (single-row     │                │
 * │  │  /config (R/W)   │               │  JSONB config)  │                │
 * │  │  /send-code      │               ├─────────────────┤                │
 * │  │  /auth           │               │ config_history  │                │
 * │  │  /oauth-exchange │               │ (auto snapshots)│                │
 * │  │  /profile (R/W)  │               ├─────────────────┤                │
 * │  │  /config/history │               │ user_profiles   │                │
 * │  │  /config/rollback│               │ (user data)     │                │
 * │  ├─────────────────┤               └─────────────────┘                │
 * │  │ /chat-token      │                                                  │
 * │  │  /token          │               Triggers:                          │
 * │  │  /health         │               - Auto version increment           │
 * │  ├─────────────────┤               - Auto timestamp update             │
 * │  │ /ai-vision-proxy │               - Auto history snapshot            │
 * │  │  / (POST)        │                                                  │
 * │  │  /health         │               RLS: All tables locked to          │
 * │  └─────────────────┘               service_role (no direct access)    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */


// ============================================================================
// 3. TECHNOLOGY STACK
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Layer              │ Technology           │ Version                    │
 * ├─────────────────────┼──────────────────────┼────────────────────────────┤
 * │  Framework          │ React                │ 18.3.1                     │
 * │  Build Tool         │ Vite                 │ 6.3.5                      │
 * │  CSS                │ Tailwind CSS         │ 4.1.12                     │
 * │  Routing            │ React Router         │ 7.13.0 (Data mode)         │
 * │  UI Components      │ Radix UI + shadcn/ui │ Latest                     │
 * │  Animation          │ Motion (Framer)      │ 12.34.3                    │
 * │  Charts             │ Recharts             │ 3.8.0                      │
 * │  Icons              │ Lucide React         │ 0.487.0                    │
 * │  QR Code            │ qrcode.react         │ 4.2.0                      │
 * │  Virtual Scroll     │ react-virtuoso       │ 4.18.3                     │
 * │  Form               │ react-hook-form      │ 7.55.0                     │
 * │  Storage            │ idb (IndexedDB)      │ 8.0.3                      │
 * │  Backend            │ Supabase             │ 2.99.1                     │
 * │  Language           │ TypeScript           │ 5.9.3                      │
 * │  Native Bridge      │ Capacitor            │ 6.x (via bridge)           │
 * │  IM SDK             │ @tencentcloud/chat   │ Dynamic import (ESM CDN)   │
 * │  IM SDK (alt)       │ CometChat SDK        │ Dynamic import (ESM CDN)   │
 * │  Edge Runtime       │ Deno (Supabase)      │ Latest                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Notable: No Capacitor packages are installed in the PWA repo.
 * The bridge layer uses window.__CAP_PLUGINS__ global registry,
 * populated only during native app builds by taprootagro-builder.
 */


// ============================================================================
// 4. REPOSITORY STRUCTURE
// ============================================================================
/**
 * Two-Repo Architecture:
 *
 *   Repo 1: PWA Source (this repo)
 *   ├── src/
 *   │   ├── app/
 *   │   │   ├── App.tsx                    ← Entry point (RouterProvider)
 *   │   │   ├── routes.tsx                 ← React Router Data mode config
 *   │   │   ├── constants.ts               ← Shared constants
 *   │   │   ├── components/                ← 40+ page/feature components
 *   │   │   │   ├── Root.tsx               ← Provider tree root
 *   │   │   │   ├── Layout.tsx             ← Tab bar + keep-alive container
 *   │   │   │   ├── HomePage.tsx           ← Banners, articles, live streams
 *   │   │   │   ├── MarketPage.tsx         ← Products, categories
 *   │   │   │   ├── CommunityPage.tsx      ← IM chat interface
 *   │   │   │   ├── ProfilePage.tsx        ← User profile, QR card
 *   │   │   │   ├── LoginPage.tsx          ← OTP + OAuth login
 *   │   │   │   ├── OAuthCallback.tsx      ← OAuth redirect handler
 *   │   │   │   ├── ConfigManagerPage.tsx  ← Admin config editor
 *   │   │   │   ├── AIAssistantPage.tsx    ← AI crop diagnosis
 *   │   │   │   ├── community/             ← Chat sub-components
 *   │   │   │   ├── ui/                    ← 47 shadcn/ui primitives
 *   │   │   │   └── figma/                 ← Figma-generated components
 *   │   │   ├── hooks/                     ← 14 custom hooks
 *   │   │   │   ├── ConfigProvider.tsx     ← Global config singleton
 *   │   │   │   ├── useLanguage.tsx        ← i18n provider + hook
 *   │   │   │   ├── useHomeConfig.tsx      ← Config types + defaults
 *   │   │   │   └── useRemoteConfig.ts     ← Feature flags + rollout
 *   │   │   ├── services/                  ← 6 service modules
 *   │   │   │   ├── ConfigSyncService.ts   ← Remote config fetch/push
 *   │   │   │   ├── ChatProxyService.ts    ← IM chat abstraction
 *   │   │   │   ├── IMProviderDirectAdapter.ts ← SDK direct IM
 *   │   │   │   ├── IMAdapter.ts           ← IM adapter interface
 *   │   │   │   ├── ChatUserService.ts     ← IM user registration
 *   │   │   │   └── CloudAIService.ts      ← Cloud vision AI proxy
 *   │   │   ├── utils/                     ← 18 utility modules
 *   │   │   │   ├── capacitor-bridge.ts    ← 27 plugin abstraction (1598 lines)
 *   │   │   │   ├── auth.ts               ← Login state + ID management
 *   │   │   │   ├── apiClient.ts          ← Unified API client
 *   │   │   │   ├── apiVersion.ts         ← API version negotiation
 *   │   │   │   ├── safeStorage.ts        ← localStorage safe wrapper
 *   │   │   │   ├── db.ts                 ← IndexedDB + degradation
 *   │   │   │   ├── deepMerge.ts          ← Recursive config merge
 *   │   │   │   ├── errorMonitor.ts       ← Error capture + reporting
 *   │   │   │   ├── silentRecovery.ts     ← Crash recovery + zombie detection
 *   │   │   │   ├── abTest.ts            ← A/B testing framework
 *   │   │   │   ├── rollout.ts           ← Gradual rollout system
 *   │   │   │   ├── cloudAIGuard.ts      ← AI anti-abuse protection
 *   │   │   │   ├── coordTransform.ts    ← GPS coord system conversion
 *   │   │   │   ├── wxJsSdk.ts           ← WeChat JS-SDK integration
 *   │   │   │   └── ...
 *   │   │   └── i18n/                     ← 20 language files
 *   │   │       └── lang/                 ← ar bn en es fa fr hi id ja ms my pt ru th tl tr ur vi zh zh-TW
 *   │   └── styles/                       ← Tailwind v4 theme
 *   ├── taprootagrosetting/               ← Brand config JSON files (10 modules)
 *   │   ├── index.ts                      ← Config aggregator
 *   │   ├── app.json                      ← Branding, icons, legal
 *   │   ├── home.json                     ← Banners, nav, articles
 *   │   ├── market.json                   ← Products, categories
 *   │   ├── chat.json                     ← IM contact config
 *   │   ├── auth.json                     ← Login providers
 *   │   ├── backend.json                  ← Supabase connection
 *   │   ├── ai.json                       ← AI model config
 *   │   ├── push.json                     ← Push notification config
 *   │   ├── live.json                     ← Live stream config
 *   │   └── legal.json                    ← About, privacy, terms
 *   ├── supabase/
 *   │   ├── migrations/001_init.sql       ← One-click DB setup (772 lines)
 *   │   └── functions/
 *   │       ├── server/index.tsx          ← Main Edge Function (581 lines)
 *   │       ├── chat-token/index.tsx      ← IM token generator (332 lines)
 *   │       └── ai-vision-proxy/index.tsx ← AI proxy (668 lines)
 *   └── developer/                        ← Technical documentation
 *
 *   Repo 2: taprootagro-builder (separate repo)
 *   ├── .github/workflows/build-android.yml
 *   ├── capacitor.config.ts
 *   ├── capacitor-loader.ts               ← Auto-generated plugin registry
 *   └── android/                          ← Capacitor Android project
 */


// ============================================================================
// 5. DUAL-MODE RUNTIME (PWA + NATIVE APP)
// ============================================================================
/**
 * The same source code runs in two environments without #ifdef or conditional
 * compilation. The runtime mode is determined by platform detection.
 *
 * ┌──────────────────────┬──────────────────────┬────────────────────────────┐
 * │                      │ PWA Mode             │ Native App Mode            │
 * ├──────────────────────┼──────────────────────┼────────────────────────────┤
 * │ Distribution         │ Browser / PWA install│ APK sideload / Play Store  │
 * │ Capacitor installed? │ No                   │ Yes (in builder repo)      │
 * │ __CAP_PLUGINS__      │ undefined            │ Populated by loader.ts     │
 * │ bridge.isNative()    │ false                │ true                       │
 * │ Camera               │ <input type="file">  │ @capacitor/camera          │
 * │ GPS                  │ navigator.geolocation│ @capacitor/geolocation     │
 * │ Push                 │ Web Push / FCM       │ @capacitor/push-notif.     │
 * │ Storage              │ localStorage         │ @capacitor/preferences     │
 * │ Updates              │ Service Worker       │ WebView loads live PWA     │
 * │ Bundle size impact   │ 0 KB (no Cap code)   │ All plugins in bundle      │
 * └──────────────────────┴──────────────────────┴────────────────────────────┘
 *
 * How it works:
 *
 *   1. PWA repo has ZERO Capacitor npm dependencies
 *   2. capacitor-bridge.ts uses loadPlugin() which reads from:
 *      window.__CAP_PLUGINS__['@capacitor/camera']
 *   3. In PWA mode: registry doesn't exist → loadPlugin returns null → Web fallback
 *   4. In App mode: builder repo's capacitor-loader.ts does:
 *      ```
 *      import { Camera } from '@capacitor/camera';
 *      window.__CAP_PLUGINS__ = {
 *        '@capacitor/camera': { Camera, CameraResultType, CameraSource },
 *        ...
 *      };
 *      ```
 *   5. Bridge reads plugin from registry → calls native API
 */


// ============================================================================
// 6. CAPACITOR BRIDGE — 27 PLUGIN ABSTRACTION LAYER
// ============================================================================
/**
 * File: /src/app/utils/capacitor-bridge.ts (1598 lines)
 *
 * Every native capability is wrapped with automatic Web fallback.
 * Import: `import { bridge } from './utils/capacitor-bridge'`
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  Tier 1: Core Functionality (8 plugins)                                   │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.camera     │ @capacitor/camera        │ Photo capture / gallery    │
 * │ bridge.geo        │ @capacitor/geolocation   │ GPS position + watch      │
 * │ bridge.pushNotif. │ @capacitor/push-notif.   │ Remote push registration  │
 * │ bridge.filesystem │ @capacitor/filesystem    │ Read/write/delete files   │
 * │ bridge.network    │ @capacitor/network       │ Network status + watch    │
 * │ bridge.device     │ @capacitor/device        │ Device info + unique ID   │
 * │ bridge.preferences│ @capacitor/preferences   │ Persistent key-value      │
 * │ bridge.app        │ @capacitor/app           │ Lifecycle + back button   │
 * ├────────────────────────────────────────────────────────────────────────────┤
 * │  Tier 2: Experience Enhancement (9 plugins)                               │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.keyboard   │ @capacitor/keyboard      │ Hide keyboard, events     │
 * │ bridge.statusBar  │ @capacitor/status-bar    │ Style, color, show/hide   │
 * │ bridge.splashScr. │ @capacitor/splash-screen │ Show/hide splash          │
 * │ bridge.haptics    │ @capacitor/haptics       │ Vibration feedback        │
 * │ bridge.localNotif.│ @cap/local-notifications │ Scheduled local alerts    │
 * │ bridge.share      │ @capacitor/share         │ System share sheet        │
 * │ bridge.clipboard  │ @capacitor/clipboard     │ Copy/paste               │
 * │ bridge.dialog     │ @capacitor/dialog        │ Native alert/confirm      │
 * │ bridge.toast      │ @capacitor/toast         │ Native toast messages     │
 * ├────────────────────────────────────────────────────────────────────────────┤
 * │  Tier 3: Enhanced Features (10 plugins)                                   │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.barcodeSc. │ @cap-community/barcode   │ QR/barcode scanning       │
 * │ bridge.speechRec. │ @cap-community/speech    │ Voice-to-text (illiterate)│
 * │ bridge.tts        │ @cap-community/tts       │ Text-to-speech (readout)  │
 * │ bridge.nativeAud. │ @cap-community/audio     │ Native audio playback     │
 * │ bridge.screenOr.  │ @cap/screen-orientation  │ Lock portrait/landscape   │
 * │ bridge.browser    │ @capacitor/browser       │ In-app browser            │
 * │ bridge.actionSh.  │ @capacitor/action-sheet  │ Bottom action menu        │
 * │ bridge.keepAwake  │ @cap-community/keep-awake│ Prevent screen sleep      │
 * │ bridge.fileOpener │ @cap-community/file-open │ Open files with native    │
 * │ bridge.contacts   │ @cap-community/contacts  │ Read phone contacts       │
 * └───────────────────┴──────────────────────────┴────────────────────────────┘
 */


// ============================================================================
// 7. CONFIGURATION MANAGEMENT SYSTEM
// ============================================================================
/**
 * All app content and behavior is driven by a single configuration object
 * of type HomePageConfig. This is the heart of the white-label system.
 *
 * Configuration Modules (10 JSON files in /taprootagrosetting/):
 *
 * ┌────────────────┬──────────────────────────────────────────────────────────┐
 * │ File           │ Controls                                                │
 * ├────────────────┼──────────────────────────────────────────────────────────┤
 * │ app.json       │ appBranding (logo, name, slogan), desktopIcon, filing  │
 * │ home.json      │ banners[], navigation[], liveStreams[], articles[],     │
 * │                │ videoFeed, homeIcons                                    │
 * │ market.json    │ currencySymbol, categories[], products[], ads[]         │
 * │ chat.json      │ chatContact (merchant IM binding), userProfile          │
 * │ auth.json      │ loginConfig (OAuth providers, phone/email toggle)       │
 * │ backend.json   │ backendProxyConfig (Supabase URL, IM provider, mode)   │
 * │ ai.json        │ aiModelConfig (ONNX local model), cloudAIConfig        │
 * │ push.json      │ pushConfig, pushProvidersConfig (5 providers)          │
 * │ live.json      │ liveShareConfig (WeChat share), liveNavigationConfig   │
 * │ legal.json     │ aboutUs, privacyPolicy, termsOfService                 │
 * └────────────────┴──────────────────────────────────────────────────────────┘
 *
 * Config Merge Priority (lowest to highest):
 *
 *   1. /taprootagrosetting/*.json    ← Code defaults (baked into build)
 *   2. Supabase app_config table     ← Remote config (hot-update)
 *   3. localStorage (user edits)     ← Local overrides (ConfigManagerPage)
 *
 * The ConfigProvider uses deepMerge() with MERGE_DEEP strategy to recursively
 * merge all three layers. Arrays use "replace" strategy (remote wins entirely).
 *
 * Provider Tree:
 *   Root.tsx → LanguageProvider → ConfigProvider → ErrorBoundary → Routes
 *
 * All components access config via:
 *   const { config, saveConfig } = useConfigContext();
 */


// ============================================================================
// 8. REMOTE CONTENT MANAGEMENT (HOT UPDATE)
// ============================================================================
/**
 * Two paths for updating app content without rebuilding:
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PATH A: Supabase Hot Update (Instant, no rebuild)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Admin edits config in Supabase Dashboard → Table Editor → app_config
 *     ↓
 *   Database trigger auto-increments version + saves history snapshot
 *     ↓
 *   User opens app (or returns from background → visibilitychange)
 *     ↓
 *   ConfigProvider calls GET /server/config
 *     ↓
 *   Compares remote version vs last synced version
 *     ↓
 *   If remote > local → deepMerge(defaults, remoteConfig) → apply
 *
 *   Trigger chain (fully automatic):
 *     trg_app_config_auto_version → version + 1, updated_at = now()
 *     trg_app_config_auto_history → INSERT old config into config_history
 *
 *   Rollback: SELECT rollback_config(3); ← restores version 3
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PATH B: Code Default Update (Requires Vercel redeploy)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Developer edits /taprootagrosetting/*.json → git push → Vercel builds
 *     ↓
 *   New defaults baked into bundle → fresh users get updated config
 *     ↓
 *   Existing users: remote config (Path A) still overrides code defaults
 *
 * Priority: Supabase remote > Code defaults (always)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN SQL SHORTCUTS (run in Supabase SQL Editor):
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   -- View all config sections:
 *   SELECT * FROM get_config_overview();
 *
 *   -- Read articles:
 *   SELECT get_config_section('articles');
 *
 *   -- Update product list:
 *   SELECT update_config_section('marketPage', '{...}'::jsonb);
 *
 *   -- Search for keyword:
 *   SELECT * FROM search_config('wheat');
 *
 *   -- View history:
 *   SELECT version, created_at, note FROM config_history ORDER BY version DESC;
 *
 *   -- Rollback:
 *   SELECT rollback_config(5);
 */


// ============================================================================
// 9. AUTHENTICATION SYSTEM
// ============================================================================
/**
 * Two-tier authentication with graceful demo fallback:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Tier 1: Production (Backend Enabled)                                   │
 * │                                                                        │
 * │  OTP Flow:                                                             │
 * │    User enters phone/email → POST /server/send-code                   │
 * │      → Supabase Auth dispatches SMS/email OTP                         │
 * │    User enters code → POST /server/auth                               │
 * │      → Supabase Auth verifyOtp → returns { userId, accessToken }      │
 * │      → Store JWT + UUID in localStorage                               │
 * │      → Fetch cloud profile → Navigate to /home/profile                │
 * │                                                                        │
 * │  OAuth Flow (7 providers):                                             │
 * │    Google │ Facebook │ Apple │ WeChat │ Alipay │ Twitter │ LINE       │
 * │    Click icon → redirect to provider authorize URL                    │
 * │      → Provider callback to /auth/callback?provider=xxx&code=yyy      │
 * │      → OAuthCallback component                                        │
 * │      → POST /server/oauth-exchange (code → session)                   │
 * │      → Store JWT + UUID → Navigate to /home/profile                   │
 * │                                                                        │
 * │  CSRF Protection: sessionStorage state token verified on callback      │
 * │                                                                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Tier 2: Demo Mode (No Backend)                                        │
 * │                                                                        │
 * │  backendProxyConfig.enabled = false (or placeholder URL)              │
 * │  → OTP: accepts any code, shows "(demo: 123456)"                     │
 * │  → OAuth: instantly sets logged in, no network call                   │
 * │  → Generates local 10-digit numeric ID as user identity              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Stored Credentials:
 *   agri_access_token     ← JWT (Authorization: Bearer xxx)
 *   agri_server_user_id   ← UUID from Supabase Auth
 *   agri_auth_source      ← "server" | "local"
 *   isLoggedIn             ← "true" / removed
 *
 * Consumers:
 *   - IM Chat: getUserId() as IM identity → POST /chat-token/token
 *   - API calls: getAccessToken() → Authorization header
 *   - Profile QR: getUserId() displayed in QR code
 *   - Dexie backup: mirrorAuthToDexie() encrypted IndexedDB copy
 */


// ============================================================================
// 10. INSTANT MESSAGING (IM) ARCHITECTURE
// ============================================================================
/**
 * Architecture: No TUIKit — Custom UI with direct SDK connection.
 *
 * Message Flow:
 *   ┌──────────┐    WebSocket     ┌──────────────┐
 *   │ Frontend │ ◄──────────────► │ IM Provider  │
 *   │  IM SDK  │                  │ Cloud (Tx/CC)│
 *   └────┬─────┘                  └──────────────┘
 *        │
 *        │ Token request only
 *        ▼
 *   ┌──────────────────┐    REST API    ┌──────────────┐
 *   │ Supabase Edge Fn │ ──────────────►│ IM Token API │
 *   │ /chat-token      │                │ (UserSig/JWT)│
 *   └──────────────────┘                └──────────────┘
 *
 * Component Chain:
 *   CommunityPage
 *     → useVoiceRecorder (audio recording)
 *     → ChatProxyService (mode router)
 *       → IMProviderDirectAdapter (SDK manager)
 *         → Dynamic import: @tencentcloud/chat (from esm.sh CDN)
 *         OR
 *         → Dynamic import: @cometchat/chat-sdk-javascript
 *
 * Supported Providers:
 *   1. Tencent IM: UserSig token (HMAC-SHA256), SDK ~90KB gzipped
 *   2. CometChat: Auth token via REST API, SDK ~60KB gzipped
 *
 * SDK Loading Strategy:
 *   Dynamic import from ESM CDN (esm.sh) at runtime.
 *   Only the selected provider's SDK is loaded. PWA bundle = 0 KB IM code.
 *
 * Token Flow:
 *   Frontend → POST /chat-token/token { uid, provider: "tencent-im" }
 *   Edge Fn reads TENCENT_IM_SECRET_KEY from Supabase Secrets
 *   Generates UserSig (HMAC-SHA256 + zlib + base64url) → returns token
 *   Frontend SDK.login(token) → WebSocket connection established
 *
 * Message Types: text, image (base64 upload), voice (audio blob)
 * Features: Real-time delivery, read receipts, typing indicator, history
 *
 * Mock Mode: When no IM provider configured, ChatProxyService simulates
 * responses locally with realistic auto-replies.
 */


// ============================================================================
// 11. CLOUD AI VISION ANALYSIS
// ============================================================================
/**
 * File: /src/app/services/CloudAIService.ts
 * Edge Function: /supabase/functions/ai-vision-proxy/index.tsx
 *
 * Three-provider support with transparent backend switching:
 *
 * ┌───────────────┬─────────────────────────┬──────────────────────────────┐
 * │ Provider      │ API Endpoint            │ Model Default                │
 * ├───────────────┼─────────────────────────┼──────────────────────────────┤
 * │ Qwen (Alibaba)│ DashScope compatible    │ qwen-vl-plus                │
 * │ Gemini        │ googleapis.com/v1beta   │ gemini-2.0-flash            │
 * │ OpenAI        │ api.openai.com/v1       │ gpt-4o                      │
 * └───────────────┴─────────────────────────┴──────────────────────────────┘
 *
 * Request Types:
 *   1. Image analysis: crop disease/pest identification
 *   2. Text follow-up: conversation continuation
 *   3. Voice follow-up: audio → AI reply (Gemini/OpenAI native audio)
 *
 * Frontend Protection (cloudAIGuard.ts):
 *   - Image compression before upload
 *   - 10-second cooldown between requests
 *   - Daily usage quota (localStorage-tracked)
 *   - Image hash dedup (skip identical images)
 *
 * Config: cloudAIConfig.enabled + AI_PROVIDER / AI_API_KEY in Supabase Secrets
 */


// ============================================================================
// 12. INTERNATIONALIZATION (i18n) — 20 LANGUAGES
// ============================================================================
/**
 * File: /src/app/hooks/useLanguage.tsx + /src/app/i18n/lang/
 *
 * Supported Languages:
 *   en, zh, zh-TW, es, fr, ar*, pt, hi, ru, bn, ur*, id, vi, ms, ja, th, my, tl, tr, fa*
 *   (* = RTL languages: Arabic, Urdu, Persian)
 *
 * Architecture:
 *   - LanguageProvider wraps entire app (in Root.tsx)
 *   - Language detection: localStorage → navigator.language → fallback to 'en'
 *   - Each language file exports a complete Translations object (~200 keys)
 *   - RTL support: `dir` attribute + isRTL flag for layout mirroring
 *   - Dynamic loading: non-default languages loaded on demand
 *
 * Usage: const { t, language, setLanguage, isRTL } = useLanguage();
 */


// ============================================================================
// 13. PUSH NOTIFICATION MULTI-PROVIDER ARCHITECTURE
// ============================================================================
/**
 * Five push providers supported, configured via pushProvidersConfig:
 *
 * ┌──────────────┬────────────────────┬────────────────────────────────────┐
 * │ Provider     │ Best For           │ Config Keys                        │
 * ├──────────────┼────────────────────┼────────────────────────────────────┤
 * │ Web Push     │ PWA browsers       │ vapidPublicKey, pushApiBase        │
 * │ FCM          │ Android / Chrome   │ apiKey, projectId, vapidKey        │
 * │ OneSignal    │ Multi-platform     │ appId, safariWebId                 │
 * │ JPush        │ China Android      │ appKey, channel, pushApiBase       │
 * │ GeTui        │ China Android      │ appId, appKey, pushApiBase         │
 * └──────────────┴────────────────────┴────────────────────────────────────┘
 *
 * In native mode, bridge.pushNotifications uses @capacitor/push-notifications
 * for device-level push registration (FCM token on Android, APNs on iOS).
 *
 * Local notifications (watering/fertilizing reminders) use
 * bridge.localNotifications with scheduled timers.
 */


// ============================================================================
// 14. RESILIENCE ENGINEERING
// ============================================================================
/**
 * Designed for low-end Android devices on unstable 2G/3G networks.
 *
 * Layer 1: Safe Storage (safeStorage.ts)
 *   - All localStorage access wrapped with try/catch
 *   - Failure counter + degradation detection
 *   - Listeners notified when storage becomes unstable
 *
 * Layer 2: Silent Recovery (silentRecovery.ts)
 *   - Global error handler intercepts uncaught JS errors
 *   - Non-fatal errors silently swallowed (farmer never sees crash)
 *   - Fatal errors → controlled reload (max 2 reloads per 30 seconds)
 *   - Zombie page detection on visibility change
 *
 * Layer 3: Error Monitor (errorMonitor.ts)
 *   - Captures: JS errors, unhandled rejections, React boundary, network
 *   - Stores up to 50 errors locally (FIFO, 7-day auto-cleanup)
 *   - Device ID tracking, API version correlation, A/B test group tagging
 *   - Optional remote flush via Beacon API
 *
 * Layer 4: Database Degradation (db.ts)
 *   - Primary: IndexedDB (Dexie encrypted backup)
 *   - Fallback: localStorage (via safeStorage)
 *   - Last resort: in-memory (app works but loses data on close)
 *   - Automatic fallback chain with monitoring
 *
 * Layer 5: API Client (apiClient.ts)
 *   - Version negotiation: v3 → v2 → v1 fallback chain
 *   - Exponential backoff retry (configurable max retries)
 *   - Offline cache (IndexedDB) with TTL
 *   - Network quality awareness (2G/3G → longer timeouts)
 *   - Request deduplication
 *
 * Layer 6: A/B Testing + Gradual Rollout (abTest.ts + rollout.ts)
 *   - Stable device-ID-based hash group assignment
 *   - Feature flags with per-percentage rollout
 *   - Automatic anomaly detection → rollback
 *   - Remote config driven (no rebuild needed)
 */


// ============================================================================
// 15. PERFORMANCE OPTIMIZATION
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Optimization          │ Implementation                                │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Code Splitting        │ React.lazy() for routes (Settings, Login,    │
 * │                        │ ConfigManager, OAuth). Main tabs keep-alive.  │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Tab Keep-Alive        │ Layout.tsx renders all 4 tabs simultaneously  │
 * │                        │ with display:none toggling. No unmount/       │
 * │                        │ remount, state preserved across tab switches.│
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Idle Preloading       │ requestIdleCallback loads Market, Community, │
 * │                        │ Profile after initial paint completes.        │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Image Lazy Loading    │ LazyImage component with IntersectionObserver│
 * │                        │ + blur-up placeholder technique.             │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Virtual Scrolling     │ react-virtuoso for long lists (articles,     │
 * │                        │ products, chat messages).                    │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Config Singleton      │ ConfigProvider at Root → single parse,       │
 * │                        │ one event listener (not 4x per tab).         │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Smart Splash Screen   │ Min 2s brand exposure + banner preload.      │
 * │                        │ Cached revisit → 2s then instant transition. │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  IM SDK Dynamic Load   │ Provider SDK loaded from ESM CDN at runtime. │
 * │                        │ PWA bundle = 0 KB IM code.                   │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Gesture Prevention    │ Layout.tsx intercepts edge swipe gestures    │
 * │                        │ to prevent accidental browser back/forward.  │
 * └────────────────────────┴───────────────────────────────────────────────┘
 */


// ============================================================================
// 16. SECURITY MODEL
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Principle                        │ Implementation                     │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  No API keys in frontend          │ All secrets in Supabase Edge Fn   │
 * │                                   │ Secrets (env vars)                │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  Database isolation               │ All tables RLS-locked to          │
 * │                                   │ service_role. anonKey cannot      │
 * │                                   │ read/write any table directly.    │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  JWT authentication               │ Supabase Auth issues JWT.         │
 * │                                   │ Edge Fn verifies via              │
 * │                                   │ auth.getUser(token).              │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  OAuth CSRF protection            │ Random state token in             │
 * │                                   │ sessionStorage, verified on       │
 * │                                   │ callback.                         │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  Optimistic locking               │ Config writes check expected      │
 * │                                   │ version → 409 Conflict if stale. │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  IM token isolation               │ Frontend never sees IM secret.    │
 * │                                   │ Token generated server-side,      │
 * │                                   │ short-lived (7 days for Tencent). │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  Auth data backup                 │ mirrorAuthToDexie() creates       │
 * │                                   │ encrypted IndexedDB copy of       │
 * │                                   │ credentials.                      │
 * ├───────────────────────────────────┼────────────────────────────────────┤
 * │  Domain whitelist                 │ chatContact.verifiedDomains[]     │
 * │                                   │ validates QR scan binding source. │
 * └───────────────────────────────────┴────────────────────────────────────┘
 */


// ============================================================================
// 17. SUPABASE BACKEND — EDGE FUNCTIONS & DATABASE
// ============================================================================
/**
 * One-Click Deployment:
 *   1. SQL Editor → paste 001_init.sql → Run
 *   2. supabase functions deploy server
 *   3. supabase functions deploy chat-token
 *   4. supabase functions deploy ai-vision-proxy
 *   5. Set Secrets in Dashboard:
 *
 * ┌────────────────────────────┬───────────────────────────────────────────┐
 * │  Secret                   │ Required For                              │
 * ├────────────────────────────┼───────────────────────────────────────────┤
 * │  (auto) SUPABASE_URL      │ All Edge Functions                        │
 * │  (auto) SUPABASE_ANON_KEY │ All Edge Functions                        │
 * │  (auto) SERVICE_ROLE_KEY  │ All Edge Functions                        │
 * │  TENCENT_IM_APP_ID        │ Tencent IM token generation              │
 * │  TENCENT_IM_SECRET_KEY    │ Tencent IM UserSig HMAC                  │
 * │  COMETCHAT_APP_ID         │ CometChat token generation               │
 * │  COMETCHAT_AUTH_KEY       │ CometChat REST API auth                  │
 * │  COMETCHAT_REGION         │ CometChat region (us/eu/in)              │
 * │  AI_PROVIDER              │ qwen | gemini | openai                   │
 * │  AI_API_KEY               │ Selected AI provider API key             │
 * │  AI_BASE_URL              │ (Optional) Custom API proxy URL          │
 * │  AI_MODEL_ID              │ (Optional) Model override                │
 * └────────────────────────────┴───────────────────────────────────────────┘
 *
 * Self-Hosted Edge Function Deployment (Option B/C):
 *   If using Supabase Docker (self-hosted or PolarDB), the CLI `supabase
 *   functions deploy` command is NOT available. Instead, copy the 3 function
 *   files into the Docker volumes directory:
 *
 *     # From your computer — send files to the server:
 *     scp supabase/functions/server/index.tsx      root@SERVER_IP:~/server.tsx
 *     scp supabase/functions/chat-token/index.tsx   root@SERVER_IP:~/chat-token.tsx
 *     scp supabase/functions/ai-vision-proxy/index.tsx root@SERVER_IP:~/ai-vision-proxy.tsx
 *
 *     # On the server — move into Docker volumes:
 *     cd ~/supabase/docker
 *     mkdir -p volumes/functions/{server,chat-token,ai-vision-proxy}
 *     mv ~/server.tsx          volumes/functions/server/index.tsx
 *     mv ~/chat-token.tsx      volumes/functions/chat-token/index.tsx
 *     mv ~/ai-vision-proxy.tsx volumes/functions/ai-vision-proxy/index.tsx
 *     docker compose restart functions
 *
 *   No need to clone the entire PWA repo to the server — only 3 files needed.
 *
 * Database Schema:
 *
 *   app_config (single row, id='main')
 *     config JSONB       ← Entire app configuration
 *     version INTEGER    ← Auto-increment trigger
 *     updated_at TIMESTAMPTZ ← Auto-update trigger
 *     updated_by TEXT
 *
 *   config_history (auto-populated by trigger)
 *     config JSONB       ← Snapshot of previous version
 *     version INTEGER
 *     created_at, created_by, note
 *
 *   user_profiles
 *     user_id UUID (FK → auth.users)
 *     profile JSONB (name, avatar, phone, email, provider)
 *     updated_at TIMESTAMPTZ
 *
 * 5 Helper Functions (for SQL Editor use):
 *   update_config_section(key, value)
 *   get_config_section(key)
 *   rollback_config(version)
 *   get_config_overview()
 *   search_config(keyword)
 */


// ============================================================================
// 18. ANDROID APP BUILD PIPELINE
// ============================================================================
/**
 * Builder Repository: taprootagro-builder (separate from PWA source)
 *
 * Build Trigger: GitHub Actions workflow_dispatch (manual click)
 *
 * Inputs:
 *   - PWA URL (e.g., https://your-brand.vercel.app)
 *   - App name, package name
 *   - Signing keystore (Base64-encoded in GitHub Secrets)
 *
 * Process:
 *   1. Checkout builder repo
 *   2. Install Capacitor + all plugins
 *   3. Generate capacitor-loader.ts (registers plugins to __CAP_PLUGINS__)
 *   4. Configure capacitor.config.ts with PWA URL
 *   5. npx cap sync android
 *   6. Build APK/AAB with Gradle
 *   7. Sign with release keystore
 *   8. Upload artifact
 *
 * The resulting APK loads the live PWA in a WebView. Content updates
 * are instant (no app rebuild needed). Only rebuild when:
 *   - Changing app name, package name, or icon
 *   - Adding new Capacitor plugins
 *   - Upgrading Capacitor version
 */


// ============================================================================
// 18b. SERVICE WORKER — REMOTE CONFIG UPDATE URL
// ============================================================================
/**
 * The Service Worker and PWARegister component both check a remote JSON
 * endpoint to detect new versions and push configuration updates.
 *
 * Default URL (hardcoded as fallback):
 *   https://www.taprootagro.com/taprootagro/globalpublic/customer.json
 *
 * This is the author's server. It is provided as a free starting point
 * so that every fork works out of the box with zero configuration.
 *
 * Source locations:
 *   /public/service-worker.js  line 25:
 *     const REMOTE_CONFIG_URL = self.__REMOTE_CONFIG_URL
 *       || 'https://www.taprootagro.com/taprootagro/globalpublic/customer.json';
 *
 *   /src/app/components/PWARegister.tsx  line 29:
 *     const REMOTE_CONFIG_URL = import.meta.env.VITE_REMOTE_CONFIG_URL
 *       || 'https://www.taprootagro.com/taprootagro/globalpublic/customer.json';
 *
 * How it works:
 *   1. Once per day (first app open), SW fetches this JSON
 *   2. Compares remote `version` field against local CACHE_VERSION
 *   3. If different → triggers SW update → user sees "New version available"
 *   4. JSON can also carry feature flags, kill switch, announcements
 *
 * To use your own server:
 *   Option A (env var — recommended):
 *     Set VITE_REMOTE_CONFIG_URL in your .env or hosting env vars.
 *     The service-worker.js also respects self.__REMOTE_CONFIG_URL
 *     which can be set via a build-time injection script.
 *
 *   Option B (direct edit):
 *     Replace the fallback URL in both files listed above.
 *
 * Expected JSON format:
 *   {
 *     "version": "v11",           // Triggers SW update when != CACHE_VERSION
 *     "forceUpdate": false,       // If true, skip user confirmation
 *     "killSwitch": false,        // Emergency: show maintenance page
 *     "announcement": null,       // Optional banner message
 *     "rollout": { ... }          // Feature flag percentages
 *   }
 *
 * Note: If your organization has the capacity to maintain its own update
 * server, you should replace this URL with your own endpoint. The default
 * URL pointing to taprootagro.com is a convenience — not a dependency.
 */


// ============================================================================
// 19. WHITE-LABEL CUSTOMIZATION GUIDE
// ============================================================================
/**
 * To create a new white-label instance:
 *
 * Step 1: Brand Configuration (5 minutes)
 *   Edit /taprootagrosetting/app.json:
 *     - appBranding.logoUrl     ← Your logo URL
 *     - appBranding.appName     ← Your brand name
 *     - appBranding.slogan      ← Your tagline
 *     - desktopIcon.icon192Url  ← PWA icon 192px
 *     - desktopIcon.icon512Url  ← PWA icon 512px
 *
 * Step 2: Content (10 minutes)
 *   Edit /taprootagrosetting/home.json:
 *     - banners[]               ← Hero images + titles
 *     - articles[]              ← Knowledge base articles
 *     - liveStreams[]           ← Video content
 *   Edit /taprootagrosetting/market.json:
 *     - categories[]            ← Product categories
 *     - products[]              ← Product catalog
 *     - currencySymbol          ← "$", "GH₵", "KSh", etc.
 *
 * Step 3: Backend Connection (15 minutes)
 *   Edit /taprootagrosetting/backend.json:
 *     - supabaseUrl             ← Your Supabase project URL
 *     - supabaseAnonKey         ← Your anon key
 *     - enabled: true
 *     - chatProvider            ← "tencent-im" or "cometchat"
 *
 * Step 4: Deploy
 *   git push → Vercel auto-deploys → PWA live
 *   Run SQL migration → Deploy Edge Functions
 *   (Optional) Build Android APK via builder repo
 *
 * Step 5: Ongoing Management
 *   Use Supabase Dashboard to edit app_config JSONB directly.
 *   Changes go live instantly when users open/return to the app.
 */


// ============================================================================
// 20. DEPLOYMENT CHECKLIST
// ============================================================================
/**
 * ┌────┬──────────────────────────────────────────┬─────────────┬──────────┐
 * │ #  │ Task                                     │ Where       │ Time     │
 * ├────┼──────────────────────────────────────────┼─────────────┼──────────┤
 * │  1 │ Create Supabase project                  │ supabase.com│ 2 min    │
 * │  2 │ Run 001_init.sql in SQL Editor           │ Dashboard   │ 1 min    │
 * │  3 │ Deploy Edge Functions (server, chat-token,│ CLI         │ 3 min    │
 * │    │ ai-vision-proxy)                         │             │          │
 * │  4 │ Set Supabase Secrets (IM keys, AI key)   │ Dashboard   │ 5 min    │
 * │  5 │ Edit /taprootagrosetting/ JSON files     │ Code editor │ 10 min   │
 * │  6 │ Enable Supabase Auth providers (Google,  │ Dashboard   │ 5 min    │
 * │    │ phone OTP, etc.)                         │             │          │
 * │  7 │ Deploy PWA (git push → Vercel)           │ GitHub      │ 2 min    │
 * │  8 │ Test: open PWA → login → chat → AI scan  │ Browser     │ 5 min    │
 * │  9 │ (Optional) Fork builder repo → build APK │ GitHub      │ 10 min   │
 * │ 10 │ (Optional) Upload APK to Play Store      │ Play Console│ 30 min   │
 * ├────┼──────────────────────────────────────────┼─────────────┼──────────┤
 * │    │ TOTAL                                    │             │ ~73 min  │
 * └────┴──────────────────────────────────────────┴─────────────┴──────────┘
 *
 * Post-Deployment:
 *   - All content changes: edit app_config in Supabase Dashboard (instant)
 *   - No code changes, no rebuild, no redeployment needed for content updates
 *   - Monitor errors: errorMonitor remote flush endpoint (optional)
 *   - A/B test new features: remote config rollout percentage
 */
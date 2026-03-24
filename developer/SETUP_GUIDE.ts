/**
 * ============================================================================
 * TaprootAgro Android Builder — Setup Guide (English)
 * ============================================================================
 *
 * Document Version: 5.0.0
 * Last Updated: 2026-03-12
 * Architecture: Two-repo separation (PWA source repo + Builder repo)
 *
 * ============================================================================
 * Table of Contents
 * ============================================================================
 *
 *   Part 1: Architecture Overview
 *   Part 2: Setting Up the Builder Repo (one-time, 5 minutes)
 *   Part 3: Customer Workflow (step by step)
 *   Part 4: Private Repository Access
 *   Part 5: Keystore Management (Signing Key)
 *   Part 6: Icon Requirements
 *   Part 7: Permission Reference
 *   Part 8: Capacitor Plugin Reference
 *   Part 9: FAQ
 *   Part 10: When to Rebuild
 *   Part 11: Capacitor Bridge Architecture
 *
 * ============================================================================
 */


// ============================================================================
// Part 1: Architecture Overview
// ============================================================================
/**
 *
 *   Two completely separate repositories:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Repo A: Customer's PWA Source                                  │
 *   │  github.com/customer/their-pwa                                  │
 *   │                                                                 │
 *   │  ├── src/                     ← Code edited in Figma            │
 *   │  ├── public/                                                    │
 *   │  │   └── icon-512.png         ← App icon (512×512)             │
 *   │  ├── taprootagrosetting/      ← Brand configuration            │
 *   │  ├── package.json                                               │
 *   │  └── vite.config.ts                                             │
 *   │                                                                 │
 *   │  This repo has nothing to do with app building.                 │
 *   │  It's a pure PWA project.                                       │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Repo B: Builder (you provide, customer forks)                  │
 *   │  github.com/your-account/taprootagro-builder                    │
 *   │                                                                 │
 *   │  └── .github/                                                   │
 *   │      └── workflows/                                             │
 *   │          └── build-android.yml  ← Just this one file            │
 *   │                                                                 │
 *   │  Customer forks → runs Action → inputs 3 fields → gets APK     │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 *   Flow:
 *
 *   Customer edits PWA in Figma ──push──→ Repo A (PWA source)
 *                                              │
 *   Customer forks Repo B ──→ Run Action ──→ Clone Repo A ──→ Build ──→ APK
 *                                │
 *                          3 input fields:
 *                    App name + Package ID + Repo A URL
 *
 */


// ============================================================================
// Part 2: Setting Up the Builder Repo (one-time, 5 minutes)
// ============================================================================
/**
 *
 *   Step 1: Create the builder repository
 *   ──────────────────────────────────────
 *     ① GitHub → New repository
 *     ② Name: taprootagro-builder (or any name you prefer)
 *     ③ Visibility: Public (so customers can fork it)
 *     ④ Check "Add a README file"
 *     ⑤ Create repository
 *
 *
 *   Step 2: Create the Workflow file
 *   ────────────────────────────────
 *     ① In the repo page, click "Add file" → "Create new file"
 *     ② File name: .github/workflows/build-android.yml
 *        (GitHub auto-creates intermediate directories)
 *     ③ Paste the entire contents of /developer/build-android.yml
 *     ④ Click "Commit new file"
 *
 *
 *   Step 3: Verify Actions are enabled
 *   ───────────────────────────────────
 *     ① Go to repo → Settings → Actions → General
 *     ② Confirm "Allow all actions and reusable workflows" is selected
 *     ③ Scroll down, Workflow permissions → "Read and write permissions"
 *     ④ Save
 *
 *
 *   Done! The builder repo is ready.
 *   Customers fork this repo to use it.
 *
 */


// ============================================================================
// Part 3: Customer Workflow (step by step)
// ============================================================================
/**
 *
 *   Prerequisites: Customer already has their PWA repo on GitHub
 *                  (pushed from their Figma workspace)
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 1: Fork the builder                                    │
 *   │                                                              │
 *   │  Go to github.com/your-account/taprootagro-builder           │
 *   │  Click "Fork" (top right) → Create fork                     │
 *   └──────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 2: Enable Actions                                      │
 *   │                                                              │
 *   │  Forked repos have Actions disabled by default.              │
 *   │  Go to your fork → Actions tab                               │
 *   │  Click "I understand my workflows, go ahead and enable them" │
 *   └──────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 3: Run the build                                       │
 *   │                                                              │
 *   │  Actions → "📱 Build Android App" → Run workflow             │
 *   │                                                              │
 *   │  Fill in 3 required fields:                                  │
 *   │                                                              │
 *   │  ┌──────────────────────────────────────────────────────┐    │
 *   │  │  App display name:     GreenFarm                     │    │
 *   │  │  Android package ID:   com.greenfarm.app             │    │
 *   │  │  PWA source repo URL:  https://github.com/me/my-pwa  │    │
 *   │  └──────────────────────────────────────────────────────┘    │
 *   │                                                              │
 *   │  Optional fields (have defaults):                            │
 *   │  ┌──────────────────────────────────────────────────────┐    │
 *   │  │  Version number:       1.0.0                         │    │
 *   │  │  Icon background color: #FFFFFF                      │    │
 *   │  └──────────────────────────────────────────────────────┘    │
 *   │                                                              │
 *   │  Click "Run workflow"                                        │
 *   └──────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 4: Wait for build (~8-12 minutes)                      │
 *   │                                                              │
 *   │  Watch the live log. Each step shows ✅ when complete.      │
 *   │  Build status turns green ✓ when finished.                  │
 *   └──────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 5: Download artifacts                                  │
 *   │                                                              │
 *   │  Click the build run → scroll to "Artifacts" → download ZIP │
 *   │                                                              │
 *   │  ZIP contains:                                               │
 *   │  ├── GreenFarm-v1.0.0.apk       ← Install directly on phone │
 *   │  ├── GreenFarm-v1.0.0.aab       ← Upload to app stores     │
 *   │  ├── release.keystore            ← Signing key (SAVE THIS!) │
 *   │  └── keystore-info.txt           ← Passwords & instructions │
 *   └──────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Step 6: Save Keystore (first time only, IMPORTANT!)         │
 *   │                                                              │
 *   │  Open keystore-info.txt and follow the instructions:         │
 *   │  ① Fork repo → Settings → Secrets → Actions                 │
 *   │  ② Add KEYSTORE_BASE64 (value is in the txt file)           │
 *   │  ③ Add KEYSTORE_PASS (password is in the txt file)          │
 *   │                                                              │
 *   │  This ensures future builds use the same signing key,        │
 *   │  so users can update the app without uninstalling.           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 */


// ============================================================================
// Part 4: Private Repository Access
// ============================================================================
/**
 *
 *   If the customer's PWA repo is public:
 *     → No extra configuration needed. Just enter the repo URL.
 *
 *   If the customer's PWA repo is private:
 *     → Need to add a GitHub PAT (Personal Access Token)
 *
 *   Steps:
 *
 *   ① Customer goes to GitHub → Settings → Developer settings
 *     → Personal access tokens → Tokens (classic) → Generate new token
 *
 *   ② Token settings:
 *     - Note: "Builder access"
 *     - Expiration: "No expiration" (or set as needed)
 *     - Scopes: check "repo" only (read repository contents)
 *     - Generate token → copy the token
 *
 *   ③ Go to the forked builder repo:
 *     Settings → Secrets and variables → Actions → New repository secret
 *     - Name: PWA_REPO_PAT
 *     - Value: paste the token
 *     - Add secret
 *
 *   ④ The workflow automatically detects this Secret and uses it
 *     to access private repositories.
 *
 *   Notes:
 *   - PAT only needs "repo" scope (read-only is sufficient)
 *   - If the token expires, generate a new one and update the Secret
 *   - Fine-grained tokens also work — more secure with minimal permissions
 *
 */


// ============================================================================
// Part 5: Keystore Management (Signing Key)
// ============================================================================
/**
 *
 *   What is a Keystore?
 *   ────────────────────
 *   Android uses a Keystore to verify "who published this APK."
 *   Same package ID + same Keystore = same app, can update in-place.
 *   Same package ID + different Keystore = different app, must uninstall first.
 *
 *
 *   Is auto-generation reliable?
 *   ─────────────────────────────
 *   Yes. keytool is a standard JDK tool, pre-installed on GitHub Actions.
 *   The generation process is deterministic and battle-tested.
 *
 *
 *   Where is the risk?
 *   ────────────────────
 *   Not in generation, but in storage.
 *
 *   ┌──────────────────────────┬────────────────────────────────────────┐
 *   │ Scenario                 │ What happens if Keystore is lost       │
 *   ├──────────────────────────┼────────────────────────────────────────┤
 *   │ Direct APK distribution  │ Users must uninstall old app first     │
 *   │ Google Play              │ Can never update this app again        │
 *   │ Huawei AppGallery        │ Same as above                         │
 *   └──────────────────────────┴───────────────────────────────────────┘
 *
 *
 *   Keystore Lifecycle
 *   ───────────────────
 *
 *   First build:
 *     Action auto-generates Keystore → signs APK → Keystore included in Artifact
 *     Customer needs to:
 *     ① Download keystore-info.txt (contains password and base64)
 *     ② Add 2 Secrets to their forked builder repo:
 *        KEYSTORE_BASE64 = (base64 string from txt file)
 *        KEYSTORE_PASS   = (password from txt file)
 *     ③ Also backup release.keystore locally
 *
 *   Subsequent builds:
 *     Action detects KEYSTORE_BASE64 and KEYSTORE_PASS Secrets
 *     → decodes base64 → uses same keystore → consistent signing
 *     → users can update the app in-place
 *
 *   Forgot to save Secrets before second build:
 *     Action generates a brand-new Keystore → different signing
 *     → users cannot update in-place, must uninstall first
 *     → not fatal, but bad user experience
 *
 */


// ============================================================================
// Part 6: Icon Requirements
// ============================================================================
/**
 *
 *   The customer's PWA repo should include a 512×512 icon.
 *
 *   Auto-search paths (in order):
 *     public/icon-512.png        ← Recommended location
 *     public/icon-512.svg        ← SVG works too, auto-converted to PNG
 *     public/icons/icon-512.png
 *     public/icons/icon-512x512.png
 *     public/favicon-512.png
 *     public/logo-512.png
 *     public/icon.png
 *     public/logo.png
 *
 *   If none found, Capacitor's default icon is used.
 *
 *
 *   Icon Processing Pipeline
 *   ────────────────────────
 *
 *   512px source icon
 *       │
 *       ├──→ Standard icons (5 sizes: 48, 72, 96, 144, 192)
 *       ├──→ Round icons (same 5 sizes, auto rounded corners)
 *       └──→ Adaptive icon foreground (5 sizes: 108, 162, 216, 324, 432)
 *            with safe zone padding (content in center 66%)
 *
 *
 *   Adaptive Icons (Android 8.0+)
 *   ─────────────────────────────
 *   Two layers: foreground (your icon) + background (solid color)
 *   The system crops to circle, rounded square, teardrop, etc.
 *   Your icon content stays in the safe 66% center area.
 *   Background color can be set via icon_bg_color input (default: #FFFFFF).
 *
 *
 *   Icon Design Tips
 *   ─────────────────
 *   - Use PNG with transparent background
 *   - Keep main content away from edges (10-15% padding)
 *   - Avoid very thin lines (invisible at 48px)
 *   - If using SVG, ensure no external font dependencies
 *
 */


// ============================================================================
// Part 7: Permission Reference
// ============================================================================
/**
 *
 *   All permissions are pre-written in the workflow.
 *   Remove any lines you don't need from your forked workflow file.
 *
 *   ┌──────────────┬──────────────────────────────────────────┬──────────┬─────────────────────────┐
 *   │ Category     │ Permission                               │ Required │ Purpose                 │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Network      │ INTERNET                                 │ Yes      │ API communication       │
 *   │              │ ACCESS_NETWORK_STATE                      │ Yes      │ Online/offline detection│
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Camera       │ CAMERA                                   │ Recommended │ Photo, QR scan       │
 *   │              │ camera feature (required=false)           │ Recommended │ Install without cam  │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Microphone   │ RECORD_AUDIO                              │ Recommended │ Voice msg, calls    │
 *   │              │ MODIFY_AUDIO_SETTINGS                     │ Recommended │ Speaker/earpiece    │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Location     │ ACCESS_FINE_LOCATION                      │ Recommended │ GPS for fields      │
 *   │              │ ACCESS_COARSE_LOCATION                    │ Recommended │ Weather lookup      │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Storage      │ READ/WRITE_EXTERNAL_STORAGE (API≤32)      │ Recommended │ Old Android files   │
 *   │ (legacy)     │                                          │          │                         │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Storage      │ READ_MEDIA_IMAGES / READ_MEDIA_VIDEO      │ Recommended │ Android 13+ media   │
 *   │ (modern)     │                                          │          │                         │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Notifications│ POST_NOTIFICATIONS                        │ Recommended │ Push alerts         │
 *   │              │ VIBRATE                                   │ Recommended │ Haptic feedback     │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Background   │ RECEIVE_BOOT_COMPLETED                    │ Optional │ Auto-start on boot    │
 *   │              │ WAKE_LOCK                                 │ Optional │ Prevent sleep         │
 *   │              │ FOREGROUND_SERVICE                         │ Optional │ Long background tasks │
 *   │              │ REQUEST_IGNORE_BATTERY_OPTIMIZATIONS       │ Optional │ Prevent system kill   │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Background   │ FOREGROUND_SERVICE_MICROPHONE              │ Recommended │ Keep mic in bg call │
 *   │ Calls        │ FOREGROUND_SERVICE_CAMERA                  │ Recommended │ Keep cam in bg video│
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Bluetooth    │ BLUETOOTH_CONNECT                         │ Optional │ BT headset (API 31+)  │
 *   ├──────────────┼──────────────────────────────────────────┼──────────┼─────────────────────────┤
 *   │ Biometric    │ USE_BIOMETRIC                              │ Optional │ Fingerprint/face      │
 *   │              │ USE_FINGERPRINT                            │ Optional │ Legacy fingerprint    │
 *   └──────────────┴──────────────────────────────────────────┴──────────┴─────────────────────────┘
 *
 */


// ============================================================================
// Part 8: Capacitor Plugin Reference
// ============================================================================
/**
 *
 *   The workflow automatically installs 27 Capacitor native plugins at build time.
 *   These plugins enable PWA code to call system-level native features
 *   (instead of limited WebView web APIs).
 *   Remove any plugins you don't need from your forked workflow file.
 *
 *
 *   Tier 1: Essential (8 plugins, core functionality)
 *   ──────────────────────────────────────────────────
 *
 *   ┌───────────────────────────────────┬──────────────────────────────────────────┐
 *   │ Plugin                            │ Purpose                                  │
 *   ├───────────────────────────────────┼──────────────────────────────────────────┤
 *   │ @capacitor/camera                 │ System camera, photo gallery access      │
 *   │ @capacitor/geolocation            │ Native GPS (high accuracy, low power)    │
 *   │ @capacitor/push-notifications     │ FCM native push (works when app killed)  │
 *   │ @capacitor/filesystem             │ Native file read/write, save to gallery  │
 *   │ @capacitor/network                │ WiFi/cellular/offline detection          │
 *   │ @capacitor/device                 │ Device model, OS version, unique ID      │
 *   │ @capacitor/preferences            │ Native key-value storage (persistent)    │
 *   │ @capacitor/app                    │ Foreground/background detection, back    │
 *   └───────────────────────────────────┴──────────────────────────────────────────┘
 *
 *
 *   Tier 2: Recommended (9 plugins, better UX)
 *   ───────────────────────────────────────────
 *
 *   ┌───────────────────────────────────┬──────────────────────────────────────────┐
 *   │ Plugin                            │ Purpose                                  │
 *   ├───────────────────────────────────┼──────────────────────────────────────────┤
 *   │ @capacitor/keyboard               │ Keyboard show/hide, height listener      │
 *   │ @capacitor/status-bar             │ Status bar color/style/visibility        │
 *   │ @capacitor/splash-screen          │ Splash screen timing control             │
 *   │ @capacitor/haptics                │ Vibration feedback (success/error/warn)  │
 *   │ @capacitor/local-notifications    │ Scheduled local notifications            │
 *   │ @capacitor/share                  │ System share sheet (WhatsApp, etc.)      │
 *   │ @capacitor/clipboard              │ Native copy/paste                        │
 *   │ @capacitor/dialog                 │ Native alert/confirm/prompt dialogs      │
 *   │ @capacitor/toast                  │ System toast messages                    │
 *   └───────────────────────────────────┴──────────────────────────────────────────┘
 *
 *
 *   Tier 3: Optional (10 plugins, enhanced features)
 *   ─────────────────────────────────────────────────
 *
 *   ┌──────────────────────────────────────────────┬──────────────────────────────────────────┐
 *   │ Plugin                                        │ Purpose                                  │
 *   ├──────────────────────────────────────────────┼──────────────────────────────────────────┤
 *   │ @capacitor/screen-orientation                 │ Lock portrait/landscape                  │
 *   │ @capacitor/browser                            │ In-app browser (open links without exit) │
 *   │ @capacitor/action-sheet                       │ Native bottom action menu                │
 *   │ @capacitor-community/barcode-scanner          │ QR/barcode scanning                      │
 *   │ @capacitor-community/speech-recognition       │ Voice-to-text (for illiterate users)     │
 *   │ @capacitor-community/text-to-speech           │ Text-to-voice (read guides aloud)        │
 *   │ @capacitor-community/native-audio             │ Native audio playback (voice msgs)       │
 *   │ @capacitor-community/keep-awake               │ Prevent screen sleep during recording    │
 *   │ @capacitor-community/file-opener              │ Open PDF/docs with system apps           │
 *   │ @capacitor-community/contacts                 │ Read contacts (invite friends)            │
 *   └──────────────────────────────────────────────┴──────────────────────────────────────────┘
 *
 *
 *   Voice/Video Calls
 *   ──────────────────
 *   Voice and video calls use WebRTC (browser-native API), no extra plugin needed.
 *   Capacitor's WebView fully supports WebRTC.
 *   As long as RECORD_AUDIO + CAMERA are declared in the Manifest (they are),
 *   the permission dialog will trigger automatically.
 *
 *
 *   Plugin vs Web API Comparison
 *   ─────────────────────────────
 *
 *   ┌──────────────┬──────────────────────┬───────────────────────────┐
 *   │ Feature      │ Web API (no plugin)   │ Capacitor Plugin          │
 *   ├──────────────┼──────────────────────┼───────────────────────────┤
 *   │ Camera       │ In-page video stream  │ System camera app ✅     │
 *   │ Photo album  │ ❌ Not supported      │ ✅ Full access            │
 *   │ GPS          │ Works, lower accuracy │ Native accuracy ✅       │
 *   │ Push notif.  │ Limited               │ FCM native push ✅       │
 *   │ File I/O     │ Very limited          │ Native read/write ✅     │
 *   │ Permissions  │ WebView forwarding    │ Native dialog, reliable ✅│
 *   │ Google Play  │ ⚠️ May be rejected   │ Native features help ✅  │
 *   └──────────────┴──────────────────────┴───────────────────────────┘
 *
 *
 *   Size Impact
 *   ────────────
 *   All 27 plugins add roughly 1.5-3 MB total (barcode scanner is the largest
 *   at ~1-2 MB). Most plugins are just a few Java files calling Android system
 *   APIs, each 10-50 KB. The real size drivers are images, fonts, and
 *   frontend libraries.
 *
 */


// ============================================================================
// Part 9: FAQ
// ============================================================================
/**
 *
 *   Q: Build fails with "dist directory not found"
 *   A: The PWA's build command doesn't output to dist/.
 *      Check vite.config.ts → build.outDir should be 'dist'.
 *
 *   Q: Build fails with "npm ci failed"
 *   A: Missing package-lock.json. Customer should run npm install
 *      locally and commit package-lock.json.
 *      pnpm and yarn are auto-detected.
 *
 *   Q: Clone fails with "Authentication failed"
 *   A: Private repo without PWA_REPO_PAT configured. See Part 4.
 *
 *   Q: APK crashes on launch
 *   A: Check for environment variable references (import.meta.env.VITE_XXX).
 *      Without .env files, these will be undefined.
 *      Fix: commit .env.production to the PWA repo, or add fallbacks.
 *
 *   Q: "Signature mismatch" when updating
 *   A: Keystore wasn't saved from first build. See Part 5.
 *      Fix: uninstall old app, install new one.
 *      Prevent: save Keystore as Secrets after first build.
 *
 *   Q: Default Android icon instead of custom icon
 *   A: No icon-512.png found in PWA repo. See Part 6.
 *
 *   Q: Can this build iOS apps?
 *   A: Technically yes (Capacitor supports iOS), but needs:
 *      - macOS runner (GitHub Actions has them, paid)
 *      - Apple Developer account ($99/year)
 *      - Certificate & Provisioning Profile management
 *      This builder currently supports Android only.
 *
 *   Q: GitHub Actions free tier?
 *   A: Public repos: completely free, unlimited.
 *      Private repos: 2000 min/month free (~200 builds/month).
 *
 *   Q: Expected APK size?
 *   A: Depends on PWA code. Typically 8-25 MB.
 *      Capacitor shell is ~5 MB, rest is web code.
 *
 */


// ============================================================================
// Part 10: When to Rebuild
// ============================================================================
/**
 *
 *   In local build mode, UI code is inside the APK:
 *
 *   ┌──────────────────────────────────────┬────────────────────────┐
 *   │ What changed                          │ Need to rebuild?       │
 *   ├──────────────────────────────────────┼────────────────────────┤
 *   │ PWA pages / components / styles      │ ✅ Yes                 │
 *   │ App name or package ID               │ ✅ Yes                 │
 *   │ App icon                             │ ✅ Yes                 │
 *   │ New Capacitor native plugin          │ ✅ Yes                 │
 *   ├──────────────────────────────────────┼────────────────────────┤
 *   │ Supabase data (products, prices)     │ ❌ No, fetched via API │
 *   │ Brand config via remote config       │ ❌ No, remote override │
 *   │ i18n translations (if remote)        │ ❌ No                  │
 *   │ Server logic (Edge Functions)        │ ❌ No                  │
 *   └──────────────────────────────────────┴────────────────────────┘
 *
 *   Rebuild steps:
 *   ① Update PWA source, push to GitHub
 *   ② Go to forked builder → Actions → Run workflow
 *   ③ Same app name + package ID (must match!)
 *   ④ Increment version (e.g. 1.0.0 → 1.1.0)
 *   ⑤ Download new APK, distribute to users
 *
 *   Since Keystore is saved as Secret, signing is consistent,
 *   users can update in-place.
 *
 */


// ============================================================================
// Part 11: Capacitor Bridge Architecture
// ============================================================================
/**
 *
 *   The Core Problem
 *   ─────────────────
 *   One codebase must run in two environments:
 *     - PWA mode (browser) → no Capacitor plugins, use Web API fallbacks
 *     - App mode (APK)     → 27 native plugins, call system-level features
 *
 *   What happens if you directly import plugins?
 *     PWA build: these packages aren't in node_modules → Vite errors → build fails
 *     Even with dynamic import() + @vite-ignore, Vite 6 dev server still errors
 *
 *
 *   Solution: Loader + Bridge Two-Layer Architecture
 *   ─────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                      PWA Source Repo                            │
 *   │                                                                 │
 *   │  src/app/utils/capacitor-bridge.ts  ← Unified wrapper (always) │
 *   │    ├── isNative()         → window.Capacitor detection          │
 *   │    ├── loadPlugin(name)   → reads window.__CAP_PLUGINS__[name]  │
 *   │    ├── bridge.camera      → takePhoto / pickImages              │
 *   │    ├── bridge.geo         → getCurrentPosition / watchPosition  │
 *   │    ├── bridge.haptics     → impact / notification / vibrate     │
 *   │    └── ...                → 27 feature modules, each with       │
 *   │                             Web API fallback                    │
 *   │                                                                 │
 *   │  KEY: PWA source has ZERO @capacitor/* import statements        │
 *   │  → Vite never tries to resolve these packages → zero errors     │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │          build-android.yml (auto-generated at App build time)   │
 *   │                                                                 │
 *   │  Step 3.5: npm install 27 Capacitor plugins                     │
 *   │                      ↓                                          │
 *   │  Step 3.6: Auto-generate src/capacitor-loader.ts                │
 *   │            ├── import * as CapCamera from '@capacitor/camera'   │
 *   │            ├── import * as CapGeo from '@capacitor/geolocation' │
 *   │            ├── ... (27 static imports)                          │
 *   │            └── window.__CAP_PLUGINS__ = { registry }            │
 *   │                                                                 │
 *   │            + sed injects into main.tsx:                         │
 *   │              import "./capacitor-loader"                        │
 *   │                      ↓                                          │
 *   │  Step 3.7: npm run build                                        │
 *   │            Vite resolves static imports in capacitor-loader.ts  │
 *   │            → all plugin code bundled into output                │
 *   │            → bridge.loadPlugin() reads from registry at runtime │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 *
 *   Side-by-Side Comparison
 *   ────────────────────────
 *
 *   ┌──────────────────┬─────────────────────────┬──────────────────────────────┐
 *   │                  │ PWA Mode (Browser)       │ App Mode (APK)               │
 *   ├──────────────────┼─────────────────────────┼──────────────────────────────┤
 *   │ capacitor-loader │ Doesn't exist            │ Auto-generated by workflow   │
 *   │ __CAP_PLUGINS__  │ undefined                │ Registry of 27 plugin modules│
 *   │ isNative()       │ false                    │ true                         │
 *   │ loadPlugin()     │ Returns null             │ Returns plugin module        │
 *   │ bridge.camera    │ Web <input> file picker   │ System camera app           │
 *   │ bridge.geo       │ navigator.geolocation    │ Native GPS (high accuracy)   │
 *   │ bridge.haptics   │ navigator.vibrate()      │ Native haptic engine         │
 *   │ bridge.push      │ Silently skipped (null)   │ FCM native push             │
 *   │ Plugin bundle    │ 0 KB                     │ Bundled into output          │
 *   │ Vite build       │ Zero errors              │ Zero errors                  │
 *   └──────────────────┴─────────────────────────┴──────────────────────────────┘
 *
 *
 *   Why Not Dynamic import()?
 *   ──────────────────────────
 *
 *   We tried three approaches and settled on Approach C:
 *
 *   Approach A: import(/* @vite-ignore *\/ '@capacitor/camera')
 *     → String literal → Vite 6 still resolves it → errors
 *
 *   Approach B: import(/* @vite-ignore *\/ moduleName)  // variable
 *     → PWA dev server: no error (good!)
 *     → App build: Vite can't resolve variable → won't bundle plugin code
 *     → Runtime import() can't find module → fails
 *
 *   Approach C (final): Global plugin registry
 *     → capacitor-loader.ts uses static imports for all plugins
 *     → Registers them on window.__CAP_PLUGINS__
 *     → bridge.loadPlugin() reads directly from global object
 *     → PWA mode: file doesn't exist → registry empty → fallback
 *     → App mode: Vite bundles normally → runtime reads succeed
 *     → Both modes: zero errors ✅
 *
 *
 *   Usage Examples
 *   ──────────────
 *
 *     import { bridge } from './utils/capacitor-bridge';
 *
 *     // Camera — App uses system camera, PWA shows file picker
 *     const photo = await bridge.camera.takePhoto({ quality: 90 });
 *
 *     // GPS — App uses native GPS, PWA uses navigator.geolocation
 *     const pos = await bridge.geo.getCurrentPosition();
 *
 *     // Haptics — App uses native engine, PWA uses navigator.vibrate()
 *     await bridge.haptics.impact('light');
 *
 *     // Speech recognition — App uses native engine, PWA uses Web Speech API
 *     const results = await bridge.speechRecognition.start({ language: 'sw-TZ' });
 *
 *     // Platform detection
 *     if (bridge.isNative()) {
 *       await bridge.statusBar.setBackgroundColor('#059669');
 *     }
 *
 *
 *   Bridge Object Structure
 *   ────────────────────────
 *
 *   bridge
 *     ├── isNative()              Platform detection
 *     ├── getPlatform()           'android' | 'ios' | 'web'
 *     │
 *     ├── camera                  Photo capture, gallery, permissions
 *     ├── geo                     Location, position watching
 *     ├── pushNotifications       Registration, listeners
 *     ├── filesystem              File read/write/delete
 *     ├── network                 Status, change listener
 *     ├── device                  Info, unique ID
 *     ├── preferences             Persistent key-value store
 *     ├── app                     State change, back button, exit
 *     │
 *     ├── keyboard                Show/hide, height listener
 *     ├── statusBar               Style, color, visibility
 *     ├── splashScreen            Show/hide control
 *     ├── haptics                 Impact, notification, vibrate
 *     ├── localNotifications      Scheduled notifications
 *     ├── share                   System share sheet
 *     ├── clipboard               Copy/paste
 *     ├── dialog                  Native alert/confirm/prompt
 *     ├── toast                   Lightweight notifications
 *     │
 *     ├── barcodeScanner          QR/barcode scanning
 *     ├── speechRecognition       Voice-to-text
 *     ├── textToSpeech            Text-to-voice
 *     ├── nativeAudio             Native audio playback
 *     ├── screenOrientation       Lock portrait/landscape
 *     ├── browser                 In-app browser
 *     ├── actionSheet             Bottom action menu
 *     ├── keepAwake               Prevent screen sleep
 *     ├── fileOpener              Open files with system apps
 *     └── contacts                Read phone contacts
 *
 *
 *   Removing a Plugin
 *   ──────────────────
 *   1. Remove the plugin from build-android.yml's npm install line
 *   2. The generated capacitor-loader.ts won't include it
 *   3. bridge's method calls loadPlugin() → returns null → falls back to Web
 *   4. No bridge source code changes needed — auto-compatible
 *
 *
 *   Adding a New Plugin
 *   ────────────────────
 *   1. Add the plugin to build-android.yml's npm install line
 *   2. In build-android.yml step 3.6's capacitor-loader.ts template:
 *      - Add: import * as CapXxx from '@new-plugin/xxx';
 *      - Add to registry: '@new-plugin/xxx': CapXxx,
 *   3. In capacitor-bridge.ts, add a new feature module:
 *      export const newFeature = { ... loadPlugin('@new-plugin/xxx') ... }
 *   4. Add it to the bridge object
 *
 */


// ============================================================================
// End of Document
// ============================================================================
/**
 *   Summary:
 *
 *   You (project maintainer) need to:
 *     1. Create the taprootagro-builder repo
 *     2. Paste build-android.yml into it
 *     That's it. Two steps.
 *
 *   Customer needs to:
 *     1. Fork the builder repo
 *     2. Enable Actions
 *     3. Fill 3 fields, run
 *     4. Download APK
 *     5. Save Keystore (first time only)
 *     Five steps total.
 *
 *   The builder repo contains exactly ONE file:
 *     .github/workflows/build-android.yml
 *
 *   Everything else is generated at build time
 *   (including capacitor-loader.ts).
 */
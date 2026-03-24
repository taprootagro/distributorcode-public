/**
 * ============================================================================
 * TaprootAgro — Build Your Android App (One-Click Guide)
 * ============================================================================
 *
 * Document Version: 4.0.0
 * Last Updated: 2026-03-12
 * Target Audience: White-label partners
 *
 * Turn your deployed TaprootAgro PWA into a native Android app —
 * no coding, no software to install. Just click a button on GitHub.
 *
 * The app loads your live PWA, so content updates automatically.
 * Build once, never rebuild (unless you change the app name or icon).
 *
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 *
 *   Step 1: Fork the Repository
 *   Step 2: Run the Build
 *   Step 3: Download & Install Your App
 *   Step 4: Distribute to Farmers
 *   Step 5: Updates
 *   Appendix A: Publishing to App Stores
 *   Appendix B: FAQ
 *
 * ============================================================================
 */


// ============================================================================
// STEP 1: FORK THE REPOSITORY  (~2 minutes)
// ============================================================================
/**
 *   Prerequisite: You've already deployed your PWA and have an
 *   https:// URL. If not, see PWA_DEPLOYMENT_GUIDE.ts first.
 *
 *   1. Go to the TaprootAgro GitHub repository
 *   2. Click the "Fork" button (top right)
 *   3. Keep all defaults → click "Create fork"
 *
 *   You now have your own copy of the project.
 *   The build workflow is already included — no setup needed.
 */


// ============================================================================
// STEP 2: RUN THE BUILD  (~1 minute to start, ~5 minutes to finish)
// ============================================================================
/**
 *   1. In YOUR forked repository, click the "Actions" tab
 *   2. On the left sidebar, click "📱 Build Android App"
 *   3. Click the "Run workflow" dropdown (right side)
 *   4. Fill in 3 fields:
 *
 *      ┌─────────────────────────────────────────────────────────┐
 *      │                                                         │
 *      │  App name:     Your App Name                            │
 *      │                (displayed under the icon on phone)      │
 *      │                                                         │
 *      │  Package ID:   com.yourcompany.app                      │
 *      │                (must be globally unique, use your       │
 *      │                 domain name reversed + app)              │
 *      │                                                         │
 *      │  PWA URL:      Your deployed PWA address                │
 *      │                (must be https://)                        │
 *      │                e.g. https://farm.yourcompany.com        │
 *      │                                                         │
 *      │  Version:      1.0.0  (keep default for first build)   │
 *      │                                                         │
 *      └─────────────────────────────────────────────────────────┘
 *
 *   5. Click "Run workflow" (green button)
 *   6. Wait ~5 minutes. The yellow spinning icon turns green ✓ when done.
 *
 *   That's it. 3 fields, one button, 5 minutes.
 */


// ============================================================================
// STEP 3: DOWNLOAD & INSTALL YOUR APP  (~2 minutes)
// ============================================================================
/**
 * ────────────────────────────────────────────────────────────────
 * 3.1  Download the Build
 * ────────────────────────────────────────────────────────────────
 *
 *   1. Click on the completed workflow run (green ✓)
 *   2. Scroll down to "Artifacts"
 *   3. Click the artifact name to download a ZIP file
 *
 *   Inside the ZIP you'll find:
 *
 *     File                      What It Is
 *     ──────────────────────── ──────────────────────────────────
 *     YourApp-v1.0.0.apk       ← Install this on Android phones
 *     YourApp-v1.0.0.aab       ← Upload this to app stores
 *     release.keystore          ← YOUR SIGNING KEY — SAVE THIS!!
 *     keystore-info.txt         ← Passwords — SAVE THIS!!
 *
 * ────────────────────────────────────────────────────────────────
 * 3.2  ⚠ IMPORTANT: Save Your Signing Files!
 * ────────────────────────────────────────────────────────────────
 *
 *   IMMEDIATELY save these two files somewhere safe:
 *     - release.keystore
 *     - keystore-info.txt
 *
 *   Why? These files are your app's identity. If you lose them:
 *     ✗ You can NEVER update your app on app stores
 *     ✗ You must create a brand new app listing
 *     ✗ All existing users must uninstall and reinstall
 *
 *   Where to store them:
 *     ✓ Password manager (1Password, Bitwarden)
 *     ✓ Encrypted USB drive
 *     ✓ Secure cloud storage (Google Drive, with 2FA enabled)
 *     ✗ NOT in your email
 *     ✗ NOT in the GitHub repository
 *
 * ────────────────────────────────────────────────────────────────
 * 3.3  Test on Your Phone
 * ────────────────────────────────────────────────────────────────
 *
 *   1. Transfer the .apk file to your Android phone
 *      (email it to yourself, share via WhatsApp, or USB cable)
 *   2. Tap the .apk file on your phone
 *   3. If prompted, allow "Install from unknown sources"
 *   4. Tap "Install"
 *   5. Open the app — it will load your live PWA!
 */


// ============================================================================
// STEP 4: DISTRIBUTE TO FARMERS
// ============================================================================
/**
 * You don't need an app store to distribute your app.
 *
 * ────────────────────────────────────────────────────────────────
 * 4.1  Direct Distribution (Easiest)
 * ────────────────────────────────────────────────────────────────
 *
 *   - Share the .apk file via WhatsApp / Telegram
 *   - Host the .apk on your website as a download link
 *   - Print a QR code linking to the download URL
 *   - Pre-install on phones before giving to farmers
 *
 * ────────────────────────────────────────────────────────────────
 * 4.2  Or Just Use the PWA (Even Easier)
 * ────────────────────────────────────────────────────────────────
 *
 *   Remember: the PWA itself already works like a native app.
 *   Farmers can scan a QR code → browser opens → "Add to Home Screen"
 *   → app icon appears → works offline.
 *
 *   The native app adds:
 *     + App store listing
 *     + Slightly more native feel
 *     + Access to camera, GPS, and other hardware
 *
 *   Choose what works best for your market.
 */


// ============================================================================
// STEP 5: UPDATES
// ============================================================================
/**
 * ────────────────────────────────────────────────────────────────
 * 5.1  Content Updates = Nothing to Do
 * ────────────────────────────────────────────────────────────────
 *
 *   Your app is a "shell" that loads your live PWA.
 *   When you update your PWA, the app automatically shows the
 *   latest version. No rebuild needed.
 *
 *   This includes: page content, styles, features, bug fixes,
 *   configuration changes, new languages, etc.
 *
 * ────────────────────────────────────────────────────────────────
 * 5.2  When You DO Need to Rebuild
 * ────────────────────────────────────────────────────────────────
 *
 *   Only in these rare cases:
 *     - Change the app name or icon
 *     - Change the package ID (not recommended)
 *     - App store requires a new version number
 *
 * ────────────────────────────────────────────────────────────────
 * 5.3  How to Rebuild
 * ────────────────────────────────────────────────────────────────
 *
 *   If you need to update on app stores, you must use the same
 *   signing key from the first build.
 *
 *   1. Convert your saved keystore to text:
 *
 *      macOS:    base64 -i release.keystore | pbcopy
 *      Linux:    base64 -w 0 release.keystore
 *      Windows:  certutil -encode release.keystore output.txt
 *                (copy the content between the headers)
 *
 *      Or use any online "file to base64" converter.
 *
 *   2. In your GitHub repo:
 *      Settings → Secrets and variables → Actions → New repository secret
 *
 *      Add these three secrets:
 *
 *        Secret Name          Value (from keystore-info.txt)
 *        ──────────────────── ──────────────────────────────────
 *        KEYSTORE_BASE64      the long base64 text
 *        KEYSTORE_PASSWORD    the password from keystore-info.txt
 *        KEY_ALIAS            the alias from keystore-info.txt
 *
 *   3. Run the build again (same as Step 2), with a higher version
 *      number (e.g. 1.1.0)
 *
 *   But in most cases, you won't need this.
 *   Content updates happen automatically via the PWA.
 */


// ============================================================================
// APPENDIX A: PUBLISHING TO APP STORES
// ============================================================================
/**
 * ────────────────────────────────────────────────────────────────
 * Google Play Store
 * ────────────────────────────────────────────────────────────────
 *
 *   1. Register: https://play.google.com/console ($25 one-time)
 *   2. Create a new app
 *   3. Upload the .aab file (NOT the .apk)
 *   4. Fill in: description, screenshots, privacy policy URL
 *   5. Submit for review (1-3 days)
 *
 *   You need:
 *     - App icon: 512×512 PNG
 *     - Feature graphic: 1024×500 PNG
 *     - At least 2 screenshots
 *     - Privacy policy URL
 *
 * ────────────────────────────────────────────────────────────────
 * Huawei AppGallery
 * ────────────────────────────────────────────────────────────────
 *
 *   Important for markets where Huawei phones are common
 *   (China, parts of Africa, Southeast Asia).
 *   Register at: https://developer.huawei.com/consumer/en/appgallery
 *   Upload the .apk file. Free to register.
 *
 * ────────────────────────────────────────────────────────────────
 * Apple App Store
 * ────────────────────────────────────────────────────────────────
 *
 *   iOS builds require additional setup (Apple Developer account,
 *   $99/year, macOS runner). Contact us if you need iOS support.
 */


// ============================================================================
// APPENDIX B: FAQ
// ============================================================================
/**
 * ────────────────────────────────────────────────────────────────
 * Q: Do I need to install anything on my computer?
 * ────────────────────────────────────────────────────────────────
 *   No. Everything runs on GitHub's servers.
 *   You only need a browser and a GitHub account.
 *
 * ────────────────────────────────────────────────────────────────
 * Q: Is this free?
 * ────────────────────────────────────────────────────────────────
 *   Yes. GitHub Actions free tier gives you 2,000 minutes/month.
 *   Each build takes ~5 minutes. That's 400 builds/month for free.
 *
 * ────────────────────────────────────────────────────────────────
 * Q: What's a Package ID?
 * ────────────────────────────────────────────────────────────────
 *   A unique identifier for your app, like a domain name in reverse.
 *   Examples:
 *     com.greenfarm.app
 *     com.farmplus.mobile
 *     org.agritech.market
 *
 *   Rules:
 *     - Must be unique (no other app in the world uses it)
 *     - Lowercase letters, numbers, and dots only
 *     - At least two parts separated by dots
 *     - Cannot be changed after publishing to an app store
 *
 * ─────────────────────────────��──────────────────────────────────
 * Q: The app opens but shows a blank screen?
 * ────────────────────────────────────────────────────────────────
 *   1. Make sure your PWA URL starts with https:// (not http://)
 *   2. Make sure the phone has internet access
 *   3. Try opening the PWA URL in the phone's browser
 *   4. If the browser works but the app doesn't, check your
 *      SSL certificate
 *
 * ────────────────────────────────────────────────────────────────
 * Q: The build failed. What do I do?
 * ────────────────────────────────────────────────────────────────
 *   1. Click on the failed run to see the error log
 *   2. Most common cause: invalid Package ID format
 *   3. Try again with a simple Package ID like "com.yourname.app"
 *   4. If it still fails, open a GitHub Issue
 *
 * ────────────────────────────────────────────────────────────────
 * Q: Can I customize the app icon?
 * ────────────────────────────────────────────────────────────────
 *   Yes. In your forked repository:
 *   1. Replace /public/icon-192.svg with your logo
 *   2. Replace /public/icon-512.svg with your logo
 *   3. Then run the build
 *
 * ────────────────────────────────────────────────────────────────
 * Q: How does the app update its content?
 * ────────────────────────────────────────────────────────────────
 *   The app loads your live PWA URL. When you update the PWA,
 *   the app automatically shows the latest version.
 *   No rebuild needed. No re-download for users.
 *
 * ────────────────────────────────────────────────────────────────
 * Q: Do I still need the PWA?
 * ────────────────────────────────────────────────────────────────
 *   Yes! The app is just a shell that loads your PWA.
 *   You must deploy the PWA first (see PWA_DEPLOYMENT_GUIDE.ts),
 *   get your https:// URL, then build the app.
 */


// ============================================================================
// END OF DOCUMENT
// ============================================================================
/**
 * Summary:
 *   1. Deploy your PWA first (get an https:// URL)
 *   2. Fork the repo                            (2 min)
 *   3. Actions → Run workflow → fill 3 fields   (1 min)
 *   4. Wait for build                           (5 min)
 *   5. Download ZIP → install APK → distribute  (2 min)
 *
 * Total: ~10 minutes. No coding. No installs.
 * Content updates happen automatically via the PWA.
 * Build once, use forever.
 */

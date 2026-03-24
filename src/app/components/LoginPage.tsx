import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { X, Smartphone, MessageSquare, Mail, Loader2, AlertTriangle, Info } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { setUserLoggedIn, setServerUserId, setAccessToken } from "../utils/auth";
import { storageGetJSON } from "../utils/safeStorage";
import { useHomeConfig } from "../hooks/useHomeConfig";
import { useAppIcon } from "../hooks/useAppIcon";
import { apiClient } from "../utils/apiClient";
import { CONFIG_STORAGE_KEY } from "../constants";

// ============================================================================
// LoginPage — Real Auth Flow with OAuth + OTP
// ============================================================================
// Architecture:
//   Backend enabled → real OAuth redirects + OTP via Edge Function
//   Backend disabled → demo mode (always succeed with local ID)
//
// OAuth flow:
//   1. Build provider authorize URL with client credentials from config
//   2. Redirect user to provider
//   3. Provider redirects to /auth/callback?provider=xxx&code=yyy
//   4. OAuthCallback component handles code exchange
//
// OTP flow:
//   1. User enters phone/email → click "Get Code"
//   2. Frontend calls Edge Function /send-code to dispatch SMS/email
//   3. User enters code → click "Login"
//   4. Frontend calls Edge Function /auth to verify code + get userId
// ============================================================================

// ---- OAuth Provider Authorize URLs ----
interface OAuthUrlConfig {
  authorizeUrl: string;
  scopeParam: string;
  defaultScope: string;
  clientIdParam: string;   // query param name for client id
  configKey: string;       // field name in oauthCredentials[provider]
}

const OAUTH_PROVIDERS: Record<string, OAuthUrlConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopeParam: "scope",
    defaultScope: "openid email profile",
    clientIdParam: "client_id",
    configKey: "clientId",
  },
  facebook: {
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    scopeParam: "scope",
    defaultScope: "email public_profile",
    clientIdParam: "client_id",
    configKey: "appId",
  },
  apple: {
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    scopeParam: "scope",
    defaultScope: "name email",
    clientIdParam: "client_id",
    configKey: "serviceId",
  },
  wechat: {
    authorizeUrl: "https://open.weixin.qq.com/connect/oauth2/authorize",
    scopeParam: "scope",
    defaultScope: "snsapi_userinfo",
    clientIdParam: "appid",
    configKey: "appId",
  },
  alipay: {
    authorizeUrl: "https://openauth.alipay.com/oauth2/publicAppAuthorize.htm",
    scopeParam: "scope",
    defaultScope: "auth_user",
    clientIdParam: "app_id",
    configKey: "appId",
  },
  twitter: {
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    scopeParam: "scope",
    defaultScope: "users.read tweet.read",
    clientIdParam: "client_id",
    configKey: "apiKey",
  },
  line: {
    authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize",
    scopeParam: "scope",
    defaultScope: "profile openid email",
    clientIdParam: "client_id",
    configKey: "channelId",
  },
};

// ---- Backend helpers ----
interface BackendConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  edgeFunctionName: string;
  enabled: boolean;
}

function getBackendConfig(): BackendConfig {
  const defaults: BackendConfig = { supabaseUrl: "", supabaseAnonKey: "", edgeFunctionName: "server", enabled: false };
  const saved = storageGetJSON<Record<string, any>>(CONFIG_STORAGE_KEY);
  if (saved) {
    const b = saved.backendProxyConfig;
    if (b) {
      return {
        supabaseUrl: b.supabaseUrl || "",
        supabaseAnonKey: b.supabaseAnonKey || "",
        edgeFunctionName: b.edgeFunctionName || "server",
        enabled: b.enabled ?? false,
      };
    }
  }
  return defaults;
}

function isBackendAvailable(): boolean {
  const cfg = getBackendConfig();
  return cfg.enabled && !!cfg.supabaseUrl && !cfg.supabaseUrl.includes("your-");
}

function getBackendHeaders(): Record<string, string> {
  const cfg = getBackendConfig();
  return {
    "Content-Type": "application/json",
    ...(cfg.supabaseAnonKey ? { Authorization: `Bearer ${cfg.supabaseAnonKey}` } : {}),
    ...(cfg.supabaseAnonKey ? { apikey: cfg.supabaseAnonKey } : {}),
  };
}

function getBackendUrl(path: string): string {
  const cfg = getBackendConfig();
  return `${cfg.supabaseUrl}/functions/v1/${cfg.edgeFunctionName}${path}`;
}

// ---- Send verification code ----
async function sendVerificationCode(
  method: "phone" | "email",
  credential: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiClient<{ success?: boolean; error?: string }>({
      endpoint: getBackendUrl("/send-code"),
      method: 'POST',
      body: { method, credential },
      headers: getBackendHeaders(),
      preferredVersion: 'v1',
      enableFallback: false,
      deduplicate: false,
      timeout: 15000,
      retry: { maxRetries: 2, initialDelay: 1000 },
    });
    const data = response.data;
    return { success: data.success !== false, error: data.error };
  } catch (err: any) {
    // apiClient wraps errors with retry context — extract user-friendly message
    const msg = err?.message || "Network error";
    return { success: false, error: msg.includes('timeout') ? 'Request timed out' : msg };
  }
}

// ---- Verify code and login ----
async function authenticateViaBackend(
  method: "phone" | "email",
  credential: string,
  code: string
): Promise<{ success: boolean; userId?: string; accessToken?: string; error?: string }> {
  try {
    const response = await apiClient<{
      userId?: string;
      accessToken?: string;
      access_token?: string;
      error?: string;
    }>({
      endpoint: getBackendUrl("/auth"),
      method: 'POST',
      body: { method, credential, code },
      headers: getBackendHeaders(),
      preferredVersion: 'v1',
      enableFallback: false,
      deduplicate: false,
      timeout: 20000,
      retry: { maxRetries: 2, initialDelay: 1000 },
    });
    const data = response.data;
    if (data.userId) {
      return {
        success: true,
        userId: data.userId,
        accessToken: data.accessToken || data.access_token,
      };
    }
    return { success: false, error: data.error || "No userId in response" };
  } catch (err: any) {
    const msg = err?.message || "Network error";
    return { success: false, error: msg.includes('timeout') ? 'Request timed out' : msg };
  }
}

// ---- Validation ----
function isValidPhone(phone: string): boolean {
  // Accept international formats: at least 7 digits, optional + prefix
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// Component
// ============================================================================

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { config } = useHomeConfig();
  const appIcon = useAppIcon();
  const loginCfg = config.loginConfig;
  const socialProviders = loginCfg?.socialProviders;
  
  const backendEnabled = isBackendAvailable();

  // Use configured default, fall back to 'phone'
  const defaultMethod = loginCfg?.defaultLoginMethod || 'phone';
  const resolvedDefault = 
    (defaultMethod === 'phone' && loginCfg?.enablePhoneLogin === false) ? 'email' :
    (defaultMethod === 'email' && loginCfg?.enableEmailLogin === false) ? 'phone' :
    defaultMethod;
  
  const [loginMethod, setLoginMethod] = useState<"phone" | "email">(resolvedDefault);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Code countdown
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [codeSending, setCodeSending] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enter animation
  const [animPhase, setAnimPhase] = useState<'entering' | 'visible'>('entering');
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimPhase('visible'));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Theme color
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') || '#059669';
    meta?.setAttribute('content', '#ffffff');
    return () => { meta?.setAttribute('content', prev); };
  }, []);

  // Cleanup cooldown interval
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const showPhone = loginCfg?.enablePhoneLogin !== false;
  const showEmail = loginCfg?.enableEmailLogin !== false;
  const showAccountLogin = showPhone || showEmail;

  // Clear error when switching methods or typing
  useEffect(() => { setErrorMsg(""); setSuccessMsg(""); }, [loginMethod, phone, email, code]);

  // ---- Helper: format countdown text ----
  const countdownText = useCallback((seconds: number) => {
    return (t.login.codeCountdown || "Resend in {seconds}s").replace("{seconds}", String(seconds));
  }, [t.login.codeCountdown]);

  // ---- Send Verification Code ----
  const handleSendCode = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    const credential = loginMethod === "phone" ? phone : email;

    // Validate input
    if (loginMethod === "phone" && !isValidPhone(credential)) {
      setErrorMsg(t.login.invalidPhone);
      return;
    }
    if (loginMethod === "email" && !isValidEmail(credential)) {
      setErrorMsg(t.login.invalidEmail);
      return;
    }

    if (!backendEnabled) {
      // Demo mode: fake code send
      setSuccessMsg(t.login.codeSent + " (demo: 123456)");
      startCooldown();
      return;
    }

    setCodeSending(true);
    try {
      const result = await sendVerificationCode(loginMethod, credential);
      if (result.success) {
        setSuccessMsg(t.login.codeSent);
        startCooldown();
      } else {
        setErrorMsg(result.error || t.login.codeSendFailed);
      }
    } catch {
      setErrorMsg(t.login.networkError);
    } finally {
      setCodeSending(false);
    }
  };

  const startCooldown = () => {
    setCodeCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCodeCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ---- Account Login ----
  const handleLogin = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!agreed) {
      setErrorMsg(t.login.agreeFirst);
      return;
    }

    const credential = loginMethod === "phone" ? phone : email;

    // Validate input
    if (loginMethod === "phone" && !isValidPhone(credential)) {
      setErrorMsg(t.login.invalidPhone);
      return;
    }
    if (loginMethod === "email" && !isValidEmail(credential)) {
      setErrorMsg(t.login.invalidEmail);
      return;
    }
    if (!code.trim()) {
      setErrorMsg(t.login.codeRequired);
      return;
    }

    setIsLoading(true);
    try {
      if (backendEnabled) {
        // Real backend: verify code and get userId
        const result = await authenticateViaBackend(loginMethod, credential, code);
        if (result.success && result.userId) {
          // Store token BEFORE setting login status, so any side effects
          // triggered by login state change already have access to the JWT.
          if (result.accessToken) {
            setAccessToken(result.accessToken);
          }
          setServerUserId(result.userId);
          
          // ---- Fetch Cloud Profile (requires user JWT, not anon key) ----
          try {
            if (result.accessToken) {
              const cfg = getBackendConfig();
              const profileRes = await apiClient<{ profile?: { name?: string; avatar?: string } }>({
                endpoint: getBackendUrl("/profile"),
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  ...(cfg.supabaseAnonKey ? { apikey: cfg.supabaseAnonKey } : {}),
                  Authorization: `Bearer ${result.accessToken}`,
                },
                preferredVersion: "v1",
                enableFallback: true,
              });
              const pData = profileRes.data?.profile as { name?: string; avatar?: string } | undefined;
              if (pData && (pData.name || pData.avatar)) {
                saveConfig({
                  ...config,
                  userProfile: {
                    ...config.userProfile,
                    name: pData.name || config.userProfile?.name,
                    avatar: pData.avatar || config.userProfile?.avatar,
                  },
                });
                console.log("[Login] Synced profile from cloud");
              }
            }
          } catch (e) {
            console.warn("[Login] Failed to sync cloud profile:", e);
          }
          // -----------------------------

          // Sync dealer contacts from cloud (fire-and-forget)
          import("../services/ContactStorageService").then(({ contactStorage }) => {
            contactStorage.syncFromCloud().catch(() => {});
          });

          setUserLoggedIn(true);
          navigate("/home/profile");
        } else {
          setErrorMsg(result.error || t.login.loginFailed);
        }
      } else {
        // Demo mode: accept any code (or "123456")
        console.log(`[Login] Demo mode: no backend, using local ID`);
        setUserLoggedIn(true);
        navigate("/home/profile");
      }
    } catch (err: any) {
      setErrorMsg(err?.message?.includes("fetch") ? t.login.networkError : (err?.message || t.login.loginFailed));
    } finally {
      setIsLoading(false);
    }
  };

  // ---- OAuth Social Login ----
  const handleSocialLogin = async (platform: string) => {
    setErrorMsg("");

    if (!agreed) {
      setErrorMsg(t.login.agreeFirst);
      return;
    }

    if (!backendEnabled) {
      // Demo mode: just log in directly
      console.log(`[Login] Demo mode: social login (${platform})`);
      setUserLoggedIn(true);
      navigate("/home/profile");
      return;
    }

    // Check if OAuth credentials are configured
    const credentials = (loginCfg?.oauthCredentials as any)?.[platform] || {};
    const providerConfig = OAUTH_PROVIDERS[platform];

    if (!providerConfig) {
      setErrorMsg(t.login.oauthNotConfigured);
      return;
    }

    const clientId = credentials[providerConfig.configKey];
    if (!clientId || clientId.startsWith("your-")) {
      setErrorMsg(t.login.oauthNotConfigured);
      return;
    }

    // Generate CSRF state token
    const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    sessionStorage.setItem("oauth_state", state);

    // Build authorize URL
    const redirectUri = `${window.location.origin}/auth/callback?provider=${platform}`;
    const params = new URLSearchParams({
      [providerConfig.clientIdParam]: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      [providerConfig.scopeParam]: providerConfig.defaultScope,
      state,
    });

    // WeChat uses # fragment for special handling
    const separator = platform === "wechat" ? "#wechat_redirect" : "";
    const authorizeUrl = `${providerConfig.authorizeUrl}?${params.toString()}${separator}`;

    console.log(`[Login] OAuth redirect to ${platform}:`, authorizeUrl);
    
    // Redirect to provider
    window.location.href = authorizeUrl;
  };

  // ---- Check if a provider has valid credentials ----
  const hasValidCredentials = (platform: string): boolean => {
    if (!backendEnabled) return true; // demo mode shows all
    const credentials = (loginCfg?.oauthCredentials as any)?.[platform] || {};
    const providerConfig = OAUTH_PROVIDERS[platform];
    if (!providerConfig) return false;
    const clientId = credentials[providerConfig.configKey];
    return !!clientId && !clientId.startsWith("your-");
  };

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col items-center px-[5vw] overflow-y-auto"
      style={{
        transform: animPhase === 'visible' ? 'none' : 'scale(0.96)',
        opacity: animPhase === 'visible' ? 1 : 0,
        transition: 'transform 200ms ease-out, opacity 200ms ease-out',
      }}
    >
      {/* Status bar spacer */}
      <div className="bg-white safe-top flex-shrink-0 fixed top-0 inset-x-0 z-10" />

      <button
        onClick={() => navigate("/home")}
        className="absolute right-[3vw] text-gray-600 active:bg-gray-200 p-[1vw] rounded-full transition-colors touch-manipulation z-10"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 2vh + 8px)', width: 'clamp(20px, 7vw, 32px)', height: 'clamp(20px, 7vw, 32px)' }}
      >
        <X style={{ width: '100%', height: '100%' }} />
      </button>

      {/* 弹性占位 - 把内容推到视觉居中偏上的位置 */}
      <div style={{ flex: '1 1 8vh', minHeight: 'calc(env(safe-area-inset-top, 0px) + 48px)' }} />

      {/* Logo + Branding */}
      <div className="w-full" style={{ maxWidth: 'min(90vw, 400px)', marginBottom: 'clamp(15px, 3vh, 20px)' }}>
        <div className="flex items-center" style={{ gap: 'clamp(10px, 2.5vw, 14px)' }}>
          <div 
            className="bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden"
            style={{ width: 'clamp(48px, 14vw, 64px)', height: 'clamp(48px, 14vw, 64px)', borderRadius: 'clamp(10px, 2.5vw, 14px)' }}
          >
            {config?.appBranding?.logoUrl ? (
              <img 
                src={config.appBranding.logoUrl} 
                alt="Logo"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : appIcon ? (
              <img 
                src={appIcon} 
                alt="Logo"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement('span'), { className: 'text-emerald-600 font-bold', style: 'font-size:clamp(22px,8vw,36px)', textContent: '🌱' })); }}
              />
            ) : (
              <span className="text-emerald-600 font-bold" style={{ fontSize: 'clamp(22px, 8vw, 36px)' }}>🌱</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-gray-900 font-bold leading-tight" style={{ fontSize: 'clamp(14px, 4.5vw, 20px)', marginBottom: 'clamp(1px, 0.3vh, 4px)' }}>{config?.appBranding?.appName || "TaprootAgro"}</h1>
            <p className="text-gray-500 leading-snug" style={{ fontSize: 'clamp(8px, 2.4vw, 12px)' }}>{config?.appBranding?.slogan || "To be the taproot of smart agro."}</p>
          </div>
        </div>
      </div>

      <div className="w-full" style={{ maxWidth: 'min(90vw, 400px)' }}>
        {/* Quick Login (Social) */}
        {/* Icon SVG sources & licenses:
         *  Google: Official Google Sign-In brand guidelines (multi-color, required by Google)
         *  Facebook, Apple, X, LINE: Simple Icons (CC0 1.0 Universal Public Domain)
         *  WeChat, Alipay: Simplified brand marks (used under nominative fair use for login identification)
         *  All brand logos are used in social login buttons per each company's brand guidelines.
         */}
        <div className="bg-gray-50 rounded-xl" style={{ padding: 'clamp(12px, 3vw, 16px)', marginBottom: 'clamp(12px, 3vh, 16px)', borderRadius: 'clamp(10px, 2.5vw, 14px)' }}>
          <h3 className="text-gray-700 text-center font-medium" style={{ fontSize: 'clamp(11px, 3.2vw, 13px)', marginBottom: 'clamp(10px, 2.5vh, 14px)' }}>{t.login.quickLogin}</h3>
          
          {/* Social login icons — unified flex-wrap grid */}
          <div className="flex items-center justify-center flex-wrap" style={{ gap: 'clamp(10px, 3vw, 14px)' }}>
            {socialProviders?.wechat !== false && (
              <button onClick={() => handleSocialLogin("wechat")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('wechat') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-[#07C160] rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  {/* WeChat: Two chat bubbles with eyes — Simple Icons (CC0) style */}
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '60%', height: '60%' }}>
                    {/* Large bubble */}
                    <path d="M9.5 4C5.36 4 2 6.69 2 10c0 1.81 1.04 3.44 2.67 4.56L4 17l2.63-1.32c.88.26 1.82.42 2.79.44-.05-.37-.08-.74-.08-1.12 0-3.31 3.13-6 7-6 .17 0 .34.01.5.02C16.07 5.93 13.05 4 9.5 4z"/>
                    {/* Small bubble */}
                    <path d="M22 15c0-2.76-2.69-5-6-5s-6 2.24-6 5 2.69 5 6 5c.73 0 1.43-.11 2.07-.32L20.5 21l-.63-2.35C21.18 17.58 22 16.36 22 15z"/>
                    {/* Eyes: large bubble */}
                    <circle cx="7" cy="9.5" r="1" fill="#07C160"/>
                    <circle cx="11" cy="9.5" r="1" fill="#07C160"/>
                    {/* Eyes: small bubble */}
                    <circle cx="14" cy="14.8" r=".75" fill="#07C160"/>
                    <circle cx="18" cy="14.8" r=".75" fill="#07C160"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.wechat}</span>
              </button>
            )}
            {socialProviders?.google !== false && (
              <button onClick={() => handleSocialLogin("google")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('google') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-white rounded-full flex items-center justify-center shadow-sm" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  <svg viewBox="0 0 24 24" style={{ width: '70%', height: '70%' }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.google}</span>
              </button>
            )}
            {socialProviders?.facebook !== false && (
              <button onClick={() => handleSocialLogin("facebook")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('facebook') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-[#1877F2] rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '50%', height: '50%' }}>
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.facebook}</span>
              </button>
            )}
            {socialProviders?.apple !== false && (
              <button onClick={() => handleSocialLogin("apple")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('apple') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-black rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '65%', height: '65%' }}>
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.apple}</span>
              </button>
            )}
            {socialProviders?.alipay !== false && (
              <button onClick={() => handleSocialLogin("alipay")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('alipay') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-[#1678FF] rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  {/* Alipay: Simple Icons (CC0 1.0) — standard 24x24 viewBox */}
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '60%', height: '60%' }}>
                    <path d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.alipay}</span>
              </button>
            )}
            {socialProviders?.twitter !== false && (
              <button onClick={() => handleSocialLogin("twitter")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('twitter') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-black rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '55%', height: '55%' }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.twitter}</span>
              </button>
            )}
            {socialProviders?.line !== false && (
              <button onClick={() => handleSocialLogin("line")} className={`flex flex-col items-center gap-1 active:opacity-70 transition-opacity ${!hasValidCredentials('line') && backendEnabled ? 'opacity-40' : ''}`}>
                <div className="bg-[#00B900] rounded-full flex items-center justify-center" style={{ width: 'clamp(32px, 9vw, 42px)', height: 'clamp(32px, 9vw, 42px)' }}>
                  {/* LINE: Simple Icons (CC0 1.0) — corrected path with proper L-I-N-E letters */}
                  <svg viewBox="0 0 24 24" className="fill-white" style={{ width: '65%', height: '65%' }}>
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.282.629-.631.629-.345 0-.626-.285-.626-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.345 0 .627.285.627.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                </div>
                <span className="text-gray-600" style={{ fontSize: 'clamp(8px, 2.2vw, 9px)' }}>{t.login.line}</span>
              </button>
            )}
          </div>
        </div>

        {/* Agreement Checkbox */}
        <div className="flex items-center justify-center" style={{ marginBottom: 'clamp(12px, 3vh, 16px)' }}>
          <div className="flex items-start" style={{ gap: 'clamp(5px, 1.5vw, 8px)' }}>
            <input type="checkbox" id="agreement" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 rounded accent-emerald-600 flex-shrink-0" style={{ width: 'clamp(12px, 3.5vw, 16px)', height: 'clamp(12px, 3.5vw, 16px)' }} />
            <label htmlFor="agreement" className="text-gray-600 leading-tight" style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }}>
              {t.login.agreeTerms}
              <span className="underline mx-0.5 text-emerald-600">{t.login.userAgreement}</span>
              {t.login.and}
              <span className="underline ms-0.5 text-emerald-600">{t.login.privacyPolicy}</span>
            </label>
          </div>
        </div>

        {/* Error / Success Messages */}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3" style={{ borderRadius: 'clamp(8px, 2vw, 12px)' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-red-600" style={{ fontSize: 'clamp(10px, 2.8vw, 12px)' }}>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3" style={{ borderRadius: 'clamp(8px, 2vw, 12px)' }}>
            <Info className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span className="text-emerald-700" style={{ fontSize: 'clamp(10px, 2.8vw, 12px)' }}>{successMsg}</span>
          </div>
        )}

        {/* Demo mode banner */}
        {!backendEnabled && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3" style={{ borderRadius: 'clamp(8px, 2vw, 12px)' }}>
            <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700" style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }}>{t.login.demoLoginNote}</span>
          </div>
        )}

        {/* Account Login (Phone/Email + OTP) */}
        {showAccountLogin && (
          <div className="bg-gray-50 rounded-xl" style={{ padding: 'clamp(12px, 3vw, 16px)', borderRadius: 'clamp(10px, 2.5vw, 14px)' }}>
            <h3 className="text-gray-700 text-center font-medium" style={{ fontSize: 'clamp(11px, 3.2vw, 13px)', marginBottom: 'clamp(10px, 2.5vh, 14px)' }}>{t.login.accountLogin}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1.5vh, 8px)' }}>
              {/* Phone / Email toggle */}
              <div className="flex items-center" style={{ gap: 'clamp(5px, 1.5vw, 8px)' }}>
                {showPhone && (
                  <button onClick={() => setLoginMethod("phone")} className={`flex-1 flex items-center justify-center ${loginMethod === "phone" ? "bg-emerald-600 text-white" : "bg-white text-gray-800"} transition-colors font-medium`} style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)', padding: 'clamp(6px, 1.8vw, 9px)', fontSize: 'clamp(11px, 3.2vw, 13px)' }}>
                    <span>{t.login.phone}</span>
                  </button>
                )}
                {showEmail && (
                  <button onClick={() => setLoginMethod("email")} className={`flex-1 flex items-center justify-center ${loginMethod === "email" ? "bg-emerald-600 text-white" : "bg-white text-gray-800"} transition-colors font-medium`} style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)', padding: 'clamp(6px, 1.8vw, 9px)', fontSize: 'clamp(11px, 3.2vw, 13px)' }}>
                    <span>{t.login.email}</span>
                  </button>
                )}
              </div>

              {/* Phone input */}
              {loginMethod === "phone" && (
                <div className="bg-white overflow-hidden" style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)' }}>
                  <div className="flex items-center" style={{ padding: 'clamp(7px, 2vw, 10px) clamp(10px, 2.5vw, 12px)' }}>
                    <Smartphone className="text-gray-400 flex-shrink-0" style={{ width: 'clamp(14px, 4vw, 18px)', height: 'clamp(14px, 4vw, 18px)', marginRight: 'clamp(6px, 2vw, 8px)' }} />
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.login.phonePlaceholder} className="flex-1 outline-none min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400" style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} maxLength={15} />
                  </div>
                </div>
              )}

              {/* Email input */}
              {loginMethod === "email" && (
                <div className="bg-white overflow-hidden" style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)' }}>
                  <div className="flex items-center" style={{ padding: 'clamp(7px, 2vw, 10px) clamp(10px, 2.5vw, 12px)' }}>
                    <Mail className="text-gray-400 flex-shrink-0" style={{ width: 'clamp(14px, 4vw, 18px)', height: 'clamp(14px, 4vw, 18px)', marginRight: 'clamp(6px, 2vw, 8px)' }} />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.login.emailPlaceholder} className="flex-1 outline-none min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400" style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} />
                  </div>
                </div>
              )}

              {/* Verification code + Get Code button */}
              <div className="flex" style={{ gap: 'clamp(5px, 1.5vw, 8px)' }}>
                <div className="flex-1 bg-white overflow-hidden min-w-0" style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)' }}>
                  <div className="flex items-center" style={{ padding: 'clamp(7px, 2vw, 10px) clamp(10px, 2.5vw, 12px)' }}>
                    <MessageSquare className="text-gray-400 flex-shrink-0" style={{ width: 'clamp(14px, 4vw, 18px)', height: 'clamp(14px, 4vw, 18px)', marginRight: 'clamp(6px, 2vw, 8px)' }} />
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.login.codePlaceholder} className="flex-1 outline-none min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400" style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} maxLength={6} />
                  </div>
                </div>
                <button
                  onClick={handleSendCode}
                  disabled={codeCooldown > 0 || codeSending}
                  className="bg-emerald-600 text-white active:bg-emerald-700 transition-colors whitespace-nowrap font-medium flex-shrink-0 disabled:opacity-50 disabled:active:bg-emerald-600"
                  style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)', padding: 'clamp(7px, 2vw, 10px) clamp(10px, 2.8vw, 14px)', fontSize: 'clamp(10px, 2.8vw, 12px)' }}
                >
                  {codeSending ? (
                    <Loader2 className="animate-spin" style={{ width: 'clamp(12px, 3.5vw, 16px)', height: 'clamp(12px, 3.5vw, 16px)' }} />
                  ) : codeCooldown > 0 ? (
                    countdownText(codeCooldown)
                  ) : (
                    t.login.getCode
                  )}
                </button>
              </div>

              {/* Login Button */}
              <button onClick={handleLogin} disabled={isLoading} className="w-full bg-emerald-600 text-white active:bg-emerald-700 transition-colors font-medium disabled:opacity-60" style={{ borderRadius: 'clamp(6px, 1.8vw, 10px)', padding: 'clamp(9px, 2.5vw, 12px)', fontSize: 'clamp(12px, 3.5vw, 14px)', marginTop: 'clamp(2px, 0.5vh, 4px)' }}>
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" style={{ width: 'clamp(14px, 4vw, 18px)', height: 'clamp(14px, 4vw, 18px)' }} />
                  </span>
                ) : t.login.oneClickLogin}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部弹性占位 - 与顶部占位配合实现垂直居中偏上 */}
      <div style={{ flex: '1.5 1 12vh' }} />

      {/* 底部安全区占位 — 防止手势导航栏遮挡最底部内容 */}
      <div className="safe-bottom flex-shrink-0" />
    </div>
  );
}

// 默认导出用于懒加载
export default LoginPage;
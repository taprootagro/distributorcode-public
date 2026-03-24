import { useEffect, useState, startTransition } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { setUserLoggedIn, setServerUserId, setAccessToken } from "../utils/auth";
import { useLanguage } from "../hooks/useLanguage";
import { storageGetJSON } from "../utils/safeStorage";
import { CONFIG_STORAGE_KEY } from "../constants";

function profileFetchHeaders(
  anonKey: string | undefined,
  accessToken: string,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(anonKey ? { apikey: anonKey } : {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

// ============================================================================
// OAuthCallback — Handles OAuth provider redirects
// ============================================================================
// Flow:
//   1. Provider redirects to /auth/callback?provider=xxx&code=yyy
//   2. We send the code to Supabase Edge Function for token exchange
//   3. Edge Function creates/finds user, returns userId
//   4. We store userId and navigate to /home/profile
// ============================================================================

type Status = "exchanging" | "success" | "error";

export function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>("exchanging");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const provider = searchParams.get("provider") || "";
    const code = searchParams.get("code") || "";
    const error = searchParams.get("error");
    const state = searchParams.get("state") || "";

    // Some providers return error in URL (e.g., user denied)
    if (error) {
      setStatus("error");
      setErrorMsg(searchParams.get("error_description") || error);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMsg("No authorization code received");
      return;
    }

    // Verify state parameter to prevent CSRF
    const savedState = sessionStorage.getItem("oauth_state");
    if (savedState && state !== savedState) {
      setStatus("error");
      setErrorMsg("Invalid state parameter (CSRF protection)");
      return;
    }
    sessionStorage.removeItem("oauth_state");

    exchangeCode(provider, code);
  }, []);

  async function exchangeCode(provider: string, code: string) {
    try {
      const saved = storageGetJSON<Record<string, any>>(CONFIG_STORAGE_KEY);
      if (!saved) {
        throw new Error("No configuration found");
      }

      const bpc = saved.backendProxyConfig;

      if (!bpc?.enabled || !bpc?.supabaseUrl) {
        throw new Error("Backend not configured");
      }

      const redirectUri = `${window.location.origin}/auth/callback?provider=${provider}`;
      const endpoint = `${bpc.supabaseUrl}/functions/v1/${bpc.edgeFunctionName || "server"}/oauth-exchange`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(bpc.supabaseAnonKey ? { Authorization: `Bearer ${bpc.supabaseAnonKey}` } : {}),
        ...(bpc.supabaseAnonKey ? { apikey: bpc.supabaseAnonKey } : {}),
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider,
          code,
          redirectUri,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.userId) {
        // Store token BEFORE setting login status, so any side effects
        // triggered by login state change already have access to the JWT.
        if (data.accessToken || data.access_token) {
          setAccessToken(data.accessToken || data.access_token);
        }
        setServerUserId(data.userId);

        // ---- Fetch Cloud Profile (user JWT required) ----
        try {
          const accessTok = data.accessToken || data.access_token;
          if (accessTok) {
          const profileUrl = `${bpc.supabaseUrl}/functions/v1/${bpc.edgeFunctionName || "server"}/profile`;
          const profileRes = await fetch(profileUrl, {
            method: "GET",
            headers: profileFetchHeaders(bpc.supabaseAnonKey, accessTok),
          });
          if (profileRes.ok) {
            const pResData = await profileRes.json();
            const pData = pResData?.profile;
            if (pData && (pData.name || pData.avatar)) {
              // Get current config
              const currentConfig = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
              if (currentConfig.userProfile) {
                currentConfig.userProfile = {
                  ...currentConfig.userProfile,
                  name: pData.name || currentConfig.userProfile.name,
                  avatar: pData.avatar || currentConfig.userProfile.avatar
                };
                localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(currentConfig));
                console.log("[OAuthCallback] Synced profile from cloud");
                
                // Dispatch event to notify useHomeConfig
                window.dispatchEvent(new Event('storage'));
              }
            }
          }
          }
        } catch (e) {
          console.warn("[OAuthCallback] Failed to sync cloud profile:", e);
        }
        // -----------------------------

        // Sync dealer contacts from cloud (fire-and-forget)
        import("../services/ContactStorageService").then(({ contactStorage }) => {
          contactStorage.syncFromCloud().catch(() => {});
        });

        setUserLoggedIn(true);
        setStatus("success");

        // Brief delay for visual feedback, then navigate
        setTimeout(() => {
          navigate("/home/profile", { replace: true });
        }, 600);
      } else {
        throw new Error(data.error || "No userId returned from server");
      }
    } catch (err: any) {
      console.error("[OAuthCallback] Exchange failed:", err);
      setStatus("error");
      setErrorMsg(err?.message || "Unknown error");
    }
  }

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center px-8">
      <div className="text-center max-w-xs">
        {status === "exchanging" && (
          <>
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{t.login.redirecting}</p>
            <p className="text-xs text-gray-400 mt-2">Verifying your identity...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{t.login.redirecting}</p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{t.login.oauthError}</p>
            <p className="text-xs text-red-400 mt-2 break-words">{errorMsg}</p>
            <button
              onClick={() => startTransition(() => navigate("/login", { replace: true }))}
              className="mt-6 bg-emerald-600 text-white px-6 py-2.5 rounded-xl active:bg-emerald-700 transition-colors font-medium text-sm"
            >
              {t.login.loginButton}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default OAuthCallback;
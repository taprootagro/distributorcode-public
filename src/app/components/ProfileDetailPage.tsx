import { useState, useRef, useCallback } from "react";
import { Camera, User, Copy, Check } from "lucide-react";
import { SecondaryView } from "./SecondaryView";
import { useLanguage } from "../hooks/useLanguage";
import { useConfigContext } from "../hooks/ConfigProvider";
import { getUserId, isServerAssignedId, getAccessToken } from "../utils/auth";
import { compressImageFile, COMPRESS_PRESETS } from "../utils/imageCompressor";

interface ProfileDetailPageProps {
  onClose: () => void;
}

export function ProfileDetailPage({ onClose }: ProfileDetailPageProps) {
  const { t } = useLanguage();
  const { config, saveConfig } = useConfigContext();

  const userId = getUserId();
  const isServer = isServerAssignedId();

  const [name, setName] = useState(config?.userProfile?.name || "");
  const [avatar, setAvatar] = useState(config?.userProfile?.avatar || "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarInputRef.current) avatarInputRef.current.value = "";

    try {
      const compressed = await compressImageFile(file, COMPRESS_PRESETS.chat);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) setAvatar(base64);
      };
      reader.readAsDataURL(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) setAvatar(base64);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newProfile = {
        name: name.trim() || config?.userProfile?.name || "Rick",
        avatar: avatar || config?.userProfile?.avatar || "",
      };
      
      const updated = {
        ...config,
        userProfile: {
          ...(config?.userProfile || {}),
          ...newProfile
        },
      };
      saveConfig(updated);
      
      // Save to cloud if logged in and backend enabled
      if (userId && isServer) {
        try {
          const cfg = JSON.parse(localStorage.getItem("agri_home_config") || "{}");
          const backendCfg = cfg.backendProxyConfig || {};
          const isEnabled = backendCfg.enabled && backendCfg.supabaseUrl;
          
          if (isEnabled) {
            const token = getAccessToken();
            if (!token) {
              console.warn("[ProfileDetail] No access token — skip cloud profile sync");
            } else {
            const url = `${backendCfg.supabaseUrl}/functions/v1/${backendCfg.edgeFunctionName || "server"}/profile`;
            await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(backendCfg.supabaseAnonKey ? { apikey: backendCfg.supabaseAnonKey } : {}),
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ profile: newProfile }),
            });
            }
            console.log("[ProfileDetail] Saved profile to cloud");
          }
        } catch (e) {
          console.warn("[ProfileDetail] Failed to save profile to cloud", e);
        }
      }
      
      showToast(t.profile.profileUpdated || "Profile updated");
    } catch (err) {
      console.error("[ProfileDetail] Save error:", err);
    } finally {
      setSaving(false);
    }
  }, [config, name, avatar, saveConfig, showToast, t, userId, isServer]);

  const handleCopyId = useCallback(() => {
    if (userId) {
      navigator.clipboard?.writeText(userId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [userId]);

  const defaultAvatar = "https://images.unsplash.com/photo-1642919854816-98575cbaefa8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzaW1wbGUlMjBsZWFmJTIwc2tldGNoJTIwbWluaW1hbCUyMGRyYXdpbmd8ZW58MXx8fHwxNzcwODU0NDU2fDA&ixlib=rb-4.1.0&q=80&w=1080";

  return (
    <SecondaryView onClose={onClose} title={t.profile.editProfile || "Edit Profile"} showTitle={true}>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="p-4 space-y-6">
        {/* 头像 */}
        <div className="flex flex-col items-center pt-4">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-emerald-100 shadow-xl bg-gradient-to-br from-emerald-400 to-emerald-600">
              <img
                src={avatar || defaultAvatar}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform ring-3 ring-white"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* 网名 + ID */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          {/* 网名 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              {t.profile.nickname || "Nickname"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-300 transition-shadow"
            />
          </div>

          {/* ID（只读） */}
          {userId && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t.profile.userId || "User ID"}
              </label>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-600 font-mono flex-1 truncate">{userId}</span>
                <button
                  onClick={handleCopyId}
                  className="flex-shrink-0 active:scale-90 transition-transform"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1 px-1">
                {isServer ? "Server-assigned ID" : "Local ID (demo mode)"}
              </p>
            </div>
          )}
        </div>

        {/* 保存 */}
        <div className="px-0 pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl font-medium shadow-lg active:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? (t.common.loading || "Loading...") : (t.common.save || "Save")}
          </button>
        </div>
      </div>
    </SecondaryView>
  );
}
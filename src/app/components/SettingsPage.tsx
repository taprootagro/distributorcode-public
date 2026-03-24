import { useState, useEffect, startTransition } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Bell, RefreshCw, Shield, Globe, Info, ChevronRight, Check, FileText } from "lucide-react";
import { PushNotifications } from "./PushNotifications";
import { BackgroundSync } from "./BackgroundSync";
import { useLanguage, languages, Language } from "../hooks/useLanguage";
import { SecondaryView } from "./SecondaryView";
import { useConfigContext } from "../hooks/ConfigProvider";
import { isUserLoggedIn, setUserLoggedIn, clearAccessToken } from "../utils/auth";
import { isNative } from "../utils/capacitor-bridge";

export function SettingsPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { config } = useConfigContext();
  const [showPushSettings, setShowPushSettings] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const loggedIn = isUserLoggedIn();

  // 内容管理器只在桌面浏览器显示（非 PWA standalone、非原生 APP）
  const showConfigManager = (() => {
    try {
      if (isNative()) return false;
      if (window.matchMedia('(display-mode: standalone)').matches) return false;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return false;
      if ((navigator as any).standalone === true) return false;
      return true;
    } catch { return false; }
  })();

  // 进入动画
  const [animPhase, setAnimPhase] = useState<'entering' | 'visible'>('entering');
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimPhase('visible'));
    return () => cancelAnimationFrame(raf);
  }, []);

  const settingsSections = [
    {
      title: t.settings.advancedFeatures,
      items: [
        {
          icon: Bell,
          label: t.settings.pushNotifications,
          description: t.settings.pushNotificationsDesc,
          color: "text-emerald-600",
          action: () => setShowPushSettings(!showPushSettings),
          expanded: showPushSettings,
        },
        {
          icon: RefreshCw,
          label: t.settings.backgroundSync,
          description: t.settings.backgroundSyncDesc,
          color: "text-blue-600",
          action: () => setShowSyncSettings(!showSyncSettings),
          expanded: showSyncSettings,
        },
        {
          icon: FileText,
          label: t.settings.configManager,
          description: t.settings.configManagerDesc,
          color: "text-purple-600",
          action: () => startTransition(() => navigate("/config-manager")),
          visible: showConfigManager,
        },
      ],
    },
    {
      title: t.settings.generalSettings,
      items: [
        {
          icon: Globe,
          label: t.settings.language,
          description: languages[language].nativeName,
          color: "text-purple-600",
          action: () => setShowLanguageSelector(true),
        },
      ],
    },
    {
      title: t.settings.privacy,
      items: [
        {
          icon: Shield,
          label: t.settings.privacyPolicy,
          description: t.settings.privacyPolicyDesc,
          color: "text-orange-600",
          action: () => setShowPrivacyPolicy(true),
        },
        {
          icon: Info,
          label: t.settings.termsOfService,
          description: t.settings.termsOfServiceDesc,
          color: "text-gray-600",
          action: () => setShowTermsOfService(true),
        },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--app-bg)',
        transform: animPhase === 'visible' ? 'none' : 'scale(0.96)',
        opacity: animPhase === 'visible' ? 1 : 0,
        transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        willChange: animPhase === 'visible' ? 'auto' : 'transform, opacity',
      }}
    >
      {/* 顶部导航栏 */}
      <div className="bg-emerald-600 px-4 pt-12 pb-6 flex-shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home/profile")}
            className="text-white active:scale-95 transition-transform duration-150"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold text-white">{t.settings.title}</h1>
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
      {/* 设置列表 */}
      <div className="px-4 mt-4 space-y-4">
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {/* 分类标题 */}
            <div className="px-2 mb-2">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {section.title}
              </h2>
            </div>

            {/* 设置项卡片 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {section.items.filter(item => item.visible !== false).map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <div key={itemIndex}>
                    <button
                      onClick={item.action}
                      className="w-full px-4 py-3.5 flex items-center justify-between active:bg-emerald-100 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                          item.expanded ? 'bg-emerald-100 scale-110' : 'bg-gray-50'
                        }`}>
                          <Icon className={`w-5 h-5 ${item.color} transition-transform duration-200 ${item.expanded ? 'scale-110' : ''}`} />
                        </div>
                        <div className="text-start flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.label}
                          </p>
                          {item.description && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-all duration-200 ${
                        item.expanded ? 'rotate-90 text-emerald-600' : ''
                      }`} />
                    </button>

                    {/* 展开的设置内容 - 添加平滑动画 */}
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      item.expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                      <div className="px-4 pb-4 bg-gray-50">
                        <div className="pt-3">
                          {item.label === t.settings.pushNotifications && <PushNotifications />}
                          {item.label === t.settings.backgroundSync && <BackgroundSync />}
                        </div>
                      </div>
                    </div>

                    {/* 分隔线 */}
                    {itemIndex < section.items.length - 1 && !item.expanded && (
                      <div className="mx-4" style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.06), transparent)' }}></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 退出登录按钮 */}
      {loggedIn && (
        <div className="px-4 mt-4 pb-8">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full bg-white text-gray-400 py-3 rounded-2xl active:bg-gray-50 transition-colors duration-150 text-sm shadow-sm"
          >
            {t.profile.logout}
          </button>
        </div>
      )}

      {/* 底部安全区占位 — 防止手势导航栏遮挡最底部内容 */}
      <div className="safe-bottom" />
      </div>

      {/* 退出登录确认弹窗 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-8" onClick={() => setShowLogoutConfirm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'fadeScaleIn 200ms ease-out' }}
          >
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              {t.profile.logoutConfirm || "Logout"}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {t.profile.logoutConfirmDesc || "Are you sure you want to logout?"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-medium active:bg-gray-200 transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  clearAccessToken();
                  setUserLoggedIn(false);
                  navigate("/home/profile", { replace: true });
                }}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-medium active:bg-red-600 transition-colors shadow-lg"
              >
                {t.profile.logoutConfirm || "Logout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 语言选择器 - 浮现弹出 */}
      {showLanguageSelector && (
        <SecondaryView 
          title={t.settings.language} 
          onClose={() => setShowLanguageSelector(false)}
          showTitle={true}
        >
          <div className="p-4 space-y-2">
            {/* 语言列表 */}
            {Object.entries(languages).map(([code, info]) => (
              <button
                key={code}
                onClick={() => {
                  setLanguage(code as Language);
                  setTimeout(() => setShowLanguageSelector(false), 300);
                }}
                className={`w-full p-4 rounded-xl flex items-center justify-between transition-all duration-200 ${
                  language === code
                    ? 'bg-emerald-50 border-2 border-emerald-500'
                    : 'bg-white border-2 border-gray-200 active:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="text-start flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${
                      language === code ? 'text-emerald-900' : 'text-gray-900'
                    }`}>
                      {info.nativeName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{info.name}</p>
                  </div>
                </div>
                {language === code && (
                  <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 ms-2" />
                )}
              </button>
            ))}
          </div>
        </SecondaryView>
      )}

      {/* 私政策 - 浮现弹出 */}
      {showPrivacyPolicy && (
        <SecondaryView 
          title={config?.privacyPolicy?.title || t.settings.privacyPolicy} 
          onClose={() => setShowPrivacyPolicy(false)}
          showTitle={true}
        >
          <div className="p-4 pb-8">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="text-sm text-gray-700 leading-relaxed rich-content max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: config?.privacyPolicy?.content || t.settings.privacyPolicyText }} />
            </div>
          </div>
        </SecondaryView>
      )}

      {/* 服务款 - 浮现弹出 */}
      {showTermsOfService && (
        <SecondaryView 
          title={config?.termsOfService?.title || t.settings.termsOfService} 
          onClose={() => setShowTermsOfService(false)}
          showTitle={true}
        >
          <div className="p-4 pb-8">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="text-sm text-gray-700 leading-relaxed rich-content max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: config?.termsOfService?.content || t.settings.termsOfServiceText }} />
            </div>
          </div>
        </SecondaryView>
      )}
    </div>
  );
}

// 默认导出用于懒加载
export default SettingsPage;
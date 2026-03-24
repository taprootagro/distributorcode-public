import { useState, useEffect } from "react";
import { storageGetJSON, storageSetJSON } from "../utils/safeStorage";
import { CONFIG_STORAGE_KEY } from "../constants";

// 首页配置数据结构
export interface BannerConfig {
  id: number;
  url: string;
  alt: string;
  title?: string;
  content?: string;  // 详情页内容
}

export interface NavigationItem {
  id: number;
  icon: string;
  title: string;
  subtitle: string;
}

export interface LiveStreamConfig {
  id: number;
  title: string;
  viewers: string;
  thumbnail: string;
  videoUrl?: string;
  // Per-video share settings
  shareEnabled?: boolean;
  shareUrl?: string;
  shareTitle?: string;
  shareText?: string;
  shareImgUrl?: string;
  wxJsSdkEnabled?: boolean;
  wxAppId?: string;
  wxSignatureApi?: string;
  // Per-video navigation settings
  navEnabled?: boolean;
  navLatitude?: string;
  navLongitude?: string;
  navAddress?: string;
  navCoordSystem?: CoordSystemType;
  navDisplayDays?: number;       // 导航按钮显示天数，默认15天，过期后自动隐藏
  navCreatedAt?: number;         // 导航启用时间戳（毫秒），首次启用时自动写入
  navBaiduMap?: boolean;
  navAmapMap?: boolean;
  navGoogleMap?: boolean;
  navAppleMaps?: boolean;
  navWaze?: boolean;
}

export interface ArticleConfig {
  id: number;
  title: string;
  author: string;
  views: string;
  category: string;
  date: string;
  content?: string;
  thumbnail?: string;
}

export interface VideoFeedConfig {
  title: string;
  description: string;
  videoSources: string[];
}

// 第二页（MarketPage）配置接口
export interface MarketCategoryConfig {
  id: string;
  name: string;
  subCategories: string[];
}

export interface MarketProductConfig {
  id: number;
  name: string;
  image: string;
  price: string;
  category: string;       // 一级类别ID
  subCategory: string;    // 二级类别名称
  description?: string;
  stock?: number;
  details?: string;       // 详细说明
  specifications?: string; // 产品规格
}

export interface MarketAdvertisementConfig {
  id: number;
  image: string;
  title: string;
  content?: string;   // 广告详情内容
}

// 备案信息配置接口
export interface FilingConfig {
  icpNumber: string;      // ICP备案号
  icpUrl: string;         // ICP备案链接
  policeNumber: string;   // 公安备案号
  policeUrl: string;      // 公安备案链接
}

// 关于我们配置接口
export interface AboutUsConfig {
  title: string;          // 标题
  content: string;        // 内容（支持换行）
}

// 隐私政策配置接口
export interface PrivacyPolicyConfig {
  title: string;          // 标题
  content: string;        // 内容（支持换行）
}

// 用户协议配置接口
export interface TermsOfServiceConfig {
  title: string;          // 标题
  content: string;        // 内容（支持换行）
}

// 应用品牌配置接口
export interface AppBrandingConfig {
  logoUrl: string;        // Logo图片URL
  appName: string;        // 应用名称
  slogan: string;         // Slogan
}

// 首页功能图标配置接口
export interface HomeIconsConfig {
  aiAssistantIconUrl: string;   // AI助手图标URL（留空则使用默认lucide图标）
  aiAssistantLabel: string;     // AI助手按钮文字（留空则使用多语言默认值）
  statementIconUrl: string;     // 对账单图标URL（留空则使用默认lucide图标）
  statementLabel: string;       // 对账单按钮文字（留空则使用多语言默认值）
  liveCoverUrl: string;         // 直播区封面图URL（留空则使用第一条直播的缩略图）
  liveTitle: string;            // 直播区标题文字（留空则使用第一条直播标题）
  liveBadge: string;            // 直播区角标文字（留空则使用多语言默认值如"直播&导航"）
}

// 聊天联系人配置接口
export interface ChatContactConfig {
  name: string;           // 联系人名称（商家名）
  avatar: string;         // 联系人头像URL
  subtitle: string;       // 副标题（如：TaprootAgro授权店）
  imUserId: string;       // IM服务商分配给商家的唯一别代码
  imProvider: string;     // 商家注册的IM服务商标识 (tencent-im / cometchat)
  channelId: string;      // 聊天室ID — 商家二维码中携带，扫码后固定保存
  phone: string;          // 商家联系电话
  storeId: string;        // 门店编号/商家编号
  verifiedDomains: string[]; // 域名白名单，扫码绑定时校验来源域名
  boundAt?: number;       // 绑定时间戳（扫码绑定成功后写入）
  boundFrom?: string;     // 绑定来源域名（扫码绑定成功后写入）
}

// 个人资料配置接口
export interface UserProfileConfig {
  name: string;           // 用户名称
  avatar: string;         // 用户头像URL
}

// 桌面图标配置接口
export interface DesktopIconConfig {
  appName: string;               // PWA应用名称
  icon192Url: string;            // 192x192 图标URL
  icon512Url: string;            // 512x512 图标URL
}

export interface PushConfig {
  vapidPublicKey: string;    // VAPID 公钥
  pushApiBase: string;       // 推送后端API基础路径 (例如 https://api.example.com)
  enabled: boolean;          // 是否启用推送功能
}

// 推送服务商类型
export type PushProvider = 'webpush' | 'fcm' | 'onesignal' | 'jpush' | 'getui';

// 多平台推送配置接口
export interface PushProvidersConfig {
  activeProvider: PushProvider;   // 当前激活的推送服务商

  // Web Push (VAPID) — 原生浏览器推送
  webpush: {
    enabled: boolean;
    vapidPublicKey: string;       // VAPID 公钥
    pushApiBase: string;          // 推送后端API基础路径
  };

  // Firebase Cloud Messaging
  fcm: {
    enabled: boolean;
    apiKey: string;               // Firebase Web API Key（公开）
    projectId: string;            // Firebase Project ID
    appId: string;                // Firebase App ID
    messagingSenderId: string;    // FCM Sender ID
    vapidKey: string;             // FCM Web Push VAPID Key
  };

  // OneSignal
  onesignal: {
    enabled: boolean;
    appId: string;                // OneSignal App ID（公开）
    safariWebId: string;          // Safari Web Push ID（可选）
  };

  // 极送 JPush
  jpush: {
    enabled: boolean;
    appKey: string;               // JPush App Key（公开）
    masterSecret: string;         // 仅展示标记，实际存后端
    channel: string;              // 推送渠道标识
    pushApiBase: string;          // JPush REST API 代理地址
  };

  // 个推 GeTui / UniPush
  getui: {
    enabled: boolean;
    appId: string;                // GeTui App ID（公开）
    appKey: string;               // GeTui App Key（公开）
    masterSecret: string;         // 仅展示标记，实际存后端
    pushApiBase: string;          // GeTui REST API 代理地址
  };
}

// AI模型配置接口
export interface AIModelConfig {
  modelUrl: string;          // ONNX 模型文件URL
  labelsUrl: string;         // 类别标签JSON文件URL
  enableLocalModel: boolean; // 是否启用本地ONNX推理模型（关闭则仅使用云端AI）
}

// 云端AI深度分析配置接口（后端代理模式）
export interface CloudAIConfig {
  enabled: boolean;                // 是否启用深度分析
  providerName: string;            // 显示名称（如：通义千问、Gemini、GPT-4o）
  edgeFunctionName: string;        // Supabase Edge Function 名称（默认 ai-vision-proxy）
  modelId: string;                 // 模型标识（传给Edge Function，如 qwen-vl-plus、gemini-2.0-flash）
  systemPrompt: string;            // 系统提示词（可自定义分析侧重点）
  maxTokens: number;               // 最大输出token数
}

// 后端代理配置接口（IM通讯 + Supabase）
export type ChatProvider = 'tencent-im' | 'cometchat';
export type IMMode = 'im-provider-direct';

export interface BackendProxyConfig {
  supabaseUrl: string;            // Supabase 项目 URL
  supabaseAnonKey: string;        // Supabase Anon Key（公开密钥，可安全放前端）
  enabled: boolean;               // 是否启用后端代理模式
  chatProvider: ChatProvider;     // IM服务商选择
  imMode: IMMode;                 // IM通道模式：im-provider-direct（SDK直连）
  // Tencent IM (腾讯云即时通信)
  tencentAppId: string;
  // CometChat
  cometchatAppId: string;
  cometchatRegion: string;        // 'us' | 'eu' | 'in' 等
}

// 直播页分享配置接口
export interface LiveShareConfig {
  enabled: boolean;               // 是否启用分享按钮
  shareUrl: string;               // 分享的PWA链接（留空自动取当前域名）
  shareTitle: string;             // 分享标题
  shareText: string;              // 分享描述文字
  shareImgUrl: string;            // 分享缩略图URL（微信分享卡片用）
  // 微信 JS-SDK 自定义分享
  wxJsSdkEnabled: boolean;        // 是否启用微信JS-SDK自定义分享卡片
  wxAppId: string;                // 微信公众号 AppID
  wxSignatureApi: string;         // 后端签名接口URL（POST {url} → {appId,timestamp,nonceStr,signature}）
}

// 坐标系类型
export type CoordSystemType = 'wgs84' | 'gcj02' | 'bd09';

// 直播页导航配置接口（调用第三方地图App）
export interface LiveNavigationConfig {
  enabled: boolean;               // 是否启用导航按钮
  latitude: string;               // 目的地纬度
  longitude: string;              // 目的地经度
  address: string;                // 显示地址名称
  coordSystem: CoordSystemType;   // 输入坐标系：wgs84 / gcj02 / bd09
  // 地图App开关 — 中国区
  baiduMap: boolean;              // 百度地图
  amapMap: boolean;               // 高德地图
  // 国际区
  googleMap: boolean;             // Google Maps
  appleMaps: boolean;             // Apple Maps
  waze: boolean;                  // Waze
}

// 登录页面配置接口
export interface OAuthProviderCredentials {
  wechat: { appId: string };
  google: { clientId: string };
  facebook: { appId: string };
  apple: { serviceId: string; teamId: string; keyId: string };
  alipay: { appId: string };
  twitter: { apiKey: string };
  line: { channelId: string };
}

export interface LoginConfig {
  socialProviders: {
    wechat: boolean;
    google: boolean;
    facebook: boolean;
    apple: boolean;
    alipay: boolean;
    twitter: boolean;
    line: boolean;
  };
  oauthCredentials: OAuthProviderCredentials;
  enablePhoneLogin: boolean;      // 是否启用机号登录
  enableEmailLogin: boolean;      // 是否启用邮箱登录
  defaultLoginMethod: 'phone' | 'email'; // 默认选中的登录方式
}

export interface MarketPageConfig {
  categories: MarketCategoryConfig[];
  products: MarketProductConfig[];
  advertisements: MarketAdvertisementConfig[];
}

export interface HomePageConfig {
  banners: BannerConfig[];
  navigation: NavigationItem[];
  liveStreams: LiveStreamConfig[];
  articles: ArticleConfig[];
  videoFeed: VideoFeedConfig;
  marketPage: MarketPageConfig; // 添加第二页配置
  currencySymbol: string; // 货币符号，如 ¥、$、€
  filing: FilingConfig; // 备案信息
  aboutUs: AboutUsConfig; // 关于我们
  privacyPolicy: PrivacyPolicyConfig; // 隐私政策
  termsOfService: TermsOfServiceConfig; // 用户协议
  appBranding: AppBrandingConfig; // 应用品牌
  homeIcons: HomeIconsConfig; // 首页功能图标配置
  chatContact: ChatContactConfig; // 聊天联系人
  userProfile: UserProfileConfig; // 个人资料
  desktopIcon: DesktopIconConfig; // 桌面图标配置
  pushConfig: PushConfig; // 推送通知配置
  pushProvidersConfig: PushProvidersConfig; // 多平台推送服务商配置
  aiModelConfig: AIModelConfig; // AI模型配置
  cloudAIConfig: CloudAIConfig; // 云端AI度分析配置
  backendProxyConfig: BackendProxyConfig; // 后端代理配置
  loginConfig: LoginConfig; // 登录页面配置
  liveShareConfig: LiveShareConfig; // 直播页分享配置
  liveNavigationConfig: LiveNavigationConfig; // 直播页导航配置
}

// 默认配置从 /taprootagrosetting/ JSON 文件聚合导入
// 骨架代码更新时只需复制 /taprootagrosetting/ 文件夹即可保留所有配置
import { defaultConfig } from '/taprootagrosetting';
export { defaultConfig };

// 这个 hook 现在只是为了向后兼容，建议使用 useConfig from ConfigContext
export function useHomeConfig() {
  // 导入 ConfigContext 的 hook
  // 为了避免循环依赖，我们保持这个 hook 的独立实现
  // 但添加事件监听来同步更新
  const [config, setConfig] = useState<HomePageConfig>(() => {
    // 从 localStorage 加载配置
    const parsedConfig = storageGetJSON<Record<string, any>>(CONFIG_STORAGE_KEY);
    if (parsedConfig) {
      try {
        // 合并默认配置以确保所有字段都存在
        return {
          ...defaultConfig,
          ...parsedConfig,
          marketPage: {
            ...defaultConfig.marketPage,
            ...(parsedConfig.marketPage || {}),
            categories: parsedConfig.marketPage?.categories || defaultConfig.marketPage.categories,
            products: parsedConfig.marketPage?.products || defaultConfig.marketPage.products,
            advertisements: parsedConfig.marketPage?.advertisements || 
              (parsedConfig.marketPage?.advertisement ? [parsedConfig.marketPage.advertisement] : defaultConfig.marketPage.advertisements),
          },
          filing: parsedConfig.filing || defaultConfig.filing,
          aboutUs: parsedConfig.aboutUs || defaultConfig.aboutUs,
          privacyPolicy: parsedConfig.privacyPolicy || defaultConfig.privacyPolicy,
          termsOfService: parsedConfig.termsOfService || defaultConfig.termsOfService,
          appBranding: parsedConfig.appBranding || defaultConfig.appBranding,
          homeIcons: parsedConfig.homeIcons || defaultConfig.homeIcons,
          chatContact: {
            ...defaultConfig.chatContact,
            ...(parsedConfig.chatContact || {}),
          },
          userProfile: parsedConfig.userProfile || defaultConfig.userProfile,
          desktopIcon: {
            ...defaultConfig.desktopIcon,
            ...(parsedConfig.desktopIcon || {}),
          },
          pushConfig: parsedConfig.pushConfig || defaultConfig.pushConfig,
          pushProvidersConfig: parsedConfig.pushProvidersConfig || defaultConfig.pushProvidersConfig,
          aiModelConfig: parsedConfig.aiModelConfig || defaultConfig.aiModelConfig,
          cloudAIConfig: parsedConfig.cloudAIConfig || defaultConfig.cloudAIConfig,
          backendProxyConfig: { ...defaultConfig.backendProxyConfig, ...(parsedConfig.backendProxyConfig || {}) },
          loginConfig: parsedConfig.loginConfig || defaultConfig.loginConfig,
          liveShareConfig: parsedConfig.liveShareConfig || defaultConfig.liveShareConfig,
          liveNavigationConfig: parsedConfig.liveNavigationConfig || defaultConfig.liveNavigationConfig
        };
      } catch (e) {
        console.error("Failed to parse config:", e);
        return defaultConfig;
      }
    }
    return defaultConfig;
  });

  // 监听配置更新事件
  useEffect(() => {
    const handleConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<HomePageConfig>;
      if (customEvent.detail) {
        console.log('🔄 配置已更新 - useHomeConfig', new Date().toLocaleTimeString());
        setConfig(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONFIG_STORAGE_KEY && e.newValue) {
        try {
          const newConfig = JSON.parse(e.newValue);
          console.log('🔄 Storage 更新 - useHomeConfig', new Date().toLocaleTimeString());
          setConfig(newConfig);
        } catch (error) {
          console.error("Failed to parse storage change:", error);
        }
      }
    };

    window.addEventListener('configUpdate', handleConfigUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('configUpdate', handleConfigUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 保存配置到 localStorage
  const saveConfig = (newConfig: HomePageConfig) => {
    console.log('💾 保存配置 - useHomeConfig', new Date().toLocaleTimeString());
    setConfig(newConfig);
    storageSetJSON(CONFIG_STORAGE_KEY, newConfig);
    // 触发自定义事件，通知其他组件
    window.dispatchEvent(new CustomEvent('configUpdate', { detail: newConfig }));
  };

  // 重置为默认配置
  const resetConfig = () => {
    setConfig(defaultConfig);
    storageSetJSON(CONFIG_STORAGE_KEY, defaultConfig);
    // 触发自定义事件，通知其他组件
    window.dispatchEvent(new CustomEvent('configUpdate', { detail: defaultConfig }));
  };

  // 导出配置为 JSON 文件
  const exportConfig = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `home-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 导入配置从 JSON 文件
  const importConfig = (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          saveConfig(imported);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  return {
    config,
    saveConfig,
    resetConfig,
    exportConfig,
    importConfig,
    defaultConfig
  };
}
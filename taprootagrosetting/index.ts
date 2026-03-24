/**
 * TaprootAgro 配置聚合器
 *
 * 从各个 JSON 文件读取默认配置，组装成完整的 HomePageConfig。
 * 骨架代码更新时只需复制整个 /taprootagrosetting/ 文件夹即可保留所有配置。
 *
 * 运行时优先级：JSON 默认值 (最低) → localStorage 用户编辑 (最高)
 * ConfigProvider 的 deepMerge 负责合并两层。
 */

import type { HomePageConfig } from '../src/app/hooks/useHomeConfig';

// --- 导入各模块 JSON ---
import appJson from './app.json';
import homeJson from './home.json';
import marketJson from './market.json';
import chatJson from './chat.json';
import legalJson from './legal.json';
import aiJson from './ai.json';
import pushJson from './push.json';
import authJson from './auth.json';
import liveJson from './live.json';
import backendJson from './backend.json';

/**
 * 完整的出厂默认配置
 * ConfigManagerPage 的"重置"按钮会还原到这组值
 */
export const defaultConfig: HomePageConfig = {
  // --- home.json ---
  banners: homeJson.banners,
  navigation: homeJson.navigation,
  liveStreams: homeJson.liveStreams,
  articles: homeJson.articles,
  videoFeed: homeJson.videoFeed,
  homeIcons: homeJson.homeIcons,

  // --- market.json ---
  currencySymbol: marketJson.currencySymbol,
  marketPage: marketJson.marketPage,

  // --- app.json ---
  appBranding: appJson.appBranding,
  desktopIcon: appJson.desktopIcon,
  filing: appJson.filing,

  // --- chat.json ---
  chatContact: chatJson.chatContact as HomePageConfig['chatContact'],
  userProfile: chatJson.userProfile,

  // --- legal.json ---
  aboutUs: legalJson.aboutUs,
  privacyPolicy: legalJson.privacyPolicy,
  termsOfService: legalJson.termsOfService,

  // --- ai.json ---
  aiModelConfig: aiJson.aiModelConfig,
  cloudAIConfig: aiJson.cloudAIConfig,

  // --- push.json ---
  pushConfig: pushJson.pushConfig,
  pushProvidersConfig: pushJson.pushProvidersConfig as HomePageConfig['pushProvidersConfig'],

  // --- auth.json ---
  loginConfig: authJson.loginConfig as HomePageConfig['loginConfig'],

  // --- live.json ---
  liveShareConfig: liveJson.liveShareConfig,
  liveNavigationConfig: liveJson.liveNavigationConfig as HomePageConfig['liveNavigationConfig'],

  // --- backend.json ---
  backendProxyConfig: backendJson.backendProxyConfig as HomePageConfig['backendProxyConfig'],
};

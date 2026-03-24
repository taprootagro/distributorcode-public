/**
 * ============================================================================
 * TaprootAgro 技术白皮书 — PWA 与 App 架构全解
 * ============================================================================
 *
 * 文档版本: 1.0.0
 * 创建日期: 2026-03-18
 * 文档分类: 客户交付技术白皮书
 * 目标读者: 工程团队、技术负责人、技术评估方
 *
 * ============================================================================
 * 目录
 * ============================================================================
 *
 *   1.  项目概述
 *   2.  整体架构图
 *   3.  技术栈清单
 *   4.  仓库结构
 *   5.  双模式运行时（PWA + 原生 App）
 *   6.  Capacitor Bridge — 27 个插件统一封装层
 *   7.  配置管理系统
 *   8.  远程内容管理（热更新）
 *   9.  认证系统
 *   10. 即时通讯（IM）架构
 *   11. 云端 AI 视觉分析
 *   12. 国际化（i18n）— 20 种语言
 *   13. 推送通知多服务商架构
 *   14. 韧性工程
 *   15. 性能优化
 *   16. 安全模型
 *   17. Supabase 后端 — Edge Functions 与数据库
 *   18. Android App 构建流水线
 *   18b. Service Worker — 远程配置更新地址
 *   19. 白标定制指南
 *   20. 部署检查清单
 *
 * ============================================================================
 */

// ============================================================================
// 1. 项目概述
// ============================================================================
/**
 * TaprootAgro 是一款面向发展中国家农民的生产级渐进式 Web 应用（PWA）。
 * 一套源码，两种运行模式：
 *
 *   - PWA 模式：通过浏览器访问（可安装到桌面）
 *   - 原生 App 模式：将 PWA 源码通过 Capacitor 打包进 Android APK
 *
 * 核心设计原则：
 *   - 离线优先：无网络也可正常使用
 *   - 低端设备友好：为 1-2 GB 内存 Android 设备优化
 *   - 多语言支持：20 种语言，含 RTL（阿拉伯语、乌尔都语、波斯语）
 *   - 白标就绪：所有 UI 元素、文字、素材均可配置
 *   - 零停机更新：远程配置热更新，无需重新构建 App
 *   - 后端可选：未连接后端时提供完整演示模式
 */

// ============================================================================
// 2. 整体架构图
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        客户端（一套源码）                               │
 * │                                                                        │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
 * │  │   首页        │  │   商城页      │  │   社区页      │  │  我的页   │  │
 * │  │  (轮播图、    │  │  (商品、      │  │  (IM 聊天、  │  │  (二维码、│  │
 * │  │   文章、      │  │   分类、      │  │   语音消息)  │  │   设置)   │  │
 * │  │   直播)       │  │   广告)       │  │              │  │           │  │
 * │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
 * │         │                  │                  │                │        │
 * │  ┌──────┴──────────────────┴──────────────────┴────────────────┴─────┐  │
 * │  │                  ConfigProvider（全局单例）                         │  │
 * │  │       deepMerge( 代码默认值, 远程配置, localStorage本地覆盖 )      │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │  ┌──────────────────────────┴────────────────────────────────────────┐  │
 * │  │                       服务层                                       │  │
 * │  │  ConfigSyncService │ ChatProxyService │ CloudAIService │ Auth     │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │  ┌──────────────────────────┴────────────────────────────────────────┐  │
 * │  │                       工具层                                       │  │
 * │  │  apiClient │ safeStorage │ capacitor-bridge │ errorMonitor │ db   │  │
 * │  └──────────────────────────┬────────────────────────────────────────┘  │
 * │                             │                                          │
 * │         ┌───────────────────┼──────────────────┐                       │
 * │         ▼                   ▼                  ▼                       │
 * │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐                │
 * │  │  浏览器 API  │  │  Capacitor   │  │  localStorage  │                │
 * │  │  (Web 降级)  │  │  原生插件     │  │  + IndexedDB   │                │
 * │  └─────────────┘  └──────────────┘  └────────────────┘                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                       SUPABASE 后端                                    │
 * │                                                                        │
 * │  Edge Functions:                    数据库:                            │
 * │  ┌─────────────────┐               ┌─────────────────┐                │
 * │  │ /server          │               │ app_config      │                │
 * │  │  /health         │               │ (单行 JSONB     │                │
 * │  │  /config (读/写) │               │  全量配置)       │                │
 * │  │  /send-code      │               ├─────────────────┤                │
 * │  │  /auth           │               │ config_history  │                │
 * │  │  /oauth-exchange │               │ (自动快照)       │                │
 * │  │  /profile (读/写)│               ├─────────────────┤                │
 * │  │  /config/history │               │ user_profiles   │                │
 * │  │  /config/rollback│               │ (用户资料)       │                │
 * │  ├─────────────────┤               └─────────────────┘                │
 * │  │ /chat-token      │                                                  │
 * │  │  /token          │               触发器:                            │
 * │  │  /health         │               - 自动版本号递增                    │
 * │  ├─────────────────┤               - 自动更新时间戳                    │
 * │  │ /ai-vision-proxy │               - 自动历史快照                      │
 * │  │  / (POST)        │                                                  │
 * │  │  /health         │               RLS: 所有表锁定为                   │
 * │  └─────────────────┘               service_role（前端无法直接访问）    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
// 3. 技术栈清单
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  层级              │ 技术                  │ 版本                       │
 * ├─────────────────────┼──────────────────────┼────────────────────────────┤
 * │  UI 框架           │ React                │ 18.3.1                     │
 * │  构建工具          │ Vite                 │ 6.3.5                      │
 * │  CSS 框架          │ Tailwind CSS         │ 4.1.12                     │
 * │  路由              │ React Router         │ 7.13.0（Data 模式）        │
 * │  基础组件          │ Radix UI + shadcn/ui │ 最新版                     │
 * │  动画库            │ Motion (Framer)      │ 12.34.3                    │
 * │  图表库            │ Recharts             │ 3.8.0                      │
 * │  图标库            │ Lucide React         │ 0.487.0                    │
 * │  二维码            │ qrcode.react         │ 4.2.0                      │
 * │  虚拟滚动          │ react-virtuoso       │ 4.18.3                     │
 * │  表单              │ react-hook-form      │ 7.55.0                     │
 * │  本地存储          │ idb (IndexedDB)      │ 8.0.3                      │
 * │  后端平台          │ Supabase             │ 2.99.1                     │
 * │  开发语言          │ TypeScript           │ 5.9.3                      │
 * │  原生桥接          │ Capacitor            │ 6.x（通过 bridge 封装）     │
 * │  IM SDK            │ @tencentcloud/chat   │ 动态导入（ESM CDN）         │
 * │  IM SDK（备选）    │ CometChat SDK        │ 动态导入（ESM CDN）         │
 * │  Edge 运行时       │ Deno (Supabase)      │ 最新版                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 重要说明：PWA 仓库中不安装任何 Capacitor npm 包。
 * Bridge 层通过 window.__CAP_PLUGINS__ 全局注册表读取插件，
 * 该注册表仅在原生 App 构建时由 taprootagro-builder 仓库填充。
 */

// ============================================================================
// 4. 仓库结构
// ============================================================================
/**
 * 双仓库架构：
 *
 *   仓库 1: PWA 源码（本仓库）
 *   ├── src/
 *   │   ├── app/
 *   │   │   ├── App.tsx                    ← 入口文件（RouterProvider）
 *   │   │   ├── routes.tsx                 ← React Router Data 模式路由配置
 *   │   │   ├── constants.ts               ← 共享常量
 *   │   │   ├── components/                ← 40+ 页面/功能组件
 *   │   │   │   ├── Root.tsx               ← Provider 树根节点
 *   │   │   │   ├── Layout.tsx             ← Tab 栏 + keep-alive 容器
 *   │   │   │   ├── HomePage.tsx           ← 轮播图、文章、直播
 *   │   │   │   ├── MarketPage.tsx         ← 商品、分类
 *   │   │   │   ├── CommunityPage.tsx      ← IM 聊天界面
 *   │   │   │   ├── ProfilePage.tsx        ← 个人资料、二维码名片
 *   │   │   │   ├── LoginPage.tsx          ← OTP + OAuth 登录
 *   │   │   │   ├── OAuthCallback.tsx      ← OAuth 回调处理器
 *   │   │   │   ├── ConfigManagerPage.tsx  ← 管理员配置编辑器
 *   │   │   │   ├── AIAssistantPage.tsx    ← AI 农作物诊断
 *   │   │   │   ├── community/             ← 聊天子组件
 *   │   │   │   ├── ui/                    ← 47 个 shadcn/ui 基础组件
 *   │   │   │   └── figma/                 ← Figma 生成的组件
 *   │   │   ├── hooks/                     ← 14 个自定义 Hook
 *   │   │   │   ├── ConfigProvider.tsx     ← 全局配置单例 Context
 *   │   │   │   ├── useLanguage.tsx        ← 多语言 Provider + Hook
 *   │   │   │   ├── useHomeConfig.tsx      ← 配置类型定义 + 默认值
 *   │   │   │   └── useRemoteConfig.ts     ← 功能开关 + 灰度发布
 *   │   │   ├── services/                  ← 6 个服务模块
 *   │   │   │   ├── ConfigSyncService.ts   ← 远程配置拉取/推送
 *   │   │   │   ├── ChatProxyService.ts    ← IM 聊天抽象层
 *   │   │   │   ├── IMProviderDirectAdapter.ts ← SDK 直连 IM
 *   │   │   │   ├── IMAdapter.ts           ← IM 适配器接口
 *   │   │   │   ├── ChatUserService.ts     ← IM 用户注册服务
 *   │   │   │   └── CloudAIService.ts      ← 云端视觉 AI 代理
 *   │   │   ├── utils/                     ← 18 个工具模块
 *   │   │   │   ├── capacitor-bridge.ts    ← 27 插件封装层（1598 行）
 *   │   │   │   ├── auth.ts               ← 登录状态 + ID 管理
 *   │   │   │   ├── apiClient.ts          ← 统一 API 客户端
 *   │   │   │   ├── apiVersion.ts         ← API 版本协商
 *   │   │   │   ├── safeStorage.ts        ← localStorage 安全封装
 *   │   │   │   ├── db.ts                 ← IndexedDB + 降级链
 *   │   │   │   ├── deepMerge.ts          ← 递归深度配置合并
 *   │   │   │   ├── errorMonitor.ts       ← 错误捕获 + 上报
 *   │   │   │   ├── silentRecovery.ts     ← 崩溃恢复 + 僵尸检测
 *   │   │   │   ├── abTest.ts            ← A/B 测试框架
 *   │   │   │   ├── rollout.ts           ← 灰度发布系统
 *   │   │   │   ├── cloudAIGuard.ts      ← AI 防滥用保护层
 *   │   │   │   ├── coordTransform.ts    ← GPS 坐标系转换
 *   │   │   │   ├── wxJsSdk.ts           ← 微信 JS-SDK 集成
 *   │   │   │   └── ...
 *   │   │   └── i18n/                     ← 20 种语言文件
 *   │   │       └── lang/                 ← ar bn en es fa fr hi id ja ms my pt ru th tl tr ur vi zh zh-TW
 *   │   └── styles/                       ← Tailwind v4 主题
 *   ├── taprootagrosetting/               ← 品牌配置 JSON 文件（10 个模块）
 *   │   ├── index.ts                      ← 配置聚合器
 *   │   ├── app.json                      ← 品牌、图标、备案
 *   │   ├── home.json                     ← 轮播、导航、文章
 *   │   ├── market.json                   ← 商品、分类
 *   │   ├── chat.json                     ← IM 联系人配置
 *   │   ├── auth.json                     ← 登录方式配置
 *   │   ├── backend.json                  ← Supabase 连接配置
 *   │   ├── ai.json                       ← AI 模型配置
 *   │   ├── push.json                     ← 推送通知配置
 *   │   ├── live.json                     ← 直播流配置
 *   │   └── legal.json                    ← 关于我们、隐私、条款
 *   ├── supabase/
 *   │   ├── migrations/001_init.sql       ← 一键建库脚本（772 行）
 *   │   └── functions/
 *   │       ├── server/index.tsx          ← 主 Edge Function（581 行）
 *   │       ├── chat-token/index.tsx      ← IM Token 生成器（332 行）
 *   │       └── ai-vision-proxy/index.tsx ← AI 视觉代理（668 行）
 *   └── developer/                        ← 技术文档
 *
 *   仓库 2: taprootagro-builder（独立仓库）
 *   ├── .github/workflows/build-android.yml
 *   ├── capacitor.config.ts
 *   ├── capacitor-loader.ts               ← 自动生成的插件注册表
 *   └── android/                          ← Capacitor Android 工程
 */

// ============================================================================
// 5. 双模式运行时（PWA + 原生 App）
// ============================================================================
/**
 * 同一份源码在两种环境下运行，无需 #ifdef 或条件编译。
 * 运行模式由平台检测自动确定。
 *
 * ┌──────────────────────┬──────────────────────┬────────────────────────────┐
 * │                      │ PWA 模式             │ 原生 App 模式              │
 * ├──────────────────────┼──────────────────────┼────────────────────────────┤
 * │ 分发方式             │ 浏览器 / PWA 安装    │ APK 侧载 / 应用商店       │
 * │ Capacitor 已安装?    │ 否                   │ 是（在 builder 仓库中）    │
 * │ __CAP_PLUGINS__      │ undefined            │ 由 loader.ts 填充          │
 * │ bridge.isNative()    │ false                │ true                       │
 * │ 相机                 │ <input type="file">  │ @capacitor/camera          │
 * │ GPS                  │ navigator.geolocation│ @capacitor/geolocation     │
 * │ 推送                 │ Web Push / FCM       │ @capacitor/push-notif.     │
 * │ 存储                 │ localStorage         │ @capacitor/preferences     │
 * │ 更新机制             │ Service Worker       │ WebView 加载线上 PWA       │
 * │ 包体积影响           │ 0 KB（无 Cap 代码）  │ 所有插件打入包中           │
 * └──────────────────────┴──────────────────────┴────────────────────────────┘
 *
 * 工作原理：
 *
 *   1. PWA 仓库中零 Capacitor npm 依赖
 *   2. capacitor-bridge.ts 的 loadPlugin() 从以下位置读取插件：
 *      window.__CAP_PLUGINS__['@capacitor/camera']
 *   3. PWA 模式下：注册表不存在 → loadPlugin 返回 null → 走 Web 降级方案
 *   4. App 模式下：builder 仓库的 capacitor-loader.ts 执行：
 *      ```
 *      import { Camera } from '@capacitor/camera';
 *      window.__CAP_PLUGINS__ = {
 *        '@capacitor/camera': { Camera, CameraResultType, CameraSource },
 *        ...
 *      };
 *      ```
 *   5. Bridge 从注册表读取插件实例 → 调用原生 API
 */

// ============================================================================
// 6. Capacitor Bridge — 27 个插件统一封装层
// ============================================================================
/**
 * 文件: /src/app/utils/capacitor-bridge.ts（1598 行）
 *
 * 每个原生能力都包含自动的 Web 降级方案。
 * 导入方式: `import { bridge } from './utils/capacitor-bridge'`
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  第一档：核心功能（8 个插件）                                               │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.camera     │ @capacitor/camera        │ 拍照 / 相册选图            │
 * │ bridge.geo        │ @capacitor/geolocation   │ GPS 定位 + 实时监听        │
 * │ bridge.pushNotif. │ @capacitor/push-notif.   │ 远程推送注册               │
 * │ bridge.filesystem │ @capacitor/filesystem    │ 文件读写删除               │
 * │ bridge.network    │ @capacitor/network       │ 网络状态 + 变化监听        │
 * │ bridge.device     │ @capacitor/device        │ 设备信息 + 唯一 ID         │
 * │ bridge.preferences│ @capacitor/preferences   │ 持久化键值存储             │
 * │ bridge.app        │ @capacitor/app           │ 生命周期 + 返回键          │
 * ├────────────────────────────────────────────────────────────────────────────┤
 * │  第二档：体验提升（9 个插件）                                               │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.keyboard   │ @capacitor/keyboard      │ 隐藏键盘、监听事件         │
 * │ bridge.statusBar  │ @capacitor/status-bar    │ 状态栏样式/颜色/显隐       │
 * │ bridge.splashScr. │ @capacitor/splash-screen │ 启动屏显隐                 │
 * │ bridge.haptics    │ @capacitor/haptics       │ 震动反馈                   │
 * │ bridge.localNotif.│ @cap/local-notifications │ 定时本地提醒               │
 * │ bridge.share      │ @capacitor/share         │ 系统分享面板               │
 * │ bridge.clipboard  │ @capacitor/clipboard     │ 复制/粘贴                  │
 * │ bridge.dialog     │ @capacitor/dialog        │ 原生弹窗/确认框            │
 * │ bridge.toast      │ @capacitor/toast         │ 原生 Toast 提示            │
 * ├────────────────────────────────────────────────────────────────────────────┤
 * │  第三档：增强功能（10 个插件）                                              │
 * ├───────────────────┬──────────────────────────┬────────────────────────────┤
 * │ bridge.barcodeSc. │ @cap-community/barcode   │ 二维码/条形码扫描          │
 * │ bridge.speechRec. │ @cap-community/speech    │ 语音转文字（服务文盲用户） │
 * │ bridge.tts        │ @cap-community/tts       │ 文字转语音（朗读功能）     │
 * │ bridge.nativeAud. │ @cap-community/audio     │ 原生音频播放               │
 * │ bridge.screenOr.  │ @cap/screen-orientation  │ 锁定屏幕方向               │
 * │ bridge.browser    │ @capacitor/browser       │ 应用内浏览器               │
 * │ bridge.actionSh.  │ @capacitor/action-sheet  │ 底部操作菜单               │
 * │ bridge.keepAwake  │ @cap-community/keep-awake│ 保持屏幕常亮               │
 * │ bridge.fileOpener │ @cap-community/file-open │ 用原生应用打开文件         │
 * │ bridge.contacts   │ @cap-community/contacts  │ 读取手机通讯录             │
 * └───────────────────┴──────────────────────────┴────────────────────────────┘
 */

// ============================================================================
// 7. 配置管理系统
// ============================================================================
/**
 * 所有应用内容和行为由单一配置对象 HomePageConfig 驱动。
 * 这是白标系统的核心。
 *
 * 配置模块（10 个 JSON 文件，位于 /taprootagrosetting/）：
 *
 * ┌────────────────┬──────────────────────────────────────────────────────────┐
 * │ 文件           │ 控制内容                                                │
 * ├────────────────┼──────────────────────────────────────────────────────────┤
 * │ app.json       │ appBranding（Logo、名称、标语）、desktopIcon、filing    │
 * │ home.json      │ banners[]、navigation[]、liveStreams[]、articles[]、    │
 * │                │ videoFeed、homeIcons                                    │
 * │ market.json    │ currencySymbol、categories[]、products[]、ads[]         │
 * │ chat.json      │ chatContact（商家 IM 绑定）、userProfile                │
 * │ auth.json      │ loginConfig（OAuth 服务商、手机/邮箱开关）              │
 * │ backend.json   │ backendProxyConfig（Supabase URL、IM 服务商、模式）     │
 * │ ai.json        │ aiModelConfig（ONNX 本地模型）、cloudAIConfig           │
 * │ push.json      │ pushConfig、pushProvidersConfig（5 个推送服务商）       │
 * │ live.json      │ liveShareConfig（微信分享）、liveNavigationConfig       │
 * │ legal.json     │ aboutUs、privacyPolicy、termsOfService                 │
 * └────────────────┴──────────────────────────────────────────────────────────┘
 *
 * 配置合并优先级（从低到高）：
 *
 *   1. /taprootagrosetting/*.json    ← 代码默认值（构建时固化）
 *   2. Supabase app_config 表        ← 远程配置（热更新）
 *   3. localStorage（用户编辑）      ← 本地覆盖（ConfigManagerPage 编辑）
 *
 * ConfigProvider 使用 deepMerge() + MERGE_DEEP 策略递归合并三层配置。
 * 数组采用"替换"策略（远程覆盖本地）。
 *
 * Provider 树：
 *   Root.tsx → LanguageProvider → ConfigProvider → ErrorBoundary → 路由
 *
 * 所有组件通过以下方式访问配置：
 *   const { config, saveConfig } = useConfigContext();
 */

// ============================================================================
// 8. 远程内容管理（热更新）
// ============================================================================
/**
 * 两条路径实现不重新构建即可更新应用内容：
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 路径 A：Supabase 热更新（即时生效，无需重建）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   管理员在 Supabase Dashboard 编辑配置 → Table Editor → app_config
 *     ↓
 *   数据库触发器自动递增 version + 保存历史快照
 *     ↓
 *   用户打开 App（或从后台切回 → visibilitychange 事件）
 *     ↓
 *   ConfigProvider 调用 GET /server/config
 *     ↓
 *   对比远程版本号 vs 上次同步的版本号
 *     ↓
 *   如果远程 > 本地 → deepMerge(默认值, 远程配置) → 应用更新
 *
 *   触发器链（全自动）：
 *     trg_app_config_auto_version → version + 1, updated_at = now()
 *     trg_app_config_auto_history → 将旧配置 INSERT 到 config_history
 *
 *   回滚操作: SELECT rollback_config(3); ← 恢复到第 3 版
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 路径 B：代码默认值更新（需要 Vercel 重新部署）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   开发者编辑 /taprootagrosetting/*.json → git push → Vercel 自动构建
 *     ↓
 *   新默认值固化到包中 → 新用户获得更新后的配置
 *     ↓
 *   老用户：远程配置（路径 A）仍优先覆盖代码默认值
 *
 * 优先级：Supabase 远程配置 > 代码默认值（永远）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 管理员 SQL 快捷命令（在 Supabase SQL Editor 中运行）：
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   -- 查看所有配置区块概览：
 *   SELECT * FROM get_config_overview();
 *
 *   -- 读取文章列表：
 *   SELECT get_config_section('articles');
 *
 *   -- 更新商品列表：
 *   SELECT update_config_section('marketPage', '{...}'::jsonb);
 *
 *   -- 搜索关键词：
 *   SELECT * FROM search_config('小麦');
 *
 *   -- 查看版本历史：
 *   SELECT version, created_at, note FROM config_history ORDER BY version DESC;
 *
 *   -- 回滚到某版本：
 *   SELECT rollback_config(5);
 */

// ============================================================================
// 9. 认证系统
// ============================================================================
/**
 * 两层认证架构，优雅降级到演示模式：
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  第一层：生产模式（后端已启用）                                          │
 * │                                                                        │
 * │  OTP 验证码流程：                                                       │
 * │    用户输入手机/邮箱 → POST /server/send-code                          │
 * │      → Supabase Auth 发送短信/邮件验证码                               │
 * │    用户输入验证码 → POST /server/auth                                  │
 * │      → Supabase Auth verifyOtp → 返回 { userId, accessToken }         │
 * │      → 存储 JWT + UUID 到 localStorage                                │
 * │      → 拉取云端用户资料 → 跳转到 /home/profile                         │
 * │                                                                        │
 * │  OAuth 社交登录（7 个服务商）：                                         │
 * │    Google │ Facebook │ Apple │ 微信 │ 支付宝 │ Twitter │ LINE         │
 * │    点击图标 → 跳转到服务商授权页面                                      │
 * │      → 服务商回调到 /auth/callback?provider=xxx&code=yyy              │
 * │      → OAuthCallback 组件处理                                          │
 * │      → POST /server/oauth-exchange（授权码换取会话）                    │
 * │      → 存储 JWT + UUID → 跳转到 /home/profile                         │
 * │                                                                        │
 * │  CSRF 防护：sessionStorage 中的 state token 在回调时验证              │
 * │                                                                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  第二层：演示模式（无后端）                                              │
 * │                                                                        │
 * │  backendProxyConfig.enabled = false（或占位符 URL）                     │
 * │  → OTP：接受任何验证码，显示"(demo: 123456)"                           │
 * │  → OAuth：直接设为已登录，不发网络请求                                  │
 * │  → 本地生成 10 位数字 ID 作为用户身份标识                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 存储的凭证：
 *   agri_access_token     ← JWT（Authorization: Bearer xxx）
 *   agri_server_user_id   ← Supabase Auth 分配的 UUID
 *   agri_auth_source      ← "server" | "local"
 *   isLoggedIn             ← "true" / 删除
 *
 * 凭证消费方：
 *   - IM 聊天: getUserId() 作为 IM 身份 → POST /chat-token/token
 *   - API 请求: getAccessToken() → Authorization 请求头
 *   - 个人二维码: getUserId() 展示在二维码中
 *   - Dexie 备份: mirrorAuthToDexie() 加密 IndexedDB 副本
 */

// ============================================================================
// 10. 即时通讯（IM）架构
// ============================================================================
/**
 * 架构特点：不引入 TUIKit — 自定义 UI + SDK 直连。
 *
 * 消息流向：
 *   ┌──────────┐    WebSocket     ┌──────────────┐
 *   │ 前端      │ ◄──────────────► │ IM 服务商    │
 *   │ IM SDK   │                  │ 云端 (腾讯/CC)│
 *   └────┬─────┘                  └──────────────┘
 *        │
 *        │ 仅 Token 请求
 *        ▼
 *   ┌──────────────────┐    REST API    ┌──────────────┐
 *   │ Supabase Edge Fn │ ──────────────►│ IM Token API │
 *   │ /chat-token      │                │ (UserSig/JWT)│
 *   └──────────────────┘                └──────────────┘
 *
 * 组件调用链：
 *   CommunityPage
 *     → useVoiceRecorder（音频录制）
 *     → ChatProxyService（模式路由器）
 *       → IMProviderDirectAdapter（SDK 管理器）
 *         → 动态导入: @tencentcloud/chat（从 esm.sh CDN）
 *         或
 *         → 动态导入: @cometchat/chat-sdk-javascript
 *
 * 支持的服务商：
 *   1. 腾讯 IM: UserSig token（HMAC-SHA256），SDK ~90KB gzipped
 *   2. CometChat: Auth token（REST API 获取），SDK ~60KB gzipped
 *
 * SDK 加载策略：
 *   运行时从 ESM CDN (esm.sh) 动态导入。仅加载已选服务商的 SDK。
 *   PWA 包体积 = 0 KB IM 代码。
 *
 * Token 获取流程：
 *   前端 → POST /chat-token/token { uid, provider: "tencent-im" }
 *   Edge Fn 从 Supabase Secrets 读取 TENCENT_IM_SECRET_KEY
 *   生成 UserSig（HMAC-SHA256 + zlib 压缩 + base64url 编码）→ 返回 token
 *   前端 SDK.login(token) → WebSocket 连接建立
 *
 * 消息类型：文本、图片（base64 上传）、语音（音频 blob）
 * 功能特性：实时送达、已读回执、正在输入指示器、历史消息
 *
 * Mock 模式：未配置 IM 服务商时，ChatProxyService 本地模拟响应，
 * 生成逼真的自动回复消息。
 */

// ============================================================================
// 11. 云端 AI 视觉分析
// ============================================================================
/**
 * 文件: /src/app/services/CloudAIService.ts
 * Edge Function: /supabase/functions/ai-vision-proxy/index.tsx
 *
 * 三家供应商支持，后端透明切换：
 *
 * ┌───────────────┬─────────────────────────┬──────────────────────────────┐
 * │ 供应商        │ API 端点                │ 默认模型                     │
 * ├───────────────┼─────────────────────────┼──────────────────────────────┤
 * │ 通义千问       │ DashScope 兼容模式      │ qwen-vl-plus                │
 * │ Gemini        │ googleapis.com/v1beta   │ gemini-2.0-flash            │
 * │ OpenAI        │ api.openai.com/v1       │ gpt-4o                      │
 * └───────────────┴─────────────────────────┴──────────────────────────────┘
 *
 * 请求类型：
 *   1. 图片分析：农作物病虫害识别
 *   2. 文字追问：对话延续
 *   3. 语音追问：音频 → AI 回复（Gemini/OpenAI 原生音频支持）
 *
 * 前端防滥用保护（cloudAIGuard.ts）：
 *   - 上传前图片压缩
 *   - 10 秒请求冷却时间
 *   - 每日使用配额（localStorage 追踪）
 *   - 图片哈希去重（跳过重复图片）
 *
 * 配置: cloudAIConfig.enabled + AI_PROVIDER / AI_API_KEY（Supabase Secrets）
 */

// ============================================================================
// 12. 国际化（i18n）— 20 种语言
// ============================================================================
/**
 * 文件: /src/app/hooks/useLanguage.tsx + /src/app/i18n/lang/
 *
 * 支持语言：
 *   en, zh, zh-TW, es, fr, ar*, pt, hi, ru, bn, ur*, id, vi, ms, ja, th, my, tl, tr, fa*
 *   (* = RTL 从右到左语言：阿拉伯语、乌尔都语、波斯语)
 *
 * 架构：
 *   - LanguageProvider 包裹整个应用（在 Root.tsx 中）
 *   - 语言检测：localStorage → navigator.language → 默认 'en'
 *   - 每种语言文件导出完整的 Translations 对象（约 200 个键值）
 *   - RTL 支持：`dir` 属性 + isRTL 标志用于布局镜像
 *   - 按需加载：非默认语言动态加载
 *
 * 使用方式: const { t, language, setLanguage, isRTL } = useLanguage();
 */

// ============================================================================
// 13. 推送通知多服务商架构
// ============================================================================
/**
 * 支持 5 个推送服务商，通过 pushProvidersConfig 配置：
 *
 * ┌──────────────┬────────────────────┬────────────────────────────────────┐
 * │ 服务商       │ 适用场景           │ 配置项                             │
 * ├──────────────┼────────────────────┼────────────────────────────────────┤
 * │ Web Push     │ PWA 浏览器         │ vapidPublicKey, pushApiBase        │
 * │ FCM          │ Android / Chrome   │ apiKey, projectId, vapidKey        │
 * │ OneSignal    │ 多平台             │ appId, safariWebId                 │
 * │ 极光推送     │ 中国 Android       │ appKey, channel, pushApiBase       │
 * │ 个推         │ 中国 Android       │ appId, appKey, pushApiBase         │
 * └──────────────┴────────────────────┴────────────────────────────────────┘
 *
 * 原生模式下，bridge.pushNotifications 使用 @capacitor/push-notifications
 * 进行设备级推送注册（Android 上获取 FCM token，iOS 上获取 APNs token）。
 *
 * 本地通知（浇水提醒、施肥提醒等）使用 bridge.localNotifications + 定时器。
 */

// ============================================================================
// 14. 韧性工程
// ============================================================================
/**
 * 专为低端 Android 设备 + 不稳定 2G/3G 网络设计。
 *
 * 第一层：安全存储（safeStorage.ts）
 *   - 所有 localStorage 操作均包裹 try/catch
 *   - 失败计数器 + 降级检测
 *   - 存储不稳定时通知监听器
 *
 * 第二层：静默恢复（silentRecovery.ts）
 *   - 全局错误处理器拦截未捕获的 JS 错误
 *   - 非致命错误静默吞掉（农民永远看不到崩溃）
 *   - 致命错误 → 受控 reload（30 秒内最多 reload 2 次）
 *   - visibilitychange 时检测僵尸页面
 *
 * 第三层：错误监控（errorMonitor.ts）
 *   - 捕获类型：JS 错误、未处理 Promise 拒绝、React 边界错误、网络错误
 *   - 本地存储最多 50 条（FIFO，7 天自动清理）
 *   - 设备 ID 追踪、API 版本关联、A/B 测试分组标记
 *   - 可选远程上报（Beacon API）
 *
 * 第四层：数据库降级（db.ts）
 *   - 主存储：IndexedDB（Dexie 加密备份）
 *   - 降级方案：localStorage（通过 safeStorage）
 *   - 最终方案：内存存储（应用可用但关闭后数据丢失）
 *   - 自动降级链 + 监控上报
 *
 * 第五层：统一 API 客户端（apiClient.ts）
 *   - 版本协商：v3 → v2 → v1 降级链
 *   - 指数退避重试（可配置最大重试次数）
 *   - 离线缓存（IndexedDB）+ TTL 过期机制
 *   - 网络质量感知（2G/3G → 延长超时时间）
 *   - 请求去重防止重复调用
 *
 * 第六层：A/B 测试 + 灰度发布（abTest.ts + rollout.ts）
 *   - 基于稳定设备 ID 哈希的分组分配
 *   - 按百分比灰度的功能开关
 *   - 自动异常检测 → 回滚
 *   - 远程配置驱动（无需重新构建）
 */

// ============================================================================
// 15. 性能优化
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  优化项              │ 实现方式                                        │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  代码分割            │ React.lazy() 用于路由（设置、登录、              │
 * │                      │ 配置管理器、OAuth）。主 Tab 页 keep-alive。      │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  Tab Keep-Alive      │ Layout.tsx 同时渲染 4 个 Tab 页面，              │
 * │                      │ 通过 display:none 切换。不卸载/重载，            │
 * │                      │ 跨 Tab 切换时状态完整保留。                      │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  空闲时预加载        │ requestIdleCallback 在首屏渲染完成后             │
 * │                      │ 预加载商城、社区、我的页面。                      │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  图片懒加载          │ LazyImage 组件 + IntersectionObserver            │
 * │                      │ + 模糊占位图渐入效果。                           │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  虚拟滚动            │ react-virtuoso 用于长列表（文章、               │
 * │                      │ 商品、聊天消息）。                               │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  配置单例            │ ConfigProvider 在 Root 层 → 单次解析，           │
 * │                      │ 一个事件监听器（而非每个 Tab 4 份）。            │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  智能启动屏          │ 最短 2 秒品牌曝光 + Banner 预加载完成。          │
 * │                      │ 缓存用户重访 → 2 秒后瞬间过渡。                 │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  IM SDK 动态加载     │ 服务商 SDK 运行时从 ESM CDN 加载。               │
 * │                      │ PWA 包体积 = 0 KB IM 代码。                     │
 * ├────────────────────────┼───────────────────────────────────────────────┤
 * │  手势防误触          │ Layout.tsx 拦截屏幕边缘滑动手势                  │
 * │                      │ 防止浏览器意外前进/后退。                        │
 * └────────────────────────┴───────────────────────────────────────────────┘
 */

// ============================================================================
// 16. 安全模型
// ============================================================================
/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  原则                          │ 实现方式                              │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  前端不存放 API 密钥          │ 所有密钥存于 Supabase Edge Function   │
 * │                               │ Secrets（环境变量）                   │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  数据库隔离                   │ 所有表 RLS 锁定为 service_role。      │
 * │                               │ anonKey 无法直接读写任何表。          │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  JWT 认证                     │ Supabase Auth 签发 JWT。              │
 * │                               │ Edge Fn 通过 auth.getUser(token)      │
 * │                               │ 验证用户身份。                        │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  OAuth CSRF 防护              │ sessionStorage 中的随机 state token， │
 * │                               │ 回调时校验一致性。                    │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  乐观锁                       │ 配置写入时校验 expectedVersion →     │
 * │                               │ 版本不匹配返回 409 Conflict。         │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  IM Token 隔离                │ 前端永远看不到 IM 密钥。              │
 * │                               │ Token 在服务端生成，有效期有限        │
 * │                               │ （腾讯 IM 为 7 天）。                 │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  认证数据备份                 │ mirrorAuthToDexie() 创建加密的        │
 * │                               │ IndexedDB 凭证副本。                  │
 * ├───────────────────────────────┼────────────────────────────────────────┤
 * │  域名白名单                   │ chatContact.verifiedDomains[]         │
 * │                               │ 校验扫码绑定来源域名。               │
 * └───────────────────────────────┴────────────────────────────────────────┘
 */

// ============================================================================
// 17. Supabase 后端 — Edge Functions 与数据库
// ============================================================================
/**
 * 一键部署流程：
 *   1. SQL Editor → 粘贴 001_init.sql → 点击 Run
 *   2. supabase functions deploy server
 *   3. supabase functions deploy chat-token
 *   4. supabase functions deploy ai-vision-proxy
 *   5. 在 Dashboard 设置 Secrets：
 *
 * ┌────────────────────────────┬───────────────────────────────────────────┐
 * │  Secret 名称               │ 用途                                      │
 * ├────────────────────────────┼───────────────────────────────────────────┤
 * │  (自动) SUPABASE_URL      │ 所有 Edge Functions                       │
 * │  (自动) SUPABASE_ANON_KEY │ 所有 Edge Functions                       │
 * │  (自动) SERVICE_ROLE_KEY  │ 所有 Edge Functions                       │
 * │  TENCENT_IM_APP_ID        │ 腾讯 IM Token 生成                        │
 * │  TENCENT_IM_SECRET_KEY    │ 腾讯 IM UserSig HMAC 签名                │
 * │  COMETCHAT_APP_ID         │ CometChat Token 生成                      │
 * │  COMETCHAT_AUTH_KEY       │ CometChat REST API 认证                   │
 * │  COMETCHAT_REGION         │ CometChat 区域 (us/eu/in)                 │
 * │  AI_PROVIDER              │ qwen | gemini | openai                    │
 * │  AI_API_KEY               │ 选定 AI 供应商的 API 密钥                 │
 * │  AI_BASE_URL              │ (可选) 自定义 API 代理地址                 │
 * │  AI_MODEL_ID              │ (可选) 模型覆盖标识                       │
 * └────────────────────────────┴───────────────────────────────────────────┘
 *
 * 自建 Edge Function 部署（方案 B/C）：
 *   使用 Supabase Docker（自建或 PolarDB）时，CLI 的 `supabase functions
 *   deploy` 命令不可用。需要把 3 个函数文件手动复制到 Docker 挂载目录：
 *
 *     # 在你的电脑上 — 把文件发到服务器：
 *     scp supabase/functions/server/index.tsx      root@服务器IP:~/server.tsx
 *     scp supabase/functions/chat-token/index.tsx   root@服务器IP:~/chat-token.tsx
 *     scp supabase/functions/ai-vision-proxy/index.tsx root@服务器IP:~/ai-vision-proxy.tsx
 *
 *     # 在服务器上 — 移动到 Docker 挂载目录：
 *     cd ~/supabase/docker
 *     mkdir -p volumes/functions/{server,chat-token,ai-vision-proxy}
 *     mv ~/server.tsx          volumes/functions/server/index.tsx
 *     mv ~/chat-token.tsx      volumes/functions/chat-token/index.tsx
 *     mv ~/ai-vision-proxy.tsx volumes/functions/ai-vision-proxy/index.tsx
 *     docker compose restart functions
 *
 *   不需要把整个 PWA 仓库 clone 到服务器 — 只需要 3 个文件。
 *
 * 数据库架构：
 *
 *   app_config（单行，id='main'）
 *     config JSONB       ← 整个应用配置
 *     version INTEGER    ← 触发器自动递增
 *     updated_at TIMESTAMPTZ ← 触发器自动更新
 *     updated_by TEXT
 *
 *   config_history（触发器自动填充）
 *     config JSONB       ← 旧版本快照
 *     version INTEGER
 *     created_at, created_by, note
 *
 *   user_profiles
 *     user_id UUID（外键 → auth.users）
 *     profile JSONB（name, avatar, phone, email, provider）
 *     updated_at TIMESTAMPTZ
 *
 * 5 个辅助函数（供 SQL Editor 使用）：
 *   update_config_section(key, value)  ← 更新某个配置区块
 *   get_config_section(key)            ← 读取某个配置区块
 *   rollback_config(version)           ← 回滚到历史版本
 *   get_config_overview()              ← 查看配置概览
 *   search_config(keyword)             ← 全文搜索配置
 */

// ============================================================================
// 18. Android App 构建流水线
// ============================================================================
/**
 * Builder 仓库: taprootagro-builder（与 PWA 源码分离）
 *
 * 构建触发: GitHub Actions workflow_dispatch（手动点击）
 *
 * 输入参数：
 *   - PWA URL（例如 https://your-brand.vercel.app）
 *   - 应用名称、包名
 *   - 签名密钥库（Base64 编码存储在 GitHub Secrets）
 *
 * 构建流程：
 *   1. 检出 builder 仓库
 *   2. 安装 Capacitor + 所有插件
 *   3. 生成 capacitor-loader.ts（将插件注册到 __CAP_PLUGINS__）
 *   4. 配置 capacitor.config.ts（填入 PWA URL）
 *   5. npx cap sync android
 *   6. Gradle 构建 APK/AAB
 *   7. 使用发布密钥签名
 *   8. 上传构建产物
 *
 * 生成的 APK 在 WebView 中加载线上 PWA。内容更新即时生效
 * （无需重新构建 App）。仅以下情况需要重新构建：
 *   - 更改应用名称、包名或图标
 *   - 添加新的 Capacitor 插件
 *   - 升级 Capacitor 版本
 */

// ============================================================================
// 18b. Service Worker — 远程配置更新地址
// ============================================================================
/**
 * Service Worker 和 PWARegister 组件都会检查一个远程 JSON 端点，
 * 用于检测新版本和推送配置更新。
 *
 * 默认 URL（硬编码兜底地址）：
 *   https://www.taprootagro.com/taprootagro/globalpublic/customer.json
 *
 * 这是作者的服务器。提供此默认地址是为了让每个 Fork 版本
 * 开箱即用，零配置就能工作。
 *
 * 源码位置：
 *   /public/service-worker.js 第 25 行：
 *     const REMOTE_CONFIG_URL = self.__REMOTE_CONFIG_URL
 *       || 'https://www.taprootagro.com/taprootagro/globalpublic/customer.json';
 *
 *   /src/app/components/PWARegister.tsx 第 29 行：
 *     const REMOTE_CONFIG_URL = import.meta.env.VITE_REMOTE_CONFIG_URL
 *       || 'https://www.taprootagro.com/taprootagro/globalpublic/customer.json';
 *
 * 工作原理：
 *   1. 每天首次打开 App 时，SW 后台拉取该 JSON
 *   2. 对比远程 `version` 字段与本地 CACHE_VERSION
 *   3. 如果不一致 → 触发 SW 更新 → 用户看到「有新版本可用」提示
 *   4. JSON 还可以携带功能开关、紧急开关、公告等信息
 *
 * 如何换成自己的服务器：
 *   方式 A（环境变量 — 推荐）：
 *     在 .env 或托管平台环境变量中设置 VITE_REMOTE_CONFIG_URL。
 *     service-worker.js 也支持 self.__REMOTE_CONFIG_URL，
 *     可通过构建时注入脚本设置。
 *
 *   方式 B（直接修改代码）：
 *     替换上述两个文件中的兜底 URL。
 *
 * JSON 格式要求：
 *   {
 *     "version": "v11",           // 与 CACHE_VERSION 不同时触发更新
 *     "forceUpdate": false,       // 为 true 时跳过用户确认直接更新
 *     "killSwitch": false,        // 紧急情况：显示维护页面
 *     "announcement": null,       // 可选的公告横幅消息
 *     "rollout": { ... }          // 功能开关灰度百分比
 *   }
 *
 * 注意：如果贵司有能力维护自己的更新服务器，建议替换为自己的端点。
 * 默认指向 taprootagro.com 的地址只是为了方便 — 不是强依赖。
 */

// ============================================================================
// 19. 白标定制指南
// ============================================================================
/**
 * 创建新的白标实例：
 *
 * 第 1 步：品牌配置（5 分钟）
 *   编辑 /taprootagrosetting/app.json：
 *     - appBranding.logoUrl     ← 你的 Logo URL
 *     - appBranding.appName     ← 你的品牌名称
 *     - appBranding.slogan      ← 你的标语
 *     - desktopIcon.icon192Url  ← PWA 图标 192px
 *     - desktopIcon.icon512Url  ← PWA 图标 512px
 *
 * 第 2 步：内容填充（10 分钟）
 *   编辑 /taprootagrosetting/home.json：
 *     - banners[]               ← 首页轮播图 + 标题
 *     - articles[]              ← 知识库文章
 *     - liveStreams[]           ← 视频内容
 *   编辑 /taprootagrosetting/market.json：
 *     - categories[]            ← 商品分类
 *     - products[]              ← 商品目录
 *     - currencySymbol          ← "$"、"GH₵"、"KSh" 等
 *
 * 第 3 步：后端连接（15 分钟）
 *   编辑 /taprootagrosetting/backend.json：
 *     - supabaseUrl             ← 你的 Supabase 项目 URL
 *     - supabaseAnonKey         ← 你的 Anon Key
 *     - enabled: true
 *     - chatProvider            ← "tencent-im" 或 "cometchat"
 *
 * 第 4 步：部署
 *   git push → Vercel 自动部署 → PWA 上线
 *   运行 SQL 迁移脚本 → 部署 Edge Functions
 *   (可选) 通过 builder 仓库构建 Android APK
 *
 * 第 5 步：日常管理
 *   在 Supabase Dashboard 直接编辑 app_config 的 JSONB 内容。
 *   用户打开或切回 App 时自动拉取最新配置并生效。
 */

// ============================================================================
// 20. 部署检查清单
// ============================================================================
/**
 * ┌────┬──────────────────────────────────────────┬─────────────┬──────────┐
 * │ #  │ 任务                                     │ 操作位置     │ 预计时间 │
 * ├────┼──────────────────────────────────────────┼─────────────┼──────────┤
 * │  1 │ 创建 Supabase 项目                       │ supabase.com│ 2 分钟   │
 * │  2 │ 在 SQL Editor 中运行 001_init.sql        │ Dashboard   │ 1 分钟   │
 * │  3 │ 部署 Edge Functions（server、chat-token、│ CLI         │ 3 分钟   │
 * │    │ ai-vision-proxy）                        │             │          │
 * │  4 │ 设置 Supabase Secrets（IM 密钥、AI 密钥）│ Dashboard   │ 5 分钟   │
 * │  5 │ 编辑 /taprootagrosetting/ JSON 文件      │ 代码编辑器  │ 10 分钟  │
 * │  6 │ 启用 Supabase Auth 服务商（Google、      │ Dashboard   │ 5 分钟   │
 * │    │ 手机 OTP 等）                            │             │          │
 * │  7 │ 部署 PWA（git push → Vercel）            │ GitHub      │ 2 分钟   │
 * │  8 │ 测试：打开 PWA → 登录 → 聊天 → AI 扫描   │ 浏览器      │ 5 分钟   │
 * │  9 │ (可选) Fork builder 仓库 → 构建 APK      │ GitHub      │ 10 分钟  │
 * │ 10 │ (可选) 上传 APK 到 Google Play            │ Play Console│ 30 分钟  │
 * ├────┼──────────────────────────────────────────┼─────────────┼──────────┤
 * │    │ 合计                                     │             │ ~73 分钟 │
 * └────┴──────────────────────────────────────────┴─────────────┴──────────┘
 *
 * 部署后日常运维：
 *   - 所有内容变更：在 Supabase Dashboard 编辑 app_config（即时生效）
 *   - 无需改代码、无需重建、无需重新部署即可更新内容
 *   - 错误监控：errorMonitor 远程上报端点（可选）
 *   - A/B 测试新功能：远程配置灰度百分比
 */
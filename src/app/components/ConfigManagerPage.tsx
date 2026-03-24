import { useNavigate } from "react-router";
import React, { useState, useEffect } from "react";
import { useConfigContext } from "../hooks/ConfigProvider";
import { useLanguage } from "../hooks/useLanguage";
import { ArrowLeft, Plus, Trash2, Save, Edit3, RotateCcw, Lock, ChevronDown, ChevronRight, Shield, X, Menu, RefreshCw, Cloud, CloudOff, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { testConnection as supabaseTestConnection, isSupabaseConfigured } from "../services/ConfigSyncService";

export default function ConfigManagerPage() {
  const navigate = useNavigate();
  const { config, saveConfig, syncStatus, remoteVersion, lastSyncTime, lastSyncError, isRemoteConfigured, pullRemoteConfig } = useConfigContext();
  const { t, isChinese } = useLanguage();

  // 进入动画
  const [animPhase, setAnimPhase] = useState<'entering' | 'visible'>('entering');
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimPhase('visible'));
    return () => cancelAnimationFrame(raf);
  }, []);

  // 入口密码门禁状态（必须在所有 hooks 之前声明）
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState(false);

  const [activeTab, setActiveTab] = useState<"supabase" | "banners" | "live" | "articles" | "marketCategories" | "marketProducts" | "marketAd" | "filing" | "aboutUs" | "privacy" | "terms" | "appBranding" | "homeIcons" | "chatContact" | "userProfile" | "desktopIcon" | "aiModel" | "backendProxy" | "loginConfig" | "pushProviders">("banners");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  // 本地工作副本：所有编辑操作只修改此副本，不立即持久化
  const [workingConfig, setWorkingConfig] = useState(() => JSON.parse(JSON.stringify(config)));
  // Save 确认弹窗状态
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savePassword, setSavePassword] = useState("");
  const [saveError, setSaveError] = useState("");
  // OAuth credential expansion state
  const [expandedOAuthProvider, setExpandedOAuthProvider] = useState<string | null>(null);
  // Sidebar open state (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sidebar collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 双语辅助：中文环境显示中文，其他语言显示英文
  const ct = (zh: string, en: string) => isChinese ? zh : en;

  // 入口密码验证
  const handleGateSubmit = () => {
    if (gatePassword.toLowerCase() === "taprootagro") {
      setIsUnlocked(true);
      setGateError(false);
    } else {
      setGateError(true);
    }
  };

  // 未解锁时显示密码输入页面
  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col overflow-hidden" style={{ transform: animPhase === 'visible' ? 'none' : 'scale(0.96)', opacity: animPhase === 'visible' ? 1 : 0, transition: 'transform 200ms ease-out, opacity 200ms ease-out' }}>
        {/* 状态栏占位 — standalone 模式下用 safe-area-inset-top 撇开 */}
        <div className="bg-emerald-600 safe-top flex-shrink-0" />
        {/* 顶部导航栏 */}
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => navigate("/settings")} className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="font-semibold text-base sm:text-lg truncate">{ct("内容配置管理", "Content Config Manager")}</h1>
        </div>
        {/* 密码输入 */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-xs space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <input
                type="password"
                value={gatePassword}
                onChange={(e) => { setGatePassword(e.target.value); setGateError(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleGateSubmit()}
                autoFocus
                className={`w-full px-4 py-3 border-2 rounded-xl text-center tracking-widest focus:outline-none transition-colors ${
                  gateError
                    ? "border-red-400 bg-red-50 focus:border-red-500"
                    : "border-gray-200 bg-white focus:border-emerald-500"
                }`}
              />
              {gateError && (
                <div className="mt-2 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                </div>
              )}
            </div>
            <button
              onClick={handleGateSubmit}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
            >
              {ct("进入", "Enter")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 处理返回：侧边栏打开时先关闭侧边栏，而不是离开页面
  const handleGoBack = () => {
    if (sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    if (hasChanges) {
      if (!confirm(ct("有未保存的更改，确定要离开吗？", "You have unsaved changes. Are you sure you want to leave?"))) {
        return;
      }
    }
    navigate("/settings");
  };

  // 显示保存确认弹窗
  const handleShowSaveDialog = () => {
    setSavePassword("");
    setSaveError("");
    setShowSaveDialog(true);
  };

  // 确认保存：需要输入 taprootagro
  const handleConfirmSave = () => {
    if (savePassword.toLowerCase() !== "taprootagro") {
      setSaveError(ct("验证码错误，请输入 taprootagro", "Incorrect code. Please enter taprootagro"));
      return;
    }
    saveConfig(workingConfig);
    setHasChanges(false);
    setShowSaveDialog(false);
    setSavePassword("");
    setSaveError("");
    alert(ct("配置保存成功！", "Config saved successfully!"));
  };

  // 添加新项
  const handleAddItem = (type: string) => {
    const newItem = createNewItem(type);
    setEditingItem(newItem);
  };

  // 创建新项模板
  const createNewItem = (type: string) => {
    const items = getItemsByType(type);
    const maxId = items.length > 0 ? Math.max(0, ...items.map((item: any) => item.id || 0)) : 0;
    switch (type) {
      case "banners":
        return { id: maxId + 1, url: "", alt: "", title: "", content: "" };
      case "live":
        return { id: maxId + 1, title: "", viewers: "0", thumbnail: "", videoUrl: "" };
      case "articles":
        return { id: maxId + 1, title: "", content: "", thumbnail: "" };
      case "marketCategories":
        return { id: (maxId + 1).toString(), name: "", subCategories: [] };
      case "marketProducts":
        return { id: maxId + 1, name: "", image: "", price: "", category: "", subCategory: "", description: "", stock: 0 };
      case "marketAd":
        return { id: maxId + 1, image: "", title: "", content: "" };
      case "filing":
        return { id: maxId + 1, icpNumber: "", icpUrl: "", policeNumber: "", policeUrl: "" };
      case "aboutUs":
        return { id: maxId + 1, content: "" };
      case "privacy":
        return { id: maxId + 1, content: "" };
      case "terms":
        return { id: maxId + 1, content: "" };
      case "appBranding":
        return { logoUrl: "", appName: "", slogan: "" };
      case "chatContact":
        return { name: "", avatar: "", subtitle: "", imUserId: "", channelId: "", imProvider: "tencent-im", phone: "", storeId: "", verifiedDomains: [] };
      case "userProfile":
        return { name: "", avatar: "" };
      case "desktopIcon":
        return { appName: "", icon192Url: "", icon512Url: "" };
      case "aiModel":
        return { id: maxId + 1, name: "", description: "", parameters: "" };
      default:
        return {};
    }
  };

  // 获取当前标签的数据
  const getItemsByType = (type: string) => {
    const wc = workingConfig;
    if (!wc || !wc.marketPage) {
      return [];
    }
    switch (type) {
      case "banners": return wc.banners || [];
      case "live": return wc.liveStreams || [];
      case "articles": return wc.articles || [];
      case "marketCategories": return wc.marketPage.categories || [];
      case "marketProducts": return wc.marketPage.products || [];
      case "marketAd":
        return wc.marketPage.advertisements || [];
      case "filing": return wc.filing ? [wc.filing] : [];
      case "aboutUs": return wc.aboutUs ? [wc.aboutUs] : [];
      case "privacy": return wc.privacyPolicy ? [wc.privacyPolicy] : [];
      case "terms": return wc.termsOfService ? [wc.termsOfService] : [];
      case "appBranding": return wc.appBranding ? [wc.appBranding] : [];
      case "chatContact": return wc.chatContact ? [wc.chatContact] : [];
      case "userProfile": return wc.userProfile ? [wc.userProfile] : [];
      case "desktopIcon": return wc.desktopIcon ? [wc.desktopIcon] : [];
      // aiModel tab 使用直接表单渲染（aiModelConfig + cloudAIConfig），不走卡片网格
      case "aiModel": return [];
      default: return [];
    }
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (!editingItem) return;

    // 深拷贝配置，避免直接修改原数组引用导致 React 检测不到变化
    const newConfig = JSON.parse(JSON.stringify(workingConfig)) as typeof config;
    const items = getItemsByType(activeTab);
    const existingIndex = items.findIndex((item: any) => item.id === editingItem.id);

    if (existingIndex >= 0) {
      // 更新现有项
      switch (activeTab) {
        case "banners":
          newConfig.banners[existingIndex] = editingItem;
          break;
        case "live":
          newConfig.liveStreams[existingIndex] = editingItem;
          break;
        case "articles":
          newConfig.articles[existingIndex] = editingItem;
          break;
        case "marketCategories":
          newConfig.marketPage.categories[existingIndex] = editingItem;
          break;
        case "marketProducts":
          newConfig.marketPage.products[existingIndex] = editingItem;
          break;
        case "marketAd":
          newConfig.marketPage.advertisements[existingIndex] = editingItem;
          break;
        case "filing":
          newConfig.filing = editingItem;
          break;
        case "aboutUs":
          newConfig.aboutUs = editingItem;
          break;
        case "privacy":
          newConfig.privacyPolicy = editingItem;
          break;
        case "terms":
          newConfig.termsOfService = editingItem;
          break;
        case "appBranding":
          newConfig.appBranding = editingItem;
          break;
        case "chatContact":
          newConfig.chatContact = editingItem;
          break;
        case "userProfile":
          newConfig.userProfile = editingItem;
          break;
        case "desktopIcon":
          newConfig.desktopIcon = editingItem;
          break;
        // aiModel: 直接表单编辑，不走此路径
      }
    } else {
      // 添加新项
      switch (activeTab) {
        case "banners":
          newConfig.banners.push(editingItem);
          break;
        case "live":
          newConfig.liveStreams.push(editingItem);
          break;
        case "articles":
          newConfig.articles.push(editingItem);
          break;
        case "marketCategories":
          newConfig.marketPage.categories.push(editingItem);
          break;
        case "marketProducts":
          newConfig.marketPage.products.push(editingItem);
          break;
        case "marketAd":
          newConfig.marketPage.advertisements.push(editingItem);
          break;
        case "filing":
          newConfig.filing = editingItem;
          break;
        case "aboutUs":
          newConfig.aboutUs = editingItem;
          break;
        case "privacy":
          newConfig.privacyPolicy = editingItem;
          break;
        case "terms":
          newConfig.termsOfService = editingItem;
          break;
        case "appBranding":
          newConfig.appBranding = editingItem;
          break;
        case "chatContact":
          newConfig.chatContact = editingItem;
          break;
        case "userProfile":
          newConfig.userProfile = editingItem;
          break;
        case "desktopIcon":
          newConfig.desktopIcon = editingItem;
          break;
        // aiModel: 直接表单编辑，不走此路径
      }
    }

    setWorkingConfig(newConfig);
    setEditingItem(null);
    setHasChanges(true);
  };

  // 删除项
  const handleDeleteItem = (id: number | string) => {
    if (!confirm(ct("确定要删除这项吗？", "Are you sure you want to delete this item?"))) return;

    const newConfig = JSON.parse(JSON.stringify(workingConfig)) as typeof config;
    switch (activeTab) {
      case "banners":
        newConfig.banners = workingConfig.banners.filter((item: any) => item.id !== id);
        break;
      case "live":
        newConfig.liveStreams = workingConfig.liveStreams.filter((item: any) => item.id !== id);
        break;
      case "articles":
        newConfig.articles = workingConfig.articles.filter((item: any) => item.id !== id);
        break;
      case "marketCategories":
        newConfig.marketPage.categories = workingConfig.marketPage.categories.filter((item: any) => item.id !== id);
        break;
      case "marketProducts":
        newConfig.marketPage.products = workingConfig.marketPage.products.filter((item: any) => item.id !== id);
        break;
      case "marketAd":
        newConfig.marketPage.advertisements = (workingConfig.marketPage.advertisements || []).filter((item: any) => item.id !== id);
        break;
      // 单体配置类型：重置为默认值而非null，防止崩溃
      case "filing":
        newConfig.filing = { icpNumber: "", icpUrl: "", policeNumber: "", policeUrl: "" };
        break;
      case "aboutUs":
        newConfig.aboutUs = { title: "", content: "" };
        break;
      case "privacy":
        newConfig.privacyPolicy = { title: "", content: "" };
        break;
      case "terms":
        newConfig.termsOfService = { title: "", content: "" };
        break;
      case "appBranding":
        newConfig.appBranding = { logoUrl: "", appName: "", slogan: "" };
        break;
      case "chatContact":
        newConfig.chatContact = { name: "", avatar: "", subtitle: "", imUserId: "", channelId: "", imProvider: "tencent-im", phone: "", storeId: "", verifiedDomains: [] };
        break;
      case "userProfile":
        newConfig.userProfile = { name: "", avatar: "" };
        break;
      case "desktopIcon":
        newConfig.desktopIcon = { appName: "", icon192Url: "", icon512Url: "" };
        break;
      // aiModel: 直接表单编辑，不走删除路径
    }

    setWorkingConfig(newConfig);
    setHasChanges(true);
  };

  // 渲染卡片网格
  const renderTable = () => {
    const items = getItemsByType(activeTab);

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Plus className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm">{ct('暂无数据', 'No data yet')}</p>
          <p className="text-xs mt-1">{ct('点击右上角"添加"按钮创建新项', 'Click "Add" to create a new item')}</p>
        </div>
      );
    }

    const Field = ({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) => {
      if (!value && value !== 0) return null;
      const displayVal = typeof value === 'string' && value.length > 80 ? value.slice(0, 80) + '…' : value;
      return (
        <div className="min-w-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
          <p className={`text-xs text-gray-700 mt-0.5 truncate ${mono ? 'font-mono' : ''}`} title={typeof value === 'string' ? value : undefined}>{displayVal || '-'}</p>
        </div>
      );
    };

    const Thumb = ({ src, alt }: { src?: string; alt?: string }) => {
      if (!src) return null;
      return (
        <div className="w-full h-28 bg-gray-100 rounded-t-xl overflow-hidden flex-shrink-0">
          <img src={src} alt={alt || ''} className="w-full h-full object-fill object-center" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      );
    };

    const Avatar = ({ src, name }: { src?: string; name?: string }) => (
      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center overflow-hidden flex-shrink-0">
        {src ? (
          <img src={src} alt={name || ''} className="w-full h-full object-fill object-center" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <span className="text-sm">{(name || '?')[0]}</span>
        )}
      </div>
    );

    const renderCardBody = (item: any) => {
      switch (activeTab) {
        case 'banners':
          return (<><Thumb src={item.url} alt={item.alt} /><div className="p-3 space-y-2 flex-1">{item.title && <p className="text-sm text-gray-800">{item.title}</p>}<Field label={ct("描述","Alt")} value={item.alt} /><Field label={ct("内容","Content")} value={item.content} /><Field label="URL" value={item.url} mono /></div></>);
        case 'live':
          return (<><Thumb src={item.thumbnail} alt={item.title} /><div className="p-3 space-y-2 flex-1"><p className="text-sm text-gray-800">{item.title || '-'}</p><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full">● LIVE</span><span className="text-xs text-gray-500">{item.viewers || 0} {ct("观看","viewers")}</span></div><Field label="URL" value={item.videoUrl} mono /></div></>);
        case 'articles':
          return (<><Thumb src={item.thumbnail} alt={item.title} /><div className="p-3 space-y-2 flex-1"><p className="text-sm text-gray-800">{item.title || '-'}</p><Field label={ct("内容","Content")} value={item.content} /></div></>);
        case 'marketCategories':
          return (<div className="p-3 space-y-2 flex-1"><p className="text-sm text-gray-800">{item.name || '-'}</p>{item.subCategories?.length > 0 && <div className="flex flex-wrap gap-1">{item.subCategories.map((sub: string, i: number) => <span key={i} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{sub}</span>)}</div>}</div>);
        case 'marketProducts':
          return (<><Thumb src={item.image} alt={item.name} /><div className="p-3 space-y-2 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-sm text-gray-800 flex-1">{item.name || '-'}</p>{item.price && <span className="text-sm text-emerald-600 flex-shrink-0">{item.price}</span>}</div>{item.category && <span className="inline-block text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{item.category}</span>}<Field label={ct("描述","Desc")} value={item.description} /></div></>);
        case 'marketAd':
          return (<><Thumb src={item.image} alt={item.title} /><div className="p-3 space-y-2 flex-1"><p className="text-sm text-gray-800">{item.title || '-'}</p><Field label={ct("内容","Content")} value={item.content} /></div></>);
        case 'filing':
          return (<div className="p-3 space-y-2 flex-1"><Field label={ct("ICP备案号","ICP Number")} value={item.icpNumber} mono /><Field label={ct("ICP链接","ICP Link")} value={item.icpUrl} mono /><Field label={ct("公安备案号","Police Filing")} value={item.policeNumber} mono /><Field label={ct("公安链接","Police Link")} value={item.policeUrl} mono /></div>);
        case 'aboutUs': case 'privacy': case 'terms':
          return (<div className="p-3 space-y-2 flex-1"><p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-6">{item.content || '-'}</p></div>);
        case 'appBranding':
          return (<div className="p-3 flex items-center gap-3 flex-1">{item.logoUrl ? <img src={item.logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-fill object-center flex-shrink-0 border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 text-lg">🌱</div>}<div className="min-w-0 flex-1 space-y-1"><p className="text-sm text-gray-800">{item.appName || '-'}</p><p className="text-xs text-gray-500 truncate">{item.slogan || '-'}</p></div></div>);
        case 'chatContact':
          return (<div className="p-3 flex-1 space-y-2"><div className="flex items-center gap-3"><Avatar src={item.avatar} name={item.name} /><div className="min-w-0 flex-1"><p className="text-sm text-gray-800">{item.name || '-'}</p><p className="text-xs text-gray-500 truncate">{item.subtitle || '-'}</p></div></div><div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1"><Field label={ct("服务商","Provider")} value={item.imProvider} /><Field label={ct("电话","Phone")} value={item.phone} /><Field label="IM User ID" value={item.imUserId} mono /><Field label="Channel ID" value={item.channelId} mono /></div></div>);
        case 'userProfile':
          return (<div className="p-3 flex items-center gap-3 flex-1"><Avatar src={item.avatar} name={item.name} /><p className="text-sm text-gray-800">{item.name || '-'}</p></div>);
        case 'desktopIcon':
          return (<div className="p-3 flex items-center gap-3 flex-1">{item.icon192Url ? <img src={item.icon192Url} alt="Icon" className="w-12 h-12 rounded-xl object-fill object-center flex-shrink-0 border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0" />}<div className="min-w-0 flex-1 space-y-1"><p className="text-sm text-gray-800">{item.appName || '-'}</p><Field label="192px" value={item.icon192Url} mono /><Field label="512px" value={item.icon512Url} mono /></div></div>);
        default:
          return (<div className="p-3 flex-1"><pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">{JSON.stringify(item, null, 2).slice(0, 200)}</pre></div>);
      }
    };

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((item: any, index: number) => (
          <div key={item.id || index} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md hover:border-emerald-200 transition-all group">
            {renderCardBody(item)}
            <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between bg-gray-50/60">
              <button onClick={() => setEditingItem({ ...item })} className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors">
                <Edit3 className="w-3.5 h-3.5" />{ct("编辑", "Edit")}
              </button>
              <button onClick={() => handleDeleteItem(item.id)} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />{ct("删除", "Delete")}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };
// ... existing code ...


  // 获取表头
  const getTableHeaders = () => {
    switch (activeTab) {
      case "banners":
        return ["ID", ct("图片URL", "Image URL"), ct("描述文字", "Alt Text"), ct("标题", "Title"), ct("内容", "Content")];
      case "live":
        return ["ID", ct("直播标题", "Live Title"), ct("观看人数", "Viewers"), ct("视频URL", "Video URL"), ct("预览", "Preview")];
      case "articles":
        return ["ID", ct("文章标题", "Article Title"), ct("内容", "Content"), ct("缩略图URL", "Thumbnail URL")];
      case "marketCategories":
        return ["ID", ct("类别名称", "Category Name"), ct("子类别", "Subcategories")];
      case "marketProducts":
        return ["ID", ct("产品名称", "Product Name"), ct("描述", "Description"), ct("价格", "Price"), ct("类别", "Category"), ct("缩略图URL", "Thumbnail URL")];
      case "marketAd":
        return ["ID", ct("广告标题", "Ad Title"), ct("内容", "Content"), ct("缩略图URL", "Thumbnail URL")];
      case "filing":
        return [ct("ICP备案号", "ICP Number"), ct("ICP链接", "ICP Link"), ct("公安备案号", "Police Filing No."), ct("公安链接", "Police Link")];
      case "aboutUs":
        return ["ID", ct("关于我们内容", "About Us Content")];
      case "privacy":
        return ["ID", ct("隐私政策内容", "Privacy Policy Content")];
      case "terms":
        return ["ID", ct("服务条款内容", "Terms of Service Content")];
      case "appBranding":
        return [ct("Logo图标", "Logo Icon"), ct("应用名称", "App Name"), ct("口号", "Slogan")];
      case "chatContact":
        return [ct("姓名", "Name"), ct("头像", "Avatar"), ct("副标题", "Subtitle"), ct("IM用户ID", "IM User ID"), ct("聊天室ID", "Channel ID"), ct("IM服务商", "IM Provider"), ct("电话", "Phone"), ct("门店编号", "Store ID"), ct("验证域名", "Verified Domains")];
      case "userProfile":
        return [ct("姓名", "Name"), ct("头像", "Avatar")];
      case "desktopIcon":
        return [ct("应用名称", "App Name"), ct("192px图标", "Icon 192"), ct("512px图标", "Icon 512")];
      case "aiModel":
        return ["ID", ct("模型名称", "Model Name"), ct("描述", "Description"), ct("参数", "Parameters")];
      default:
        return [];
    }
  };

  // 渲染表格行
  const renderTableRow = (item: any) => {
    switch (activeTab) {
      case "banners":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.url}>{item.url}</td>
            <td className="px-3 py-2 text-xs">{item.alt}</td>
            <td className="px-3 py-2 text-xs">{item.title}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.content}>{item.content}</td>
          </>
        );
      case "live":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.title}</td>
            <td className="px-3 py-2 text-xs">{item.viewers}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.videoUrl}>{item.videoUrl || <span className="text-gray-400">-</span>}</td>
            <td className="px-3 py-2 text-xs">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.title} className="w-16 h-10 object-fill object-center rounded" />
              ) : (
                <span className="text-gray-400">{ct("无缩略图", "No thumbnail")}</span>
              )}
            </td>
          </>
        );
      case "articles":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.title}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.content}>{item.content}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.thumbnail}>{item.thumbnail}</td>
          </>
        );
      case "marketCategories":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.name}</td>
            <td className="px-3 py-2 text-xs">{item.subCategories.join(", ")}</td>
          </>
        );
      case "marketProducts":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.name}</td>
            <td className="px-3 py-2 text-xs">{item.description}</td>
            <td className="px-3 py-2 text-xs">{item.price}</td>
            <td className="px-3 py-2 text-xs">{item.category}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.image}>{item.image}</td>
          </>
        );
      case "marketAd":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.title}</td>
            <td className="px-3 py-2 text-xs">{item.content || "-"}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.image}>{item.image}</td>
          </>
        );
      case "filing":
        return (
          <>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.icpNumber}>{item.icpNumber}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.icpUrl}>{item.icpUrl}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.policeNumber}>{item.policeNumber}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.policeUrl}>{item.policeUrl}</td>
          </>
        );
      case "aboutUs":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.content}>{item.content}</td>
          </>
        );
      case "privacy":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.content}>{item.content}</td>
          </>
        );
      case "terms":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.content}>{item.content}</td>
          </>
        );
      case "appBranding":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.logoUrl}</td>
            <td className="px-3 py-2 text-xs">{item.appName}</td>
            <td className="px-3 py-2 text-xs">{item.slogan}</td>
          </>
        );
      case "chatContact":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.name}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.avatar}>{item.avatar}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.subtitle}>{item.subtitle}</td>
            <td className="px-3 py-2 text-xs font-mono">{item.imUserId || "-"}</td>
            <td className="px-3 py-2 text-xs font-mono">{item.channelId || "-"}</td>
            <td className="px-3 py-2 text-xs">{item.imProvider || "-"}</td>
            <td className="px-3 py-2 text-xs">{item.phone || "-"}</td>
            <td className="px-3 py-2 text-xs">{item.storeId || "-"}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={(item.verifiedDomains || []).join(", ")}>{(item.verifiedDomains || []).join(", ") || "-"}</td>
          </>
        );
      case "userProfile":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.name}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.avatar}>{item.avatar}</td>
          </>
        );
      case "desktopIcon":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.appName}</td>
            <td className="px-3 py-2 text-xs max-w-[120px] truncate" title={item.icon192Url}>{item.icon192Url}</td>
            <td className="px-3 py-2 text-xs max-w-[120px] truncate" title={item.icon512Url}>{item.icon512Url}</td>
          </>
        );
      case "aiModel":
        return (
          <>
            <td className="px-3 py-2 text-xs">{item.id}</td>
            <td className="px-3 py-2 text-xs">{item.name}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.description}>{item.description}</td>
            <td className="px-3 py-2 text-xs max-w-xs truncate" title={item.parameters}>{item.parameters}</td>
          </>
        );
      default:
        return null;
    }
  };

  // 渲染编辑对话框
  const renderEditDialog = () => {
    if (!editingItem) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-emerald-600 text-white px-6 py-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold">{ct("编辑", "Edit")} {getTabName(activeTab)}</h3>
            <button onClick={() => setEditingItem(null)} className="text-white hover:bg-emerald-700 rounded-lg p-1">
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {renderEditFields()}
          </div>

          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t">
            <button
              onClick={() => setEditingItem(null)}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {ct("取消", "Cancel")}
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {ct("保存", "Save")}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染编辑字段
  const renderEditFields = () => {
    switch (activeTab) {
      case "banners":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("图片URL", "Image URL")} value={editingItem.url} onChange={(v: string) => setEditingItem({ ...editingItem, url: v })} />
            <InputField label={ct("描述文字", "Alt Text")} value={editingItem.alt} onChange={(v: string) => setEditingItem({ ...editingItem, alt: v })} />
            <InputField label={ct("标题", "Title")} value={editingItem.title} onChange={(v: string) => setEditingItem({ ...editingItem, title: v })} />
            <RichTextEditor label={ct("内容", "Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑，支持格式和图片", "Paste from Word or edit directly, supports formatting and images")} />
          </>
        );
      case "live":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("直播标题", "Live Title")} value={editingItem.title} onChange={(v: string) => setEditingItem({ ...editingItem, title: v })} />
            <InputField label={ct("观看人数", "Viewers")} value={editingItem.viewers} onChange={(v: string) => setEditingItem({ ...editingItem, viewers: v })} />
            {/* 缩略图URL + 预览 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{ct("缩略图URL", "Thumbnail URL")}</label>
              <input
                type="text"
                value={editingItem.thumbnail || ""}
                onChange={(e) => setEditingItem({ ...editingItem, thumbnail: e.target.value })}
                placeholder={ct("输入图片链接", "Enter image URL")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {editingItem.thumbnail && (
                <img src={editingItem.thumbnail} alt={ct("缩略图预览", "Thumbnail preview")} className="mt-2 w-full max-w-xs h-32 object-fill object-center rounded-lg border border-gray-200" />
              )}
            </div>
            {/* 视频URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{ct("视频URL", "Video URL")}</label>
              <input
                type="text"
                value={editingItem.videoUrl || ""}
                onChange={(e) => setEditingItem({ ...editingItem, videoUrl: e.target.value })}
                placeholder={ct("输入视频链接（.mp4）", "Enter video URL (.mp4)")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-500">{ct("缩略图用于列表封面展示，视频URL用于播放页面", "Thumbnail for list cover display, Video URL for playback page")}</p>
            </div>

            {/* ── 分享设置 (Per-video) ── */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs">S</span>
                  <h4 className="text-sm text-gray-800">{ct("分享设置", "Share Settings")}</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editingItem.shareEnabled ?? false} onChange={(e) => setEditingItem({ ...editingItem, shareEnabled: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              {editingItem.shareEnabled && (
                <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                  <InputField label={ct("分享链接", "Share URL")} value={editingItem.shareUrl || ""} onChange={(v: string) => setEditingItem({ ...editingItem, shareUrl: v })} placeholder={ct("留空自动取当前域名", "Leave empty for current domain")} />
                  <InputField label={ct("分享标题", "Share Title")} value={editingItem.shareTitle || ""} onChange={(v: string) => setEditingItem({ ...editingItem, shareTitle: v })} />
                  <InputField label={ct("分享描述", "Share Text")} value={editingItem.shareText || ""} onChange={(v: string) => setEditingItem({ ...editingItem, shareText: v })} />
                  <InputField label={ct("分享缩略图URL", "Share Image URL")} value={editingItem.shareImgUrl || ""} onChange={(v: string) => setEditingItem({ ...editingItem, shareImgUrl: v })} />
                  <div className="mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingItem.wxJsSdkEnabled ?? false} onChange={(e) => setEditingItem({ ...editingItem, wxJsSdkEnabled: e.target.checked })} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm text-gray-700">{ct("启用微信JS-SDK分享", "Enable WeChat JS-SDK Share")}</span>
                    </label>
                    {editingItem.wxJsSdkEnabled && (
                      <div className="mt-2 space-y-2 pl-4">
                        <InputField label={ct("微信AppID", "WeChat AppID")} value={editingItem.wxAppId || ""} onChange={(v: string) => setEditingItem({ ...editingItem, wxAppId: v })} />
                        <InputField label={ct("签名接口URL", "Signature API URL")} value={editingItem.wxSignatureApi || ""} onChange={(v: string) => setEditingItem({ ...editingItem, wxSignatureApi: v })} placeholder="https://api.example.com/wx-signature" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── 导航设置 (Per-video) ── */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">N</span>
                  <h4 className="text-sm text-gray-800">{ct("导航设置", "Navigation Settings")}</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editingItem.navEnabled ?? false} onChange={(e) => {
                    const updates: any = { ...editingItem, navEnabled: e.target.checked };
                    if (e.target.checked && !editingItem.navCreatedAt) {
                      updates.navCreatedAt = Date.now();
                    }
                    setEditingItem(updates);
                  }} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              {editingItem.navEnabled && (
                <div className="space-y-3 pl-2 border-l-2 border-emerald-200">
                  <div className="grid grid-cols-2 gap-3">
                    <InputField label={ct("纬度", "Latitude")} value={editingItem.navLatitude || ""} onChange={(v: string) => setEditingItem({ ...editingItem, navLatitude: v })} placeholder="39.9042" />
                    <InputField label={ct("经度", "Longitude")} value={editingItem.navLongitude || ""} onChange={(v: string) => setEditingItem({ ...editingItem, navLongitude: v })} placeholder="116.4074" />
                  </div>
                  <InputField label={ct("地址名称", "Address Name")} value={editingItem.navAddress || ""} onChange={(v: string) => setEditingItem({ ...editingItem, navAddress: v })} placeholder={ct("例如：北京市海淀区中关村大街1号", "e.g. 1 Zhongguancun St, Haidian, Beijing")} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("导航按钮显示天数", "Navigation Button Display Days")}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={editingItem.navDisplayDays ?? 15}
                        onChange={(e) => setEditingItem({ ...editingItem, navDisplayDays: parseInt(e.target.value) || 15 })}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      />
                      <span className="text-sm text-gray-500">{ct("天", "days")}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{ct("超过指定天数后，导航按钮将自动隐藏（默认15天）", "Navigation button auto-hides after specified days (default 15)")}</p>
                    {editingItem.navCreatedAt && (
                      <p className="mt-1 text-xs text-emerald-600">{ct("导航启用于：", "Navigation enabled on: ")}{new Date(editingItem.navCreatedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">{ct("输入坐标系", "Input Coordinate System")}</label>
                    <div className="flex gap-2">
                      {[
                        { value: "wgs84", label: "WGS84", hint: ct("GPS原始", "GPS Raw") },
                        { value: "gcj02", label: "GCJ02", hint: ct("国测局/高德", "China/Amap") },
                        { value: "bd09", label: "BD09", hint: ct("百度", "Baidu") },
                      ].map((cs) => (
                        <button
                          key={cs.value}
                          type="button"
                          onClick={() => setEditingItem({ ...editingItem, navCoordSystem: cs.value })}
                          className={`flex-1 py-2 px-2 rounded-lg border text-center transition-colors ${
                            (editingItem.navCoordSystem || "wgs84") === cs.value
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <p className="text-xs font-medium">{cs.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{cs.hint}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-2">{ct("启用的地图应用", "Enabled Map Apps")}</p>
                    <div className="space-y-2">
                      {[
                        { key: "navBaiduMap", label: ct("百度地图", "Baidu Maps"), hint: ct("中国区", "China"), icon: "M" },
                        { key: "navAmapMap", label: ct("高德地图", "Amap / Gaode"), hint: ct("中国区", "China"), icon: "A" },
                        { key: "navGoogleMap", label: "Google Maps", hint: ct("国际", "Intl"), icon: "G" },
                        { key: "navAppleMaps", label: "Apple Maps", hint: ct("国际", "Intl"), icon: "A" },
                        { key: "navWaze", label: "Waze", hint: ct("国际", "Intl"), icon: "W" },
                      ].map((app) => (
                        <label key={app.key} className="flex items-center justify-between py-1.5 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-[10px]">{app.icon}</span>
                            <span className="text-sm text-gray-800">{app.label}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{app.hint}</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={(editingItem as any)[app.key] ?? true} onChange={(e) => setEditingItem({ ...editingItem, [app.key]: e.target.checked })} className="sr-only peer" />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      case "articles":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("文章标题", "Article Title")} value={editingItem.title} onChange={(v: string) => setEditingItem({ ...editingItem, title: v })} />
            <RichTextEditor label={ct("文章内容", "Article Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑，支持段落、图片、列表等格式", "Paste from Word or edit directly, supports paragraphs, images, lists")} minHeight="300px" />
            <InputField label={ct("缩略图URL", "Thumbnail URL")} value={editingItem.thumbnail || ""} onChange={(v: string) => setEditingItem({ ...editingItem, thumbnail: v })} />
          </>
        );
      case "marketCategories":
        return (
          <>
            <InputField 
              label={ct("类别ID（英文，用于系统识别）", "Category ID (English, for system use)")} 
              value={editingItem.id} 
              onChange={(v: string) => setEditingItem({ ...editingItem, id: v })} 
              placeholder={ct("例如：herbicide, insecticide", "e.g. herbicide, insecticide")}
            />
            <InputField 
              label={ct("类别名称（显示给用户）", "Category Name (displayed to user)")} 
              value={editingItem.name} 
              onChange={(v: string) => setEditingItem({ ...editingItem, name: v })} 
              placeholder={ct("例如：除草剂, 杀虫剂", "e.g. Herbicide, Insecticide")}
            />
            
            {/* 子类别编辑 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {ct("子类别列表", "Subcategory List")}
              </label>
              <div className="space-y-2">
                {(editingItem.subCategories || []).map((subCat: string, index: number) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={subCat}
                      onChange={(e) => {
                        const newSubCategories = [...(editingItem.subCategories || [])];
                        newSubCategories[index] = e.target.value;
                        setEditingItem({ ...editingItem, subCategories: newSubCategories });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={ct("子类别名称", "Subcategory name")}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newSubCategories = editingItem.subCategories.filter((_: string, i: number) => i !== index);
                        setEditingItem({ ...editingItem, subCategories: newSubCategories });
                      }}
                      className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                {/* 添加子类别按钮 */}
                <button
                  type="button"
                  onClick={() => {
                    const newSubCategories = [...(editingItem.subCategories || []), ""];
                    setEditingItem({ ...editingItem, subCategories: newSubCategories });
                  }}
                  className="w-full px-3 py-2 bg-emerald-50 text-emerald-600 border-2 border-dashed border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {ct("添加子类别", "Add Subcategory")}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {ct("💡 子类别示例：苗前、苗中后、苗前苗后", "💡 Examples: Pre-emergence, Mid-post, Pre & Post")}
              </p>
            </div>
          </>
        );
      case "marketProducts":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("产品名称", "Product Name")} value={editingItem.name} onChange={(v: string) => setEditingItem({ ...editingItem, name: v })} />
            
            {/* 一级类别选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{ct("一级类别", "Primary Category")}</label>
              <select
                value={editingItem.category || ""}
                onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value, subCategory: "" })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">{ct("选择类别", "Select category")}</option>
                {config.marketPage.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 二级类别选择 */}
            {editingItem.category && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("二级类别", "Subcategory")}</label>
                <select
                  value={editingItem.subCategory || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, subCategory: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{ct("选择子类别", "Select subcategory")}</option>
                  {config.marketPage.categories
                    .find((cat) => cat.id === editingItem.category)
                    ?.subCategories.map((subCat) => (
                      <option key={subCat} value={subCat}>{subCat}</option>
                    ))}
                </select>
              </div>
            )}
            
            <InputField label={ct("价格", "Price")} value={editingItem.price} onChange={(v: string) => setEditingItem({ ...editingItem, price: v })} placeholder={ct("例如：¥68", "e.g. 68")} />
            <InputField label={ct("库存数量", "Stock Qty")} value={editingItem.stock || ""} onChange={(v: string) => setEditingItem({ ...editingItem, stock: parseInt(v) || 0 })} type="number" />
            <InputField label={ct("产品图片URL", "Product Image URL")} value={editingItem.image || ""} onChange={(v: string) => setEditingItem({ ...editingItem, image: v })} />
            <TextAreaField label={ct("简短描述", "Short Description")} value={editingItem.description || ""} onChange={(v: string) => setEditingItem({ ...editingItem, description: v })} rows={2} placeholder={ct("一句话描述产品特点", "One-line product highlight")} />
            <RichTextEditor label={ct("详细说明", "Detailed Description")} value={editingItem.details || ""} onChange={(v: string) => setEditingItem({ ...editingItem, details: v })} placeholder={ct("从Word粘贴或直接编辑产品详情", "Paste from Word or edit product details")} minHeight="200px" />
            <RichTextEditor label={ct("产品规格", "Specifications")} value={editingItem.specifications || ""} onChange={(v: string) => setEditingItem({ ...editingItem, specifications: v })} placeholder={ct("从Word粘贴或直接编辑规格参数", "Paste from Word or edit specifications")} minHeight="150px" />
          </>
        );
      case "marketAd":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("广告标题", "Ad Title")} value={editingItem.title} onChange={(v: string) => setEditingItem({ ...editingItem, title: v })} />
            <RichTextEditor label={ct("广告内容", "Ad Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑广告详情", "Paste from Word or edit ad details directly")} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{ct("广告图片URL", "Ad Image URL")}</label>
              <input
                type="text"
                value={editingItem.image || ""}
                onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                placeholder={ct("输入图片链接", "Enter image URL")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {editingItem.image && (
                <img src={editingItem.image} alt={ct("广告预览", "Ad preview")} className="mt-2 w-full max-w-md h-40 object-fill object-center rounded-lg border border-gray-200" />
              )}
            </div>
          </>
        );
      case "filing":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("ICP备案号", "ICP Number")} value={editingItem.icpNumber || ""} onChange={(v: string) => setEditingItem({ ...editingItem, icpNumber: v })} />
            <InputField label={ct("ICP链接", "ICP Link")} value={editingItem.icpUrl || ""} onChange={(v: string) => setEditingItem({ ...editingItem, icpUrl: v })} />
            <InputField label={ct("公安备案号", "Police Filing No.")} value={editingItem.policeNumber || ""} onChange={(v: string) => setEditingItem({ ...editingItem, policeNumber: v })} />
            <InputField label={ct("公安链接", "Police Link")} value={editingItem.policeUrl || ""} onChange={(v: string) => setEditingItem({ ...editingItem, policeUrl: v })} />
          </>
        );
      case "aboutUs":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <RichTextEditor label={ct("关于我们内容", "About Us Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑", "Paste from Word or edit directly")} />
          </>
        );
      case "privacy":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <RichTextEditor label={ct("隐私政策内容", "Privacy Policy Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑", "Paste from Word or edit directly")} />
          </>
        );
      case "terms":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <RichTextEditor label={ct("服务条款内容", "Terms of Service Content")} value={editingItem.content || ""} onChange={(v: string) => setEditingItem({ ...editingItem, content: v })} placeholder={ct("从Word粘贴或直接编辑", "Paste from Word or edit directly")} />
          </>
        );
      case "appBranding":
        return (
          <>
            <InputField label={ct("Logo图标", "Logo Icon")} value={editingItem.logoUrl || ""} onChange={(v: string) => setEditingItem({ ...editingItem, logoUrl: v })} />
            <InputField label={ct("应用名称", "App Name")} value={editingItem.appName || ""} onChange={(v: string) => setEditingItem({ ...editingItem, appName: v })} />
            <InputField label={ct("口号", "Slogan")} value={editingItem.slogan || ""} onChange={(v: string) => setEditingItem({ ...editingItem, slogan: v })} />
          </>
        );
      case "chatContact":
        return (
          <>
            <InputField label={ct("商家姓名", "Merchant Name")} value={editingItem.name || ""} onChange={(v: string) => setEditingItem({ ...editingItem, name: v })} />
            <InputField label={ct("头像URL", "Avatar URL")} value={editingItem.avatar || ""} onChange={(v: string) => setEditingItem({ ...editingItem, avatar: v })} />
            <InputField label={ct("副标题（门店描述）", "Subtitle (Store Description)")} value={editingItem.subtitle || ""} onChange={(v: string) => setEditingItem({ ...editingItem, subtitle: v })} />
            <InputField label={ct("商家电话", "Merchant Phone")} value={editingItem.phone || ""} onChange={(v: string) => setEditingItem({ ...editingItem, phone: v })} />
            <InputField label={ct("门店编号", "Store ID")} value={editingItem.storeId || ""} onChange={(v: string) => setEditingItem({ ...editingItem, storeId: v })} />

            {/* IM 服务商配置区块 */}
            <div className="mt-2 mb-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs font-semibold text-blue-700 mb-2">{ct("IM 服务商对接", "IM Provider Integration")}</p>
              <InputField label={ct("IM用户ID（服务商分配给商家的唯一标识）", "IM User ID (Unique ID assigned by IM provider)")} value={editingItem.imUserId || ""} onChange={(v: string) => setEditingItem({ ...editingItem, imUserId: v })} />
              <InputField label={ct("聊天室ID（商家二维码中携带，扫码后自动填入）", "Channel ID (From merchant QR code, auto-filled after scan)")} value={editingItem.channelId || ""} onChange={(v: string) => setEditingItem({ ...editingItem, channelId: v })} />
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("IM服务商", "IM Provider")}</label>
                <select
                  value={editingItem.imProvider || "tencent-im"}
                  onChange={(e) => setEditingItem({ ...editingItem, imProvider: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                >
                  <option value="tencent-im">{ct("腾讯云即时通信", "Tencent IM")}</option>
                  <option value="cometchat">CometChat</option>
                </select>
              </div>
              <p className="text-[10px] text-blue-500">{ct("💡 此ID由IM服务商后台分配，农户端会用此ID与商家建立IM会话", "💡 This ID is assigned by the IM provider. The farmer's app uses it to establish IM sessions with the merchant.")}</p>
            </div>

            {/* 域名验证白名单区块 */}
            <div className="mt-2 mb-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-xs font-semibold text-amber-700 mb-1">{ct("域名验证白名单", "Domain Verification Whitelist")}</p>
              <p className="text-[10px] text-amber-600 mb-2">{ct("农户扫码绑定商家时，二维码来源域名必须在此白名单中，否则拒绝绑定。防止农户随意扫码绑定非授权联系人。", "When a farmer scans a QR code to bind a merchant, the QR source domain must be in this whitelist. This prevents unauthorized contact binding.")}</p>
              {(editingItem.verifiedDomains || []).map((domain: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => {
                      const newDomains = [...(editingItem.verifiedDomains || [])];
                      newDomains[idx] = e.target.value;
                      setEditingItem({ ...editingItem, verifiedDomains: newDomains });
                    }}
                    placeholder="example.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newDomains = (editingItem.verifiedDomains || []).filter((_: string, i: number) => i !== idx);
                      setEditingItem({ ...editingItem, verifiedDomains: newDomains });
                    }}
                    className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const newDomains = [...(editingItem.verifiedDomains || []), ""];
                  setEditingItem({ ...editingItem, verifiedDomains: newDomains });
                }}
                className="w-full px-3 py-2 bg-amber-100 text-amber-700 border-2 border-dashed border-amber-300 rounded-lg hover:bg-amber-200 transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <Plus className="w-3 h-3" />
                {ct("添加域名", "Add Domain")}
              </button>
            </div>

            {/* 绑定状态只读展示 */}
            {editingItem.boundAt && (
              <div className="mt-2 p-3 bg-green-50 rounded-xl border border-green-200">
                <p className="text-xs font-semibold text-green-700 mb-1">{ct("扫码绑定记录", "QR Binding Record")}</p>
                <p className="text-[10px] text-green-600">{ct("绑定时间", "Bound At")}: {new Date(editingItem.boundAt).toLocaleString()}</p>
                {editingItem.boundFrom && <p className="text-[10px] text-green-600">{ct("来源域名", "Source Domain")}: {editingItem.boundFrom}</p>}
              </div>
            )}
          </>
        );
      case "userProfile":
        return (
          <>
            <InputField label={ct("姓名", "Name")} value={editingItem.name || ""} onChange={(v: string) => setEditingItem({ ...editingItem, name: v })} />
            <InputField label={ct("头像", "Avatar")} value={editingItem.avatar || ""} onChange={(v: string) => setEditingItem({ ...editingItem, avatar: v })} />
          </>
        );
      case "desktopIcon":
        return (
          <>
            <InputField label={ct("应用名称", "App Name")} value={editingItem.appName || ""} onChange={(v: string) => setEditingItem({ ...editingItem, appName: v })} />
            <InputField label={ct("192px图标链接", "Icon 192px URL")} value={editingItem.icon192Url || ""} onChange={(v: string) => setEditingItem({ ...editingItem, icon192Url: v })} />
            <InputField label={ct("512px图标链接", "Icon 512px URL")} value={editingItem.icon512Url || ""} onChange={(v: string) => setEditingItem({ ...editingItem, icon512Url: v })} />
            {editingItem.icon192Url && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">{ct("图标预览", "Icon Preview")}</p>
                <img src={editingItem.icon192Url} alt="icon preview" className="w-16 h-16 rounded-xl border border-gray-200 object-fill object-center" />
              </div>
            )}
          </>
        );
      case "aiModel":
        return (
          <>
            <InputField label="ID" value={editingItem.id} disabled />
            <InputField label={ct("模型名称", "Model Name")} value={editingItem.name || ""} onChange={(v: string) => setEditingItem({ ...editingItem, name: v })} />
            <TextAreaField label={ct("描述", "Description")} value={editingItem.description || ""} onChange={(v: string) => setEditingItem({ ...editingItem, description: v })} rows={2} placeholder={ct("模型描述", "Model description")} />
            <TextAreaField label={ct("参数", "Parameters")} value={editingItem.parameters || ""} onChange={(v: string) => setEditingItem({ ...editingItem, parameters: v })} rows={2} placeholder={ct("模型参数", "Model parameters")} />
          </>
        );
      default:
        return null;
    }
  };

  const getTabName = (tab: string) => {
    switch (tab) {
      case "supabase": return ct("Supabase 连接", "Supabase Connection");
      case "banners": return ct("安全守护", "Safety Guard");
      case "live": return ct("直播", "Live");
      case "articles": return ct("文章", "Articles");
      case "marketCategories": return ct("市场类别", "Market Categories");
      case "marketProducts": return ct("市场产品", "Market Products");
      case "marketAd": return ct("市场广告", "Market Ads");
      case "filing": return ct("备案信息", "Filing Info");
      case "aboutUs": return ct("关于我们", "About Us");
      case "privacy": return ct("隐私政策", "Privacy Policy");
      case "terms": return ct("服务条款", "Terms of Service");
      case "appBranding": return ct("应用品牌", "App Branding");
      case "homeIcons": return ct("首页功能区", "Home Features");
      case "chatContact": return ct("聊天联系", "Chat Contact");
      case "userProfile": return ct("用户资料", "User Profile");
      case "desktopIcon": return ct("桌面图标", "Desktop Icon");
      case "aiModel": return ct("AI模型", "AI Model");
      case "backendProxy": return ct("IM后端代理", "IM Backend Proxy");
      case "pushProviders": return ct("推送服务", "Push Services");
      default: return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col overflow-hidden" style={{ transform: animPhase === 'visible' ? 'none' : 'scale(0.96)', opacity: animPhase === 'visible' ? 1 : 0, transition: 'transform 200ms ease-out, opacity 200ms ease-out' }}>
      {/* 状态栏占位 — standalone 模式下用 safe-area-inset-top 撇开 */}
      <div className="bg-emerald-600 safe-top flex-shrink-0" />

      {/* 顶部导航栏 */}
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0 z-40 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={handleGoBack} className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0 lg:hidden">
            <Menu className="w-4 h-4" />
          </button>
          <h1 className="font-semibold text-base sm:text-lg truncate">{ct("内容配置管理", "Content Config Manager")}</h1>
        </div>

        <button
          onClick={handleShowSaveDialog}
          disabled={!hasChanges}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors text-sm ${
            hasChanges
              ? "bg-white text-emerald-700 hover:bg-emerald-50 shadow-sm"
              : "bg-emerald-700/50 text-emerald-200 cursor-not-allowed"
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          <span>{ct("保存", "Save")}</span>
        </button>
      </div>

      {/* 侧边栏 + 内容区 */}
      <div className="flex-1 flex overflow-hidden relative">

      {/* Mobile backdrop */}
      {sidebarOpen && <div className="absolute inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* 侧边栏 */}
      <aside className={`absolute lg:static top-0 bottom-0 left-0 z-40 lg:z-auto w-52 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <nav className="py-2">
          {/* Supabase 独立入口 */}
          <div className="px-2 pt-1 pb-1">
            <button
              onClick={() => { setActiveTab('supabase'); setSidebarOpen(false); }}
              className={`w-full text-start px-3 py-2.5 rounded-lg transition-colors text-sm flex items-center justify-between ${activeTab === 'supabase' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <span>{ct('Supabase 连接', 'Supabase Connection')}</span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                syncStatus === 'synced' ? 'bg-emerald-500' :
                syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' :
                syncStatus === 'error' || syncStatus === 'conflict' ? 'bg-red-500' :
                isRemoteConfigured ? 'bg-amber-400' : 'bg-gray-300'
              }`} />
            </button>
            <div className="mx-3 mt-1 mb-1 border-b border-gray-200" />
          </div>

          {/* 分组项 */}
          {([
            { id: 'content', label: ct('内容管理', 'Content'), items: [
              { key: 'banners', label: ct('轮播横幅', 'Banners') },
              { key: 'live', label: ct('直播列表', 'Live Streams') },
              { key: 'articles', label: ct('文章列表', 'Articles') },
            ]},
            { id: 'market', label: ct('市场管理', 'Market'), items: [
              { key: 'marketCategories', label: ct('市场类别', 'Categories') },
              { key: 'marketProducts', label: ct('市场产品', 'Products') },
              { key: 'marketAd', label: ct('市场广告', 'Ads') },
            ]},
            { id: 'appearance', label: ct('外观配置', 'Appearance'), items: [
              { key: 'appBranding', label: ct('应用品牌', 'Branding') },
              { key: 'homeIcons', label: ct('首页图标', 'Home Icons') },
              { key: 'desktopIcon', label: ct('桌面图标', 'Desktop Icon') },
            ]},
            { id: 'legal', label: ct('法务信息', 'Legal'), items: [
              { key: 'filing', label: ct('备案信息', 'Filing') },
              { key: 'aboutUs', label: ct('关于我们', 'About Us') },
              { key: 'privacy', label: ct('隐私政策', 'Privacy') },
              { key: 'terms', label: ct('服务条款', 'Terms') },
            ]},
            { id: 'im', label: ct('通讯配置', 'Messaging'), items: [
              { key: 'backendProxy', label: ct('IM后端代理', 'IM Backend') },
              { key: 'chatContact', label: ct('聊天联系人', 'Chat Contact') },
            ]},
            { id: 'ai', label: ct('AI 配置', 'AI Config'), items: [
              { key: 'aiModel', label: ct('AI模型', 'AI Model') },
            ]},
            { id: 'auth', label: ct('认证配置', 'Auth'), items: [
              { key: 'loginConfig', label: ct('登录配置', 'Login') },
              { key: 'userProfile', label: ct('用户资料', 'Profile') },
            ]},
            { id: 'push', label: ct('推送服务', 'Push'), items: [
              { key: 'pushProviders', label: ct('推送服务商', 'Providers') },
            ]},
          ] as const).map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id}>
                <button
                  onClick={() => setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(group.id)) n.delete(group.id); else n.add(group.id); return n; })}
                  className="w-full text-start px-4 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-between"
                >
                  <span className="uppercase tracking-wider">{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                </button>
                {!isCollapsed && group.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => { setActiveTab(item.key as any); setSidebarOpen(false); }}
                    className={`w-full text-start px-5 py-2 text-sm transition-colors ${activeTab === item.key ? 'bg-emerald-50 text-emerald-700 font-medium border-r-2 border-emerald-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

      {/* 主内容区 - with header showing current tab name */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h2 className="text-base text-gray-800">{getTabName(activeTab)}</h2>
        {!["homeIcons", "desktopIcon", "aiModel", "backendProxy", "loginConfig", "pushProviders", "supabase"].includes(activeTab) && (
          <button
            onClick={() => handleAddItem(activeTab)}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5 text-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {ct("添加", "Add")}
          </button>
        )}
      </div>
      <div className="p-4 max-w-7xl mx-auto">
        {activeTab === "supabase" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("Supabase 连接配置", "Supabase Connection Config")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "配置你的自建 Supabase 项目。此连接被 IM通讯、云端AI、推送服务、登录认证等所有后端功能共用。Anon Key 是公开的，可安全放在前端。",
                "Configure your self-hosted Supabase project. This connection is shared by IM messaging, Cloud AI, push notifications, login auth, and all backend features. Anon Key is public and safe for frontend."
              )}</p>

              {/* Connection Status */}
              {(() => {
                const configured = isSupabaseConfigured(workingConfig.backendProxyConfig?.supabaseUrl, workingConfig.backendProxyConfig?.supabaseAnonKey);
                return (
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${configured ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${configured ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <span className="text-sm text-gray-700">
                      {configured
                        ? ct("已配置 — 就绪", "Configured — Ready")
                        : ct("未配置 — 请填写以下信息", "Not configured — fill in the fields below")
                      }
                    </span>
                  </div>
                );
              })()}

              {/* Supabase URL */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Supabase URL</label>
                <input
                  type="text"
                  value={workingConfig.backendProxyConfig?.supabaseUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                    newConfig.backendProxyConfig.supabaseUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="https://your-project-ref.supabase.co"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "Supabase Dashboard → Settings → API → Project URL",
                  "Supabase Dashboard → Settings → API → Project URL"
                )}</p>
              </div>

              {/* Supabase Anon Key */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Supabase Anon Key</label>
                <input
                  type="text"
                  value={workingConfig.backendProxyConfig?.supabaseAnonKey || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                    newConfig.backendProxyConfig.supabaseAnonKey = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "Anon Key 是公开的（标识项目），不等于 Service Role Key。Dashboard → Settings → API → anon public",
                  "Anon Key is public (identifies project), NOT the Service Role Key. Dashboard → Settings → API → anon public"
                )}</p>
              </div>

              {/* Connection Test Button */}
              <div className="pt-2">
                <button
                  onClick={async () => {
                    const url = workingConfig.backendProxyConfig?.supabaseUrl;
                    const key = workingConfig.backendProxyConfig?.supabaseAnonKey;
                    if (!url || !key) {
                      alert(ct("请先填写 URL 和 Anon Key", "Please fill in URL and Anon Key first"));
                      return;
                    }
                    const efn = workingConfig.backendProxyConfig?.edgeFunctionName || 'server';
                    const result = await supabaseTestConnection(url, key, efn);
                    if (result.ok) {
                      if (result.tableExists) {
                        alert(ct(
                          `连接成功！延迟 ${result.latencyMs}ms。app_config 表已就绪，远程配置同步可用。`,
                          `Connected! Latency ${result.latencyMs}ms. Table "app_config" ready, remote config sync available.`
                        ));
                      } else {
                        alert(ct(
                          `连接成功！延迟 ${result.latencyMs}ms。但未找到 app_config 表，请在 Supabase SQL Editor 中创建（见下方建表脚本）。`,
                          `Connected! Latency ${result.latencyMs}ms. But table "app_config" not found. Please create it in Supabase SQL Editor (see SQL script below).`
                        ));
                      }
                    } else {
                      alert(ct(`连接失败：${result.error}`, `Connection failed: ${result.error}`));
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                >
                  {ct("测试连接", "Test Connection")}
                </button>
              </div>
            </div>

            {/* Which modules use this connection */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h4 className="text-sm text-gray-700">{ct("依赖此连接的功能模块", "Modules using this connection")}</h4>
              {([
                { label: ct("IM 后端代理", "IM Backend Proxy"), tab: "backendProxy", desc: ct("聊天消息收发、Token生成", "Chat messaging, token generation"), field: "backendProxyConfig.enabled" },
                { label: ct("云端 AI 分析", "Cloud AI Analysis"), tab: "aiModel", desc: ct("病虫害深度分析（通义千问/Gemini/GPT-4o）", "Pest analysis (Qwen/Gemini/GPT-4o)"), field: "cloudAIConfig.enabled" },
                { label: ct("推送服务", "Push Notifications"), tab: "pushProviders", desc: ct("消息推送代理（VAPID/FCM/极光/个推）", "Push proxy (VAPID/FCM/JPush/GeTui)"), field: "pushProvidersConfig" },
                { label: ct("登录认证", "Login Auth"), tab: "loginConfig", desc: ct("OAuth社交登录后端代理", "OAuth social login backend proxy"), field: "loginConfig" },
              ] as const).map((mod) => {
                const isEnabled = mod.field === 'backendProxyConfig.enabled' ? workingConfig.backendProxyConfig?.enabled
                  : mod.field === 'cloudAIConfig.enabled' ? workingConfig.cloudAIConfig?.enabled
                  : true;
                return (
                  <button
                    key={mod.tab}
                    onClick={() => setActiveTab(mod.tab as any)}
                    className="w-full text-start flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-800">{mod.label}</span>
                      <p className="text-[11px] text-gray-400 truncate">{mod.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Security */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800 mb-2">{ct("安全须知", "Security Notes")}</p>
              <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                <li>{ct(
                  "此处只存放 Anon Key（公开），所有 API 密钥/Secret 必须存放在服务端环境变量中（如 Supabase Secrets、Cloudflare 环境变量等）",
                  "Only Anon Key (public) is stored here. All API keys/secrets must be in server-side env vars (Supabase Secrets, Cloudflare env, etc.)"
                )}</li>
                <li>{ct(
                  "Service Role Key 绝对不能放在前端代码中",
                  "Service Role Key must NEVER be in frontend code"
                )}</li>
              </ul>
            </div>

            {/* Remote Config Sync Status */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h4 className="text-sm text-gray-800 flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                {ct("远程配置同步", "Remote Config Sync")}
              </h4>
              <p className="text-[11px] text-gray-500">{ct(
                "正式上线的农民端只会从 Supabase 拉取配置，不会向云端写入。运营商在 Supabase Dashboard 编辑 app_config 后，客户端会随版本号更新。本地保存仍写入 localStorage。开发模式 (npm run dev) 下可从本机尝试推送至 Edge（需函数侧 CONFIG_WRITE_SECRET 或临时 ALLOW_INSECURE）。",
                "Production farmer builds only pull config from Supabase — never push. Operators edit app_config in the Supabase Dashboard; clients pick up changes by version. Local saves still go to localStorage. Dev mode (npm run dev) may POST to Edge for setup (requires CONFIG_WRITE_SECRET or temporary ALLOW_INSECURE on the function)."
              )}</p>

              {/* Sync Status Indicator */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                syncStatus === 'synced' ? 'bg-emerald-50 border-emerald-200' :
                syncStatus === 'syncing' ? 'bg-blue-50 border-blue-200' :
                syncStatus === 'error' || syncStatus === 'conflict' ? 'bg-red-50 border-red-200' :
                syncStatus === 'offline' ? 'bg-amber-50 border-amber-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                {syncStatus === 'synced' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                {syncStatus === 'syncing' && <Loader2 className="w-4 h-4 text-blue-600 flex-shrink-0 animate-spin" />}
                {syncStatus === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                {syncStatus === 'conflict' && <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                {syncStatus === 'offline' && <CloudOff className="w-4 h-4 text-amber-600 flex-shrink-0" />}
                {syncStatus === 'idle' && <Cloud className="w-4 h-4 text-gray-400 flex-shrink-0" />}

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    {syncStatus === 'synced' && ct("已同步", "Synced")}
                    {syncStatus === 'syncing' && ct("同步中...", "Syncing...")}
                    {syncStatus === 'error' && ct("同步失败", "Sync Failed")}
                    {syncStatus === 'conflict' && ct("版本冲突", "Version Conflict")}
                    {syncStatus === 'offline' && ct("离线模式", "Offline")}
                    {syncStatus === 'idle' && ct("未连接远程", "Remote Not Connected")}
                  </p>
                  {lastSyncError && (syncStatus === 'error' || syncStatus === 'conflict') && (
                    <p className="text-[11px] text-red-600 truncate mt-0.5">{lastSyncError}</p>
                  )}
                  {lastSyncTime && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {ct("上次同步", "Last sync")}: {new Date(lastSyncTime).toLocaleTimeString()}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 text-right">
                  {remoteVersion !== null && (
                    <span className="text-[11px] text-gray-400">v{remoteVersion}</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : activeTab === "homeIcons" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h3 className="text-base text-gray-800">{ct("首页功能区配置", "Home Feature Section Config")}</h3>
              <p className="text-xs text-gray-500">{ct(
                "自定义首页三个功能区块的图标、文字。所有字段留空则使用多语言默认值或默认图标。",
                "Customize the icon and text for the three feature sections on the homepage. Leave fields empty to use multilingual defaults or default icons."
              )}</p>
            </div>

            {/* ── 1. AI 助手 ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">1</span>
                <h4 className="text-sm text-gray-800">{ct("AI 助手按钮", "AI Assistant Button")}</h4>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("按钮文字", "Button Label")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.aiAssistantLabel || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.aiAssistantLabel = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用默认：AI 助手", "Leave empty for default: AI Assistant")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("图标URL", "Icon URL")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.aiAssistantIconUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.aiAssistantIconUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用默认机器人图标", "Leave empty for default Bot icon")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">{ct("建议正方形 PNG/SVG，≥64×64px", "Recommend square PNG/SVG, ≥64×64px")}</p>
              </div>
              {workingConfig.homeIcons?.aiAssistantIconUrl && (
                <div className="flex items-center gap-3 pt-1">
                  <img src={workingConfig.homeIcons.aiAssistantIconUrl} alt="preview" className="w-10 h-10 rounded-lg border border-gray-200 object-contain" />
                  <span className="text-xs text-gray-500">{workingConfig.homeIcons?.aiAssistantLabel || ct("AI 助手", "AI Assistant")}</span>
                </div>
              )}
            </div>

            {/* ── 2. 对账单 ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">2</span>
                <h4 className="text-sm text-gray-800">{ct("对账单按钮", "Statement Button")}</h4>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("按钮文字", "Button Label")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.statementLabel || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.statementLabel = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用默认：对账单", "Leave empty for default: Statement")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("图标URL", "Icon URL")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.statementIconUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.statementIconUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用默认计算器图标", "Leave empty for default Calculator icon")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">{ct("建议正方形 PNG/SVG，≥64×64px", "Recommend square PNG/SVG, ≥64×64px")}</p>
              </div>
              {workingConfig.homeIcons?.statementIconUrl && (
                <div className="flex items-center gap-3 pt-1">
                  <img src={workingConfig.homeIcons.statementIconUrl} alt="preview" className="w-10 h-10 rounded-lg border border-gray-200 object-contain" />
                  <span className="text-xs text-gray-500">{workingConfig.homeIcons?.statementLabel || ct("对账单", "Statement")}</span>
                </div>
              )}
            </div>

            {/* ── 3. 直播 / 视频区 ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">3</span>
                <h4 className="text-sm text-gray-800">{ct("直播 / 视频区", "Live / Video Section")}</h4>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("封面标题文字", "Cover Title")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.liveTitle || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.liveTitle = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用第一条直播标题，如：水稻种植技术讲解", "Leave empty for first live stream title")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">{ct("显示在封面图底部的白色标题", "White title shown at the bottom of cover image")}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("角标文字", "Badge Text")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.liveBadge || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.liveBadge = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空使用默认：直播&导航", "Leave empty for default: Live & Navigation")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">{ct("左上角红色脉冲徽章里的文字", "Text inside the red pulsing badge at top-left")}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{ct("封面图URL", "Cover Image URL")}</label>
                <input
                  type="text"
                  value={workingConfig.homeIcons?.liveCoverUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.homeIcons) newConfig.homeIcons = {};
                    newConfig.homeIcons.liveCoverUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("留空自动使用第一条直播的缩略图", "Leave empty for first live stream thumbnail")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">{ct("建议 2:1 横图，≥800×400px", "Recommend 2:1 landscape, ≥800×400px")}</p>
              </div>
              {/* Live Section Preview */}
              {(workingConfig.homeIcons?.liveCoverUrl || workingConfig.homeIcons?.liveTitle || workingConfig.homeIcons?.liveBadge) && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">{ct("预览", "Preview")}</p>
                  <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden border border-gray-200">
                    {workingConfig.homeIcons?.liveCoverUrl ? (
                      <img src={workingConfig.homeIcons.liveCoverUrl} alt="preview" className="w-full h-full object-fill object-center" />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-400">{ct("默认缩略图", "Default thumbnail")}</div>
                    )}
                    <div className="absolute top-1.5 left-1.5 bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1">
                      <span className="w-1 h-1 bg-white rounded-full"></span>
                      {workingConfig.homeIcons?.liveBadge || ct("直播&导航", "Live & Navigation")}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <span className="text-white text-xs">{workingConfig.homeIcons?.liveTitle || ct("水稻种植技术讲解", "Rice Planting Techniques")}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "desktopIcon" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              {/* App Name */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("PWA应用名称", "PWA App Name")}</label>
                <input
                  type="text"
                  value={workingConfig.desktopIcon.appName || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    newConfig.desktopIcon.appName = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="TaprootAgro"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Icon 192 URL */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("192×192 图标链接", "192×192 Icon URL")}</label>
                <input
                  type="text"
                  value={workingConfig.desktopIcon.icon192Url || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    newConfig.desktopIcon.icon192Url = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="https://example.com/icon-192.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
              </div>

              {/* Icon 512 URL */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("512×512 图标链接", "512×512 Icon URL")}</label>
                <input
                  type="text"
                  value={workingConfig.desktopIcon.icon512Url || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    newConfig.desktopIcon.icon512Url = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="https://example.com/icon-512.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
              </div>

              {/* Icon Preview */}
              {workingConfig.desktopIcon.icon192Url && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">{ct("图标预览", "Icon Preview")}</p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <img
                        src={workingConfig.desktopIcon.icon192Url}
                        alt="192px"
                        className="w-12 h-12 rounded-xl border border-gray-200 object-fill object-center"
                      />
                      <span className="text-[10px] text-gray-400">192px</span>
                    </div>
                    {workingConfig.desktopIcon.icon512Url && (
                      <div className="flex flex-col items-center gap-1">
                        <img
                          src={workingConfig.desktopIcon.icon512Url}
                          alt="512px"
                          className="w-16 h-16 rounded-xl border border-gray-200 object-fill object-center"
                        />
                        <span className="text-[10px] text-gray-400">512px</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "aiModel" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("AI 病虫害识别模型配置", "AI Pest & Disease Detection Model Config")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "配置端侧ONNX推理模型和云端AI分析。开启云端AI后，联网时自动使用云端分析；离线或未开启时回退到本地ONNX模型推理。",
                "Configure on-device ONNX inference and cloud AI analysis. When cloud AI is enabled and online, cloud analysis is used; when offline or disabled, falls back to local ONNX model."
              )}</p>

              {/* Mode indicator — based on cloud AI enabled state */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                <div className={`w-2 h-2 rounded-full ${
                  workingConfig.cloudAIConfig?.enabled ? "bg-emerald-500" : "bg-gray-400"
                }`} />
                <span className="text-xs text-gray-600">
                  {workingConfig.cloudAIConfig?.enabled
                    ? ct(
                        "当前模式：联网时使用云端AI分析，离线时自动回退本地推理",
                        "Current mode: Cloud AI when online, auto-fallback to local inference when offline"
                      )
                    : ct(
                        "当前模式：仅本地ONNX模型推理（需配置模型文件）",
                        "Current mode: Local ONNX model inference only (model files required)"
                      )
                  }
                </span>
              </div>

              {/* Local model config — always show, as it's the offline fallback */}

              {/* Model URL */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("ONNX 模型文件 URL", "ONNX Model File URL")}</label>
                <input
                  type="text"
                  value={workingConfig.aiModelConfig?.modelUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.aiModelConfig) newConfig.aiModelConfig = { modelUrl: "", labelsUrl: "" };
                    newConfig.aiModelConfig.modelUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="https://cdn.example.com/models/taprootagro.onnx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "支持任何可公开访问的URL（如 OSS、CDN、GitHub Release 等），文件格式需为 ONNX",
                  "Supports any publicly accessible URL (OSS, CDN, GitHub Release, etc.), file must be in ONNX format"
                )}</p>
              </div>

              {/* Labels URL */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("标签文件 URL", "Labels File URL")}</label>
                <input
                  type="text"
                  value={workingConfig.aiModelConfig?.labelsUrl || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.aiModelConfig) newConfig.aiModelConfig = { modelUrl: "", labelsUrl: "" };
                    newConfig.aiModelConfig.labelsUrl = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="https://cdn.example.com/models/labels.json"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "JSON 数组格式，例如：[\"稻瘟病\",\"白粉病\",\"蚜虫\",...]",
                  "JSON array format, e.g.: [\"Rice Blast\",\"Powdery Mildew\",\"Aphids\",...]"
                )}</p>
              </div>

              {/* Status indicator */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    (workingConfig.aiModelConfig?.modelUrl && workingConfig.aiModelConfig.modelUrl.startsWith("http"))
                      ? "bg-emerald-500"
                      : "bg-gray-300"
                  }`} />
                  <span className="text-xs text-gray-600">
                    {(workingConfig.aiModelConfig?.modelUrl && workingConfig.aiModelConfig.modelUrl.startsWith("http"))
                      ? ct("已配置远程模型", "Remote model configured")
                      : ct("未配置（将使用本地文件或演示模式）", "Not configured (will use local files or demo mode)")
                    }
                  </span>
                </div>
              </div>

              {/* Help section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-blue-800 mb-2">{ct("使用指南：", "Usage Guide:")}</p>
                <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
                  <li>{ct(
                    "用你的病虫害数据集训练检测模型",
                    "Train your pest & disease detection model with your dataset"
                  )}</li>
                  <li>{ct(
                    "导出为 ONNX：python export_model.py --format onnx --imgsz 640",
                    "Export to ONNX: python export_model.py --format onnx --imgsz 640"
                  )}</li>
                  <li>{ct(
                    "将 .onnx 和 labels.json 上传到你的 CDN 或对象存储",
                    "Upload .onnx and labels.json to your CDN or object storage"
                  )}</li>
                  <li>{ct(
                    "将 URL 填入上方输入框，保存配置即可生效",
                    "Paste the URLs into the fields above, save config to apply"
                  )}</li>
                </ol>
              </div>

            </div>

            {/* Cloud AI Deep Analysis Config Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("云端AI分析配置（后端代理模式）", "Cloud AI Analysis Config (Backend Proxy)")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "配置云端大模型（如通义千问、Gemini、GPT-4o）。开启后联网时自动使用云端AI分析照片，离线时自动回退本地推理。前端永远不接触API密钥——所有密钥保存在Supabase Edge Function的服务端环境变量中。",
                "Configure a cloud vision model (Qwen, Gemini, GPT-4o, etc.). When enabled and online, cloud AI analyzes photos automatically; offline auto-fallback to local inference. Frontend never touches API keys — all secrets are server-side Supabase Edge Function env vars."
              )}</p>

              {/* Enabled Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="block text-sm text-gray-700">{ct("启用云端AI分析", "Enable Cloud AI Analysis")}</label>
                  <p className="text-[11px] text-gray-400">{ct("开启：联网时直接使用云端AI；关闭：仅使用本地模型推理", "On: use cloud AI when online. Off: local model inference only")}</p>
                </div>
                <button
                  onClick={() => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "通义千问", edgeFunctionName: "ai-vision-proxy", modelId: "qwen-vl-plus", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.enabled = !newConfig.cloudAIConfig.enabled;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    workingConfig.cloudAIConfig?.enabled ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    workingConfig.cloudAIConfig?.enabled ? "translate-x-6" : "translate-x-0.5"
                  }`} />
                </button>
              </div>

              {/* Provider Name */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("模型提供商显示名称", "Provider Display Name")}</label>
                <input
                  type="text"
                  value={workingConfig.cloudAIConfig?.providerName || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "", edgeFunctionName: "ai-vision-proxy", modelId: "", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.providerName = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("例如：通义千问、Gemini、GPT-4o", "e.g. Qwen, Gemini, GPT-4o")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct("用于UI显示，让用户知道使用的是哪个AI模型", "Shown in UI so users know which AI model is used")}</p>
              </div>

              {/* Edge Function Name */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("Edge Function 名称", "Edge Function Name")}</label>
                <input
                  type="text"
                  value={workingConfig.cloudAIConfig?.edgeFunctionName || "ai-vision-proxy"}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "", edgeFunctionName: "", modelId: "", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.edgeFunctionName = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder="ai-vision-proxy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "Supabase Edge Function 名称，对应 supabase/functions/ai-vision-proxy/index.ts",
                  "Supabase Edge Function name, maps to supabase/functions/ai-vision-proxy/index.ts"
                )}</p>
              </div>

              {/* Model ID */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("模型标识 (Model ID)", "Model ID")}</label>
                <input
                  type="text"
                  value={workingConfig.cloudAIConfig?.modelId || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "", edgeFunctionName: "ai-vision-proxy", modelId: "", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.modelId = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  placeholder={ct("例如：qwen-vl-plus, gemini-2.0-flash, gpt-4o", "e.g. qwen-vl-plus, gemini-2.0-flash, gpt-4o")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "传给 Edge Function 的模型标识，由 Edge Function 路由到对应的 API",
                  "Passed to Edge Function, which routes to the correct provider API"
                )}</p>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("系统提示词 (System Prompt)", "System Prompt")}</label>
                <textarea
                  value={workingConfig.cloudAIConfig?.systemPrompt || ""}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "", edgeFunctionName: "ai-vision-proxy", modelId: "", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.systemPrompt = e.target.value;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  rows={4}
                  placeholder={ct(
                    "你是一个农业病虫害专家。请分析图片中的作物病虫害情况，给出详细的诊断、严重程度评估和防治建议...",
                    "You are an agricultural pest & disease expert. Analyze the crop image, provide detailed diagnosis, severity assessment, and treatment recommendations..."
                  )}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "自定义系统提示词，可针对特定作物或地区调整分析侧重点。留空则使用Edge Function默认提示词",
                  "Customize the system prompt for specific crops or regions. Leave empty to use Edge Function defaults"
                )}</p>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">{ct("最大输出长度 (Max Tokens)", "Max Output Tokens")}</label>
                <input
                  type="number"
                  value={workingConfig.cloudAIConfig?.maxTokens || 512}
                  onChange={(e) => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.cloudAIConfig) newConfig.cloudAIConfig = { enabled: false, providerName: "", edgeFunctionName: "ai-vision-proxy", modelId: "", systemPrompt: "", maxTokens: 512 };
                    newConfig.cloudAIConfig.maxTokens = parseInt(e.target.value) || 512;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  min={128}
                  max={4096}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="mt-1 text-[11px] text-gray-400">{ct(
                  "控制AI生成的分析报告长度，建议 512-2048",
                  "Controls the length of AI-generated reports. Recommended: 512-2048"
                )}</p>
              </div>

              {/* Status indicator */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    workingConfig.cloudAIConfig?.enabled
                      ? "bg-violet-500"
                      : "bg-gray-300"
                  }`} />
                  <span className="text-xs text-gray-600">
                    {workingConfig.cloudAIConfig?.enabled
                      ? ct(
                          `已启用 — ${workingConfig.cloudAIConfig?.providerName || "Cloud AI"} (${workingConfig.cloudAIConfig?.modelId || "未设置"})`,
                          `Enabled — ${workingConfig.cloudAIConfig?.providerName || "Cloud AI"} (${workingConfig.cloudAIConfig?.modelId || "not set"})`
                        )
                      : ct("未启用（深度分析按钮将使用Mock模式演示）", "Disabled (Deep Analysis button will use Mock mode demo)")
                    }
                  </span>
                </div>
              </div>

              {/* Architecture + Security */}
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-violet-800 mb-2">{ct("后端代理架构：", "Backend Proxy Architecture:")}</p>
                <div className="font-mono text-[10px] text-violet-600 space-y-1 bg-white rounded-lg p-3 border border-violet-100">
                  <p>{ct("用户点击\"深度分析\"", "User clicks 'Deep Analysis'")}</p>
                  <p className="text-violet-400">{"  ↓ image + detection results"}</p>
                  <p>CloudAIService (fetch)</p>
                  <p className="text-violet-400">{"  ↓ POST /functions/v1/ai-vision-proxy"}</p>
                  <p className="text-violet-700">{ct("Supabase Edge Function", "Supabase Edge Function")}</p>
                  <p className="text-violet-400">{"  ↓ QWEN_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY"}</p>
                  <p className="text-blue-600">{ct("云端大模型 API", "Cloud LLM API")}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800 mb-2">{ct("安全提醒：", "Security Reminder:")}</p>
                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                  <li>{ct(
                    "所有云AI的API密钥（如QWEN_API_KEY、GEMINI_API_KEY）必须作为Supabase Edge Function的Secrets配置",
                    "All cloud AI API keys (QWEN_API_KEY, GEMINI_API_KEY, etc.) must be Supabase Edge Function Secrets"
                  )}</li>
                  <li>{ct(
                    "此处只配置显示名称和模型标识，不涉及任何密钥",
                    "This config only stores display name and model ID — no secrets involved"
                  )}</li>
                  <li>{ct(
                    "需要先在\"后端代理\"Tab配置好Supabase URL和Anon Key",
                    "Supabase URL and Anon Key must be configured in the 'Backend Proxy' tab first"
                  )}</li>
                </ul>
              </div>

              {/* Edge Function Template */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-blue-800 mb-2">{ct("Edge Function 部署参考：", "Edge Function Deployment Reference:")}</p>
                <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
                  <li>{ct(
                    "创建 supabase/functions/ai-vision-proxy/index.ts",
                    "Create supabase/functions/ai-vision-proxy/index.ts"
                  )}</li>
                  <li>{ct(
                    "在 Edge Function 中读取 Deno.env.get('QWEN_API_KEY') 等密钥",
                    "Read secrets via Deno.env.get('QWEN_API_KEY') in the Edge Function"
                  )}</li>
                  <li>{ct(
                    "接收前端传来的 { image, detections, modelId, systemPrompt, maxTokens }",
                    "Receive { image, detections, modelId, systemPrompt, maxTokens } from frontend"
                  )}</li>
                  <li>{ct(
                    "根据 modelId 路由到对应的云AI API（千问/Gemini/OpenAI）",
                    "Route to the correct cloud API based on modelId (Qwen/Gemini/OpenAI)"
                  )}</li>
                  <li>{ct(
                    "返回 { analysis: '...markdown text...', confidence: 0.92, suggestions: [...] }",
                    "Return { analysis: '...markdown text...', confidence: 0.92, suggestions: [...] }"
                  )}</li>
                </ol>
              </div>
            </div>
          </div>
        ) : activeTab === "backendProxy" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("IM 通讯配置（SDK 直连）", "IM Chat Config (SDK Direct)")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "选择 IM 服务商并填入 App ID。消息通过服务商客户端 SDK 的 WebSocket 直接收发，延迟最低。API Key/Secret 保存在服务商控制台或你的 Token 生成后端中，绝不放在前端。",
                "Select an IM provider and enter App ID. Messages are sent/received directly via the provider's client SDK WebSocket for lowest latency. API Key/Secret stays in the provider console or your token generation backend, never in frontend."
              )}</p>

              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{ct("启用 IM 直连", "Enable IM Direct")}</span>
                <button
                  onClick={() => {
                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                    if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                    newConfig.backendProxyConfig.enabled = !newConfig.backendProxyConfig.enabled;
                    setWorkingConfig(newConfig);
                    setHasChanges(true);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    workingConfig.backendProxyConfig?.enabled ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    workingConfig.backendProxyConfig?.enabled ? "translate-x-6" : "translate-x-0.5"
                  }`} />
                </button>
              </div>

              {/* IM Mode badge — fixed to im-provider-direct */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-violet-400 bg-violet-50 ring-2 ring-violet-400">
                <span className="text-lg">{"🔗"}</span>
                <div>
                  <span className="text-sm text-gray-900">{ct("IM 服务商 SDK 直连", "IM Provider SDK Direct")}</span>
                  <p className="text-[11px] text-gray-500 mt-0.5">{ct(
                    "加载服务商客户端 SDK，消息走 WebSocket 直连。延迟最低，无中间代理",
                    "Load provider client SDK, messages via direct WebSocket. Lowest latency, no proxy layer"
                  )}</p>
                </div>
              </div>

              {/* IM Provider Selection */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">{ct("IM 服务商", "IM Provider")}</label>
                <div className="grid grid-cols-1 gap-2">
                  {([
                    { key: 'tencent-im' as const, name: ct('腾讯云即时通信', 'Tencent IM'), icon: '💬', color: 'border-sky-400 bg-sky-50', activeColor: 'ring-sky-400', desc: ct('全球覆盖，支持亿级用户，音视频通话完善', 'Global coverage, billion-scale users, full AV calls') },
                    { key: 'cometchat' as const, name: 'CometChat', icon: '🚀', color: 'border-blue-400 bg-blue-50', activeColor: 'ring-blue-400', desc: ct('开箱即用，内置AI机器人，快速集成', 'Plug & play, built-in AI bots, fast integration') },
                  ] as const).map((provider) => {
                    const isActive = (workingConfig.backendProxyConfig?.chatProvider || 'tencent-im') === provider.key;
                    return (
                      <button
                        key={provider.key}
                        onClick={() => {
                          const newConfig = JSON.parse(JSON.stringify(workingConfig));
                          if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                          newConfig.backendProxyConfig.chatProvider = provider.key;
                          setWorkingConfig(newConfig);
                          setHasChanges(true);
                        }}
                        className={`w-full text-start px-3 py-3 rounded-xl border-2 transition-all ${
                          isActive
                            ? `${provider.color} ${provider.activeColor} ring-2`
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{provider.icon}</span>
                          <span className={`text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>{provider.name}</span>
                          {isActive && <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{ct("已选", "Active")}</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 ms-7">{provider.desc}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5 ms-7">
                          {['Text', 'Image', 'Voice', 'Audio Call', 'Video Call'].map(f => (
                            <span key={f} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{f}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Provider-specific App ID */}
              {(workingConfig.backendProxyConfig?.chatProvider || 'tencent-im') === 'tencent-im' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{ct("腾讯云 SDKAppID（公开）", "Tencent IM SDKAppID (public)")}</label>
                  <input
                    type="text"
                    value={workingConfig.backendProxyConfig?.tencentAppId || ""}
                    onChange={(e) => {
                      const newConfig = JSON.parse(JSON.stringify(workingConfig));
                      if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                      newConfig.backendProxyConfig.tencentAppId = e.target.value;
                      setWorkingConfig(newConfig);
                      setHasChanges(true);
                    }}
                    placeholder="your-tencent-sdkappid"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">{ct(
                    "App ID 用于客户端 SDK 初始化（公开）。SecretKey 保存在你的 Token 生成后端中，绝不放在前端",
                    "App ID is for client SDK init (public). SecretKey stays in your token generation backend, never in frontend"
                  )}</p>
                </div>
              )}

              {(workingConfig.backendProxyConfig?.chatProvider || 'tencent-im') === 'cometchat' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{ct("CometChat App ID（公开）", "CometChat App ID (public)")}</label>
                    <input
                      type="text"
                      value={workingConfig.backendProxyConfig?.cometchatAppId || ""}
                      onChange={(e) => {
                        const newConfig = JSON.parse(JSON.stringify(workingConfig));
                        if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                        newConfig.backendProxyConfig.cometchatAppId = e.target.value;
                        setWorkingConfig(newConfig);
                        setHasChanges(true);
                      }}
                      placeholder="your-cometchat-app-id"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">{ct("CometChat Region", "CometChat Region")}</label>
                    <select
                      value={workingConfig.backendProxyConfig?.cometchatRegion || "us"}
                      onChange={(e) => {
                        const newConfig = JSON.parse(JSON.stringify(workingConfig));
                        if (!newConfig.backendProxyConfig) newConfig.backendProxyConfig = { supabaseUrl: "", supabaseAnonKey: "", enabled: false, chatProvider: "tencent-im", imMode: "im-provider-direct", tencentAppId: "", cometchatAppId: "", cometchatRegion: "us" };
                        newConfig.backendProxyConfig.cometchatRegion = e.target.value;
                        setWorkingConfig(newConfig);
                        setHasChanges(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                    >
                      <option value="us">US (United States)</option>
                      <option value="eu">EU (Europe)</option>
                      <option value="in">IN (India)</option>
                      <option value="sg">SG (Singapore)</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400">{ct(
                    "App ID 和 Region 用于 CometChat SDK 初始化（公开）。API Key 保存在你的 Token 生成后端中",
                    "App ID and Region are for CometChat SDK init (public). API Key stays in your token generation backend"
                  )}</p>
                </div>
              )}

              {/* Supabase Connection (for Token endpoint only) */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm text-gray-700">{ct("Supabase 连接（Token 端点）", "Supabase Connection (Token Endpoint)")}</h4>
                  <button
                    onClick={() => setActiveTab('supabase')}
                    className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                  >
                    {ct("前往配置 →", "Go to config →")}
                  </button>
                </div>
                <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                  (workingConfig.backendProxyConfig?.supabaseUrl || '').startsWith('https://') && (workingConfig.backendProxyConfig?.supabaseAnonKey || '').length > 20
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    (workingConfig.backendProxyConfig?.supabaseUrl || '').startsWith('https://') && (workingConfig.backendProxyConfig?.supabaseAnonKey || '').length > 20 ? 'bg-emerald-500' : 'bg-gray-300'
                  }`} />
                  <span className="truncate font-mono">{workingConfig.backendProxyConfig?.supabaseUrl || ct('未配置', 'Not configured')}</span>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">{ct(
                  "Supabase 仅用于 Token 生成端点（chat-token），消息直接走 IM SDK WebSocket",
                  "Supabase is only used for Token generation endpoint (chat-token). Messages go directly via IM SDK WebSocket"
                )}</p>
              </div>

              {/* Status indicator */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    (workingConfig.backendProxyConfig?.enabled && workingConfig.backendProxyConfig?.supabaseUrl?.startsWith("https://"))
                      ? "bg-emerald-500"
                      : workingConfig.backendProxyConfig?.enabled
                        ? "bg-amber-500"
                        : "bg-gray-300"
                  }`} />
                  <span className="text-xs text-gray-600">
                    {workingConfig.backendProxyConfig?.enabled
                      ? (workingConfig.backendProxyConfig?.supabaseUrl?.startsWith("https://")
                          ? ct(
                              `已启用 — ${workingConfig.backendProxyConfig?.chatProvider === 'cometchat' ? 'CometChat' : '腾讯IM'} SDK 直连`,
                              `Enabled — ${workingConfig.backendProxyConfig?.chatProvider === 'cometchat' ? 'CometChat' : 'Tencent IM'} SDK Direct`
                            )
                          : ct("已启用但 URL 无效，请填写正确的 Supabase URL", "Enabled but URL invalid, please enter correct Supabase URL"))
                      : ct("未启用（Mock 模式 — 聊天和通话仅在本地模拟）", "Disabled (Mock Mode — chat and calls are simulated locally)")
                    }
                  </span>
                </div>
              </div>

              {/* Architecture Diagram — SDK Direct */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-gray-700 mb-3">{ct("SDK 直连架构：", "SDK Direct Architecture:")}</p>
                <div className="font-mono text-[10px] text-gray-600 space-y-1 bg-white rounded-lg p-3 border border-gray-100">
                  <p>{ct("前端 CommunityPage", "Frontend CommunityPage")}</p>
                  <p className="text-gray-400">{"  ↓ IMProviderDirectAdapter"}</p>
                  <p className="text-violet-600">{ct("IM SDK（CometChat / 腾讯IM）", "IM SDK (CometChat / Tencent IM)")}</p>
                  <p className="text-gray-400">{"  ↕ WebSocket"}</p>
                  <p className="text-blue-600">
                    {(workingConfig.backendProxyConfig?.chatProvider || 'tencent-im') === 'tencent-im'
                      ? ct("腾讯云 IM 服务器（消息 + 音视频 + 推送）", "Tencent IM Cloud (Msg + AV + Push)")
                      : ct("CometChat 服务器（消息 + 音视频 + 推送）", "CometChat Cloud (Msg + AV + Push)")
                    }
                  </p>
                  <p className="text-gray-300 mt-2">{"---"}</p>
                  <p className="text-gray-400">{ct("Token 生成（仅初始化时）：", "Token generation (init only):")}</p>
                  <p className="text-gray-500">{ct("前端", "Frontend")} {"→"} {ct("Token 后端", "Token Backend")} {"→"} {ct("IM 服务商 Token API", "IM Provider Token API")}</p>
                </div>
              </div>

              {/* Security Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800 mb-2">{ct("安全提醒：", "Security Reminder:")}</p>
                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                  <li>{ct(
                    "IM 服务商的 API Key/Secret 必须保存在你的 Token 生成后端中，绝不放在前端",
                    "IM provider API Key/Secret must stay in your token generation backend, never in frontend"
                  )}</li>
                  <li>{ct(
                    "App ID 是公开的（用于 SDK 初始化），可安全放在此处配置",
                    "App ID is public (for SDK init) and safe to configure here"
                  )}</li>
                  <li>{ct(
                    "消息通过 IM SDK WebSocket 直连服务商，不经过任何中间层",
                    "Messages go via IM SDK WebSocket directly to the provider, no intermediate layer"
                  )}</li>
                </ul>
              </div>

              {/* Setup Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-blue-800 mb-2">{ct("部署步骤：", "Deployment Steps:")}</p>
                <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
                  <li>{ct(
                    "在所选 IM 服务商控制台创建应用，获取 App ID",
                    "Create app in your chosen IM provider console, get App ID"
                  )}</li>
                  <li>{ct(
                    "部署 Token 生成后端（可用 Supabase Edge Function、Cloudflare Worker 或任意服务端）",
                    "Deploy a token generation backend (Supabase Edge Function, Cloudflare Worker, or any server)"
                  )}</li>
                  <li>{ct(
                    "在 Token 后端中配置 IM 服务商的 API Key/Secret",
                    "Configure IM provider API Key/Secret in your token backend"
                  )}</li>
                  <li>{ct(
                    "在上方填写 App ID 和 Supabase URL，然后开启启用开关",
                    "Fill in App ID and Supabase URL above, then toggle Enable switch"
                  )}</li>
                </ol>
              </div>
            </div>
          </div>
        ) : activeTab === "loginConfig" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("登录页面配置", "Login Page Config")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "配置登录页面显示的社交登录方式、OAuth凭证和账号登录方式。开启提供商后可展开填写OAuth凭证。",
                "Configure social login providers, OAuth credentials, and account login methods. Expand an enabled provider to fill in OAuth credentials."
              )}</p>

              {/* Social Providers with OAuth Credentials */}
              <div className="space-y-2">
                <h4 className="text-sm text-gray-700 font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  {ct("社交登录方式 & OAuth 凭证", "Social Login Providers & OAuth Credentials")}
                </h4>
                {([
                  { key: 'wechat' as const, label: ct("微信 WeChat", "WeChat"), color: "bg-[#07C160]",
                    fields: [
                      { fieldKey: 'appId', label: 'App ID', placeholder: 'wx1234567890abcdef' }
                    ]
                  },
                  { key: 'google' as const, label: "Google", color: "bg-[#4285F4]",
                    fields: [
                      { fieldKey: 'clientId', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' }
                    ]
                  },
                  { key: 'facebook' as const, label: "Facebook", color: "bg-[#1877F2]",
                    fields: [
                      { fieldKey: 'appId', label: 'App ID', placeholder: '1234567890123456' }
                    ]
                  },
                  { key: 'apple' as const, label: "Apple", color: "bg-black",
                    fields: [
                      { fieldKey: 'serviceId', label: 'Service ID', placeholder: 'com.example.app' },
                      { fieldKey: 'teamId', label: 'Team ID', placeholder: 'ABCDE12345' },
                      { fieldKey: 'keyId', label: 'Key ID', placeholder: 'FGHIJ67890' }
                    ]
                  },
                  { key: 'alipay' as const, label: ct("支付宝 Alipay", "Alipay"), color: "bg-[#1678FF]",
                    fields: [
                      { fieldKey: 'appId', label: 'App ID', placeholder: '2021001100000000' }
                    ]
                  },
                  { key: 'twitter' as const, label: "X (Twitter)", color: "bg-black",
                    fields: [
                      { fieldKey: 'apiKey', label: 'API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxx' }
                    ]
                  },
                  { key: 'line' as const, label: "LINE", color: "bg-[#00B900]",
                    fields: [
                      { fieldKey: 'channelId', label: 'Channel ID', placeholder: '1234567890' }
                    ]
                  }
                ]).map(provider => {
                  const isEnabled = workingConfig.loginConfig?.socialProviders?.[provider.key] !== false;
                  const isExpanded = expandedOAuthProvider === provider.key;
                  const credentials = workingConfig.loginConfig?.oauthCredentials?.[provider.key] || {};
                  const hasCredentials = Object.values(credentials).some((v: any) => v && v.length > 0 && !v.startsWith('your-'));

                  return (
                    <div key={provider.key} className={`border rounded-xl overflow-hidden transition-colors ${isEnabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                      {/* Provider Header Row */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-7 h-7 ${provider.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white text-[10px]">{provider.key === 'wechat' ? 'WX' : provider.key === 'google' ? 'G' : provider.key === 'facebook' ? 'f' : provider.key === 'apple' ? '' : provider.key === 'alipay' ? 'AP' : provider.key === 'twitter' ? 'X' : 'L'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-800">{provider.label}</span>
                            {isEnabled && hasCredentials && (
                              <span className="ms-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700">
                                {ct('已配置', 'Configured')}
                              </span>
                            )}
                            {isEnabled && !hasCredentials && (
                              <span className="ms-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                                {ct('待配置', 'Pending')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Expand/Collapse Button - only when enabled */}
                          {isEnabled && (
                            <button
                              onClick={() => setExpandedOAuthProvider(isExpanded ? null : provider.key)}
                              className="p-1 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
                              title={ct('展开OAuth配置', 'Expand OAuth Config')}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          {/* Toggle Switch */}
                          <button
                            onClick={() => {
                              const newConfig = JSON.parse(JSON.stringify(workingConfig));
                              if (!newConfig.loginConfig) newConfig.loginConfig = { socialProviders: { wechat: true, google: true, facebook: true, apple: true, alipay: true, twitter: true, line: true }, oauthCredentials: {}, enablePhoneLogin: true, enableEmailLogin: true, defaultLoginMethod: 'phone' };
                              if (!newConfig.loginConfig.socialProviders) newConfig.loginConfig.socialProviders = { wechat: true, google: true, facebook: true, apple: true, alipay: true, twitter: true, line: true };
                              newConfig.loginConfig.socialProviders[provider.key] = !newConfig.loginConfig.socialProviders[provider.key];
                              if (!newConfig.loginConfig.socialProviders[provider.key]) {
                                setExpandedOAuthProvider(prev => prev === provider.key ? null : prev);
                              }
                              setWorkingConfig(newConfig);
                              setHasChanges(true);
                            }}
                            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                              isEnabled ? "bg-emerald-500" : "bg-gray-300"
                            }`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                              isEnabled ? "translate-x-6" : "translate-x-0.5"
                            }`} />
                          </button>
                        </div>
                      </div>

                      {/* OAuth Credentials Form - Expandable */}
                      {isEnabled && isExpanded && (
                        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-gray-500">{ct(
                              '填写从开发者平台获取的OAuth凭证，保存后将通过Edge Function后端代理安全处理。',
                              'Enter OAuth credentials from the developer platform. These will be securely handled via Edge Function backend proxy.'
                            )}</p>
                          </div>

                          {provider.fields.map(field => {
                            const currentValue = (credentials as any)?.[field.fieldKey] || '';

                            return (
                              <div key={field.fieldKey}>
                                <label className="block text-xs text-gray-600 mb-1">{field.label}</label>
                                <input
                                  type="text"
                                  value={currentValue}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.loginConfig) newConfig.loginConfig = { socialProviders: {}, oauthCredentials: {}, enablePhoneLogin: true, enableEmailLogin: true, defaultLoginMethod: 'phone' };
                                    if (!newConfig.loginConfig.oauthCredentials) newConfig.loginConfig.oauthCredentials = {};
                                    if (!newConfig.loginConfig.oauthCredentials[provider.key]) {
                                      newConfig.loginConfig.oauthCredentials[provider.key] = {};
                                    }
                                    newConfig.loginConfig.oauthCredentials[provider.key][field.fieldKey] = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder={field.placeholder}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 bg-gray-50 font-mono"
                                  autoComplete="off"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Account Login Methods */}
              <div className="space-y-3 pt-3 border-t border-gray-200">
                <h4 className="text-sm text-gray-700 font-medium">{ct("账号登录方式", "Account Login Methods")}</h4>

                {/* Phone Login Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm text-gray-700">{ct("手机号登录", "Phone Login")}</label>
                    <p className="text-[11px] text-gray-400">{ct("通过手机号 + 验证码登录", "Login via phone number + verification code")}</p>
                  </div>
                  <button
                    onClick={() => {
                      const newConfig = JSON.parse(JSON.stringify(workingConfig));
                      if (!newConfig.loginConfig) newConfig.loginConfig = { socialProviders: { wechat: true, google: true, facebook: true, apple: true, alipay: true, twitter: true, line: true }, oauthCredentials: {}, enablePhoneLogin: true, enableEmailLogin: true, defaultLoginMethod: 'phone' };
                      newConfig.loginConfig.enablePhoneLogin = !newConfig.loginConfig.enablePhoneLogin;
                      if (!newConfig.loginConfig.enablePhoneLogin && newConfig.loginConfig.defaultLoginMethod === 'phone') {
                        newConfig.loginConfig.defaultLoginMethod = 'email';
                      }
                      setWorkingConfig(newConfig);
                      setHasChanges(true);
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      workingConfig.loginConfig?.enablePhoneLogin !== false ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      workingConfig.loginConfig?.enablePhoneLogin !== false ? "translate-x-6" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                {/* Email Login Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm text-gray-700">{ct("邮箱登录", "Email Login")}</label>
                    <p className="text-[11px] text-gray-400">{ct("通过邮箱 + 验证码登录", "Login via email + verification code")}</p>
                  </div>
                  <button
                    onClick={() => {
                      const newConfig = JSON.parse(JSON.stringify(workingConfig));
                      if (!newConfig.loginConfig) newConfig.loginConfig = { socialProviders: { wechat: true, google: true, facebook: true, apple: true, alipay: true, twitter: true, line: true }, oauthCredentials: {}, enablePhoneLogin: true, enableEmailLogin: true, defaultLoginMethod: 'phone' };
                      newConfig.loginConfig.enableEmailLogin = !newConfig.loginConfig.enableEmailLogin;
                      if (!newConfig.loginConfig.enableEmailLogin && newConfig.loginConfig.defaultLoginMethod === 'email') {
                        newConfig.loginConfig.defaultLoginMethod = 'phone';
                      }
                      setWorkingConfig(newConfig);
                      setHasChanges(true);
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      workingConfig.loginConfig?.enableEmailLogin !== false ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      workingConfig.loginConfig?.enableEmailLogin !== false ? "translate-x-6" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                {/* Default Login Method */}
                <div className="pt-2">
                  <label className="block text-sm text-gray-700 mb-1">{ct("默认登录方式", "Default Login Method")}</label>
                  <div className="flex gap-2">
                    {[
                      { key: 'phone' as const, label: ct("手机号", "Phone") },
                      { key: 'email' as const, label: ct("邮箱", "Email") }
                    ].map(method => (
                      <button
                        key={method.key}
                        onClick={() => {
                          const newConfig = JSON.parse(JSON.stringify(workingConfig));
                          if (!newConfig.loginConfig) newConfig.loginConfig = { socialProviders: { wechat: true, google: true, facebook: true, apple: true, alipay: true, twitter: true, line: true }, oauthCredentials: {}, enablePhoneLogin: true, enableEmailLogin: true, defaultLoginMethod: 'phone' };
                          newConfig.loginConfig.defaultLoginMethod = method.key;
                          setWorkingConfig(newConfig);
                          setHasChanges(true);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                          (workingConfig.loginConfig?.defaultLoginMethod || 'phone') === method.key
                            ? "bg-emerald-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{ct(
                    "用户打开登录页时默认选中的登录方式",
                    "The login method selected by default when the user opens the login page"
                  )}</p>
                </div>
              </div>

              {/* Preview Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-blue-800 mb-2">{ct("当前预览：", "Current Preview:")}</p>
                <div className="text-[11px] text-blue-700 space-y-1">
                  <p>{ct("社交登录：", "Social Login: ")}
                    {(['wechat', 'google', 'facebook', 'apple', 'alipay', 'twitter', 'line'] as const)
                      .filter(k => workingConfig.loginConfig?.socialProviders?.[k] !== false)
                      .map(k => {
                        const name = { wechat: 'WeChat', google: 'Google', facebook: 'Facebook', apple: 'Apple', alipay: 'Alipay', twitter: 'X', line: 'LINE' }[k];
                        const creds = workingConfig.loginConfig?.oauthCredentials?.[k] || {};
                        const configured = Object.values(creds).some((v: any) => v && v.length > 0 && !v.startsWith('your-'));
                        return configured ? `${name} ✓` : `${name} ○`;
                      })
                      .join(', ') || ct('无', 'None')}
                  </p>
                  <p>{ct("账号登录：", "Account Login: ")}
                    {[
                      workingConfig.loginConfig?.enablePhoneLogin !== false ? ct('手机号', 'Phone') : null,
                      workingConfig.loginConfig?.enableEmailLogin !== false ? ct('邮箱', 'Email') : null
                    ].filter(Boolean).join(', ') || ct('无', 'None')}
                  </p>
                  <p className="text-[10px] text-blue-500 mt-1">{ct('✓ = 凭证已填写　○ = 凭证待配置', '✓ = Credentials configured　○ = Credentials pending')}</p>
                </div>
              </div>

              {/* Security & Deployment Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800 mb-2 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {ct("安全与部署提醒：", "Security & Deployment Reminder:")}
                </p>
                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                  <li>{ct(
                    "OAuth公开标识（App ID / Client ID）保存在本地配置中，Secret/Private Key应通过Supabase Edge Function环境变量（Secrets）单独管理",
                    "Public OAuth identifiers (App ID / Client ID) are saved locally. Secrets/Private Keys should be managed separately via Supabase Edge Function environment variables (Secrets)"
                  )}</li>
                  <li>{ct(
                    "部署后认证流程由Supabase Edge Function后端代理处理，前端不直接接触API密钥",
                    "After deployment, authentication is handled by Supabase Edge Functions (backend proxy) — the frontend never directly uses API keys"
                  )}</li>
                  <li>{ct(
                    "建议只启用目标市场常用的登录方式（如国内市场：微信+手机号；海外市场：Google+Apple+Email）",
                    "Enable only login methods common in your target market (e.g. China: WeChat+Phone; International: Google+Apple+Email)"
                  )}</li>
                </ul>
              </div>
            </div>
          </div>
        ) : activeTab === "pushProviders" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="text-base text-gray-800 mb-2">{ct("推送服务商配置", "Push Notification Provider Config")}</h3>
              <p className="text-xs text-gray-500 -mt-2">{ct(
                "选择并配置推送通知服务商。公钥/App ID 放在前端安全使用，私钥/Master Secret 必须存放在后端（Edge Function Secrets）。同一时间只激活一个服务商。",
                "Select and configure push notification providers. Public keys/App IDs are safe for frontend. Private keys/Master Secrets must be stored server-side (Edge Function Secrets). Only one provider is active at a time."
              )}</p>

              {/* Provider Cards */}
              <div className="space-y-3">
                {([
                  {
                    key: 'webpush' as const,
                    name: 'Web Push (VAPID)',
                    icon: '🌐',
                    color: 'border-blue-400 bg-blue-50',
                    activeColor: 'ring-blue-400',
                    desc: ct('W3C标准，无需第三方SDK，浏览器原生支持', 'W3C standard, no third-party SDK, native browser support'),
                    region: ct('全球', 'Global'),
                  },
                  {
                    key: 'fcm' as const,
                    name: 'Firebase Cloud Messaging',
                    icon: '🔥',
                    color: 'border-orange-400 bg-orange-50',
                    activeColor: 'ring-orange-400',
                    desc: ct('Google推送服务，免费无限量，支持Web/iOS/Android', 'Google push service, free unlimited, supports Web/iOS/Android'),
                    region: ct('全球（中国大陆不可用）', 'Global (not available in mainland China)'),
                  },
                  {
                    key: 'onesignal' as const,
                    name: 'OneSignal',
                    icon: '📡',
                    color: 'border-purple-400 bg-purple-50',
                    activeColor: 'ring-purple-400',
                    desc: ct('专业推送平台，免费额度大，自动分段推送', 'Professional push platform, generous free tier, auto-segmentation'),
                    region: ct('全球', 'Global'),
                  },
                  {
                    key: 'jpush' as const,
                    name: ct('极光推送 JPush', 'JPush'),
                    icon: '⚡',
                    color: 'border-yellow-400 bg-yellow-50',
                    activeColor: 'ring-yellow-400',
                    desc: ct('国内主流推送，支持厂商通道（华为/小米/OPPO/vivo），送达率高', 'China mainstream push, supports vendor channels (Huawei/Xiaomi/OPPO/vivo), high delivery rate'),
                    region: ct('中国', 'China'),
                  },
                  {
                    key: 'getui' as const,
                    name: ct('个推 GeTui / UniPush', 'GeTui / UniPush'),
                    icon: '📱',
                    color: 'border-green-400 bg-green-50',
                    activeColor: 'ring-green-400',
                    desc: ct('国内TOP3推送服务商，日均推送百亿级，支持统一推送联盟', 'China TOP3 push provider, billions of daily pushes, supports Unified Push Alliance'),
                    region: ct('中国', 'China'),
                  },
                ] as const).map((provider) => {
                  const pc = workingConfig.pushProvidersConfig || {};
                  const isActive = (pc.activeProvider || 'webpush') === provider.key;
                  const providerConfig = pc[provider.key] || {};
                  const isEnabled = providerConfig.enabled === true;

                  return (
                    <div key={provider.key} className={`border-2 rounded-xl overflow-hidden transition-all ${
                      isActive ? `${provider.color} ${provider.activeColor} ring-2` : 'border-gray-200 bg-white'
                    }`}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xl">{provider.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-gray-800">{provider.name}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{provider.region}</span>
                              {isActive && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{ct("已激活", "Active")}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">{provider.desc}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newConfig = JSON.parse(JSON.stringify(workingConfig));
                            if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                            newConfig.pushProvidersConfig.activeProvider = provider.key;
                            if (!newConfig.pushProvidersConfig[provider.key]) newConfig.pushProvidersConfig[provider.key] = {};
                            newConfig.pushProvidersConfig[provider.key].enabled = true;
                            setWorkingConfig(newConfig);
                            setHasChanges(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex-shrink-0 ${
                            isActive
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {isActive ? ct("当前使用", "In Use") : ct("激活", "Activate")}
                        </button>
                      </div>

                      {/* Config Fields — only show when active */}
                      {isActive && (
                        <div className="px-4 py-3 bg-white/80 border-t border-gray-100 space-y-3">
                          {/* Web Push */}
                          {provider.key === 'webpush' && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">VAPID Public Key</label>
                                <input
                                  type="text"
                                  value={pc.webpush?.vapidPublicKey || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.webpush) newConfig.pushProvidersConfig.webpush = { enabled: true };
                                    newConfig.pushProvidersConfig.webpush.vapidPublicKey = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="BEl62iUYgUivxIk..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("用 web-push generate-vapid-keys 生成，公钥放这里", "Generate with web-push generate-vapid-keys, put public key here")}</p>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">{ct("推送后端API地址", "Push API Base URL")}</label>
                                <input
                                  type="text"
                                  value={pc.webpush?.pushApiBase || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.webpush) newConfig.pushProvidersConfig.webpush = { enabled: true };
                                    newConfig.pushProvidersConfig.webpush.pushApiBase = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="https://api.example.com"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                              </div>
                            </>
                          )}

                          {/* FCM */}
                          {provider.key === 'fcm' && (
                            <>
                              {[
                                { field: 'apiKey', label: 'Firebase Web API Key', placeholder: 'AIzaSy...', hint: ct('Firebase Console → 项目设置 → Web API Key（公开）', 'Firebase Console → Project Settings → Web API Key (public)') },
                                { field: 'projectId', label: 'Firebase Project ID', placeholder: 'my-project-123', hint: '' },
                                { field: 'appId', label: 'Firebase App ID', placeholder: '1:123456789:web:abcdef', hint: '' },
                                { field: 'messagingSenderId', label: 'FCM Sender ID', placeholder: '123456789', hint: ct('Firebase Console → 云消息传递 → 发件人ID', 'Firebase Console → Cloud Messaging → Sender ID') },
                                { field: 'vapidKey', label: 'FCM Web Push VAPID Key', placeholder: 'BEl62iUY...', hint: ct('Firebase Console → 云消息传递 → Web Push 证书 → 密钥对', 'Firebase Console → Cloud Messaging → Web Push certificate → Key Pair') },
                              ].map(({ field, label, placeholder, hint }) => (
                                <div key={field}>
                                  <label className="block text-xs text-gray-600 mb-1">{label}</label>
                                  <input
                                    type="text"
                                    value={(pc.fcm as any)?.[field] || ""}
                                    onChange={(e) => {
                                      const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                      if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                      if (!newConfig.pushProvidersConfig.fcm) newConfig.pushProvidersConfig.fcm = { enabled: true };
                                      newConfig.pushProvidersConfig.fcm[field] = e.target.value;
                                      setWorkingConfig(newConfig);
                                      setHasChanges(true);
                                    }}
                                    placeholder={placeholder}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                  />
                                  {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
                                </div>
                              ))}
                              <div className="bg-amber-50 rounded-lg p-2">
                                <p className="text-[11px] text-amber-700">{ct(
                                  "FCM Server Key 必须存放在后端（Supabase Edge Function Secrets），不要放在前端",
                                  "FCM Server Key must be stored server-side (Supabase Edge Function Secrets), never in frontend"
                                )}</p>
                              </div>
                            </>
                          )}

                          {/* OneSignal */}
                          {provider.key === 'onesignal' && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">OneSignal App ID</label>
                                <input
                                  type="text"
                                  value={pc.onesignal?.appId || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.onesignal) newConfig.pushProvidersConfig.onesignal = { enabled: true };
                                    newConfig.pushProvidersConfig.onesignal.appId = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("OneSignal Dashboard → Settings → Keys & IDs → OneSignal App ID（公开）", "OneSignal Dashboard → Settings → Keys & IDs → OneSignal App ID (public)")}</p>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Safari Web Push ID {ct("（可选）", "(optional)")}</label>
                                <input
                                  type="text"
                                  value={pc.onesignal?.safariWebId || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.onesignal) newConfig.pushProvidersConfig.onesignal = { enabled: true };
                                    newConfig.pushProvidersConfig.onesignal.safariWebId = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="web.onesignal.auto.xxxxxx"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                              </div>
                              <div className="bg-amber-50 rounded-lg p-2">
                                <p className="text-[11px] text-amber-700">{ct(
                                  "OneSignal REST API Key 必须存放在后端（Edge Function Secrets），前端只放 App ID",
                                  "OneSignal REST API Key must be stored server-side (Edge Function Secrets). Only App ID goes in frontend."
                                )}</p>
                              </div>
                            </>
                          )}

                          {/* JPush 极光推送 */}
                          {provider.key === 'jpush' && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">App Key {ct("（公开）", "(public)")}</label>
                                <input
                                  type="text"
                                  value={pc.jpush?.appKey || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.jpush) newConfig.pushProvidersConfig.jpush = { enabled: true };
                                    newConfig.pushProvidersConfig.jpush.appKey = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="your-jpush-app-key"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("极光控制台 → 应用设置 → App Key", "JPush Console → App Settings → App Key")}</p>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">{ct("渠道标识", "Channel")}</label>
                                <input
                                  type="text"
                                  value={pc.jpush?.channel || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.jpush) newConfig.pushProvidersConfig.jpush = { enabled: true };
                                    newConfig.pushProvidersConfig.jpush.channel = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="default"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">{ct("推送API代理地址", "Push API Proxy URL")}</label>
                                <input
                                  type="text"
                                  value={pc.jpush?.pushApiBase || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.jpush) newConfig.pushProvidersConfig.jpush = { enabled: true };
                                    newConfig.pushProvidersConfig.jpush.pushApiBase = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="https://your-supabase.co/functions/v1/jpush-proxy"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("通过Supabase Edge Function代理极光REST API", "Proxy JPush REST API via Supabase Edge Function")}</p>
                              </div>
                              <div className="bg-amber-50 rounded-lg p-2">
                                <p className="text-[11px] text-amber-700">{ct(
                                  "Master Secret 必须存放在后端 Edge Function Secrets 中（环境变量 JPUSH_MASTER_SECRET）",
                                  "Master Secret must be stored in Edge Function Secrets (env var JPUSH_MASTER_SECRET)"
                                )}</p>
                              </div>
                            </>
                          )}

                          {/* GeTui 个推 */}
                          {provider.key === 'getui' && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">App ID {ct("（公开）", "(public)")}</label>
                                <input
                                  type="text"
                                  value={pc.getui?.appId || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.getui) newConfig.pushProvidersConfig.getui = { enabled: true };
                                    newConfig.pushProvidersConfig.getui.appId = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="your-getui-app-id"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("个推开发者中心 → 应用配置 → App ID", "GeTui Developer Center → App Config → App ID")}</p>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">App Key {ct("（公开）", "(public)")}</label>
                                <input
                                  type="text"
                                  value={pc.getui?.appKey || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.getui) newConfig.pushProvidersConfig.getui = { enabled: true };
                                    newConfig.pushProvidersConfig.getui.appKey = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="your-getui-app-key"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">{ct("推送API代理地址", "Push API Proxy URL")}</label>
                                <input
                                  type="text"
                                  value={pc.getui?.pushApiBase || ""}
                                  onChange={(e) => {
                                    const newConfig = JSON.parse(JSON.stringify(workingConfig));
                                    if (!newConfig.pushProvidersConfig) newConfig.pushProvidersConfig = {};
                                    if (!newConfig.pushProvidersConfig.getui) newConfig.pushProvidersConfig.getui = { enabled: true };
                                    newConfig.pushProvidersConfig.getui.pushApiBase = e.target.value;
                                    setWorkingConfig(newConfig);
                                    setHasChanges(true);
                                  }}
                                  placeholder="https://your-supabase.co/functions/v1/getui-proxy"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-xs"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">{ct("通过Supabase Edge Function代理个推REST API", "Proxy GeTui REST API via Supabase Edge Function")}</p>
                              </div>
                              <div className="bg-amber-50 rounded-lg p-2">
                                <p className="text-[11px] text-amber-700">{ct(
                                  "Master Secret 必须存放在后端 Edge Function Secrets 中（环境变量 GETUI_MASTER_SECRET）",
                                  "Master Secret must be stored in Edge Function Secrets (env var GETUI_MASTER_SECRET)"
                                )}</p>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Architecture Diagram */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-gray-700 mb-2">{ct("推送架构：", "Push Architecture:")}</p>
                <div className="font-mono text-[10px] text-gray-600 space-y-1 bg-white rounded-lg p-3 border border-gray-100">
                  <p>{ct("前端：公钥/App ID → 订阅用户", "Frontend: Public Key/App ID → Subscribe user")}</p>
                  <p className="text-gray-400">{"  ↓ subscription"}</p>
                  <p>{ct("存入 Supabase Database（push_subscriptions 表）", "Save to Supabase Database (push_subscriptions table)")}</p>
                  <p className="text-gray-400">{"  ↓ trigger / cron"}</p>
                  <p className="text-emerald-600">{ct("Edge Function（使用私钥/Master Secret）", "Edge Function (uses Private Key/Master Secret)")}</p>
                  <p className="text-gray-400">{"  ↓ API call"}</p>
                  <p className="text-blue-600">{(() => {
                    const ap = workingConfig.pushProvidersConfig?.activeProvider || 'webpush';
                    const names: Record<string, string> = { webpush: 'Web Push API', fcm: 'FCM HTTP v1 API', onesignal: 'OneSignal REST API', jpush: ct('极光 REST API v3', 'JPush REST API v3'), getui: ct('个推 REST API', 'GeTui REST API') };
                    return names[ap] || 'Push API';
                  })()}</p>
                </div>
              </div>

              {/* Security Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800 mb-2">{ct("安全规范：", "Security Guidelines:")}</p>
                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                  <li>{ct(
                    "此页面只配置公开标识（公钥、App ID、App Key），这些可以安全地暴露在前端代码中",
                    "This page only configures public identifiers (Public Key, App ID, App Key) which are safe to expose in frontend code"
                  )}</li>
                  <li>{ct(
                    "所有私密凭证（VAPID Private Key、FCM Server Key、OneSignal REST API Key、极光 Master Secret、个推 Master Secret）必须存放在 Supabase Edge Function 的 Secrets 环境变量中",
                    "All secrets (VAPID Private Key, FCM Server Key, OneSignal REST API Key, JPush Master Secret, GeTui Master Secret) must be stored in Supabase Edge Function Secrets"
                  )}</li>
                  <li>{ct(
                    "推送发送请求由 Edge Function 发起，前端永远不接触私钥",
                    "Push send requests are made by Edge Functions — frontend never touches private keys"
                  )}</li>
                </ul>
              </div>

              {/* Deployment Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-blue-800 mb-2">{ct("部署步骤：", "Deployment Steps:")}</p>
                <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
                  <li>{ct(
                    "在上方选择推送服务商并填写公钥/App ID",
                    "Select a push provider above and fill in public key/App ID"
                  )}</li>
                  <li>{ct(
                    "在 Supabase Edge Function Secrets 中配置对应的私钥/Master Secret",
                    "Configure the corresponding private key/Master Secret in Supabase Edge Function Secrets"
                  )}</li>
                  <li>{ct(
                    "部署 Edge Function：supabase functions deploy push-proxy",
                    "Deploy Edge Function: supabase functions deploy push-proxy"
                  )}</li>
                  <li>{ct(
                    "在 Supabase Database 中创建 push_subscriptions 表存储用户订阅信息",
                    "Create push_subscriptions table in Supabase Database to store user subscriptions"
                  )}</li>
                  <li>{ct(
                    "保存配置，用户端会自动请求推送权限并订阅",
                    "Save config — user-facing app will auto-request push permission and subscribe"
                  )}</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 卡片网格 */}
            {renderTable()}
          </>
        )}
      </div>
      </div>{/* 关闭可滚动内容区域 */}
      </div>{/* 关闭侧边栏+内容flex容器 */}

      {/* 编辑对话框 */}
      {renderEditDialog()}

      {/* 保存确认弹窗 */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-emerald-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{ct("保存配置", "Save Config")}</h3>
              <button onClick={() => setShowSaveDialog(false)} className="text-white hover:bg-emerald-700 rounded-lg p-1">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">{ct("请输入验证码以确认保存配置", "Enter the code to confirm saving the config")}</p>
              <InputField label={ct("验证码", "Code")} value={savePassword} onChange={(v: string) => setSavePassword(v)} placeholder="taprootagro" />
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                {ct("取消", "Cancel")}
              </button>
              <button
                onClick={handleConfirmSave}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {ct("保存", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// 输入框组件
function InputField({ label, value, onChange, disabled = false, placeholder = "", type = "text" }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
      />
    </div>
  );
}

// 下拉框组件
function SelectField({ label, value, onChange, options }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      >
        {options.map((option: string) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

// 文本域组件
function TextAreaField({ label, value, onChange, rows = 6, placeholder = "" }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
      />
    </div>
  );
}
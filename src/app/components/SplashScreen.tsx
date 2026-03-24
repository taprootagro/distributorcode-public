import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useConfigContext } from "../hooks/ConfigProvider";

/**
 * SplashScreen — 智能计时启动屏
 * 
 * 改进：不再硬编码 2 秒等待。
 * 策略：最短 2000ms（品牌曝光时间 — 让农户看到 logo） + 首张 banner 预加载完成 → 立即跳转
 * 回访用户（SW 缓存命中）几乎 0 网络延迟，2000ms 后就跳转。
 * 弱网首次用户在 banner 加载完成后跳转，最长等 4 秒兜底。
 * 
 * 退场动画：scale(1) → scale(1.04) + opacity → 0，200ms ease-in，
 * 动画结束后再执行 navigate，视觉上无缝衔接。
 * 
 * PWA 冷启动支持：
 * standalone 模式下浏览器会恢复上次 URL（如 /home），跳过 /。
 * Layout 检测到新 session 会重定向到 /，本组件在 sessionStorage 写入
 * __taproot_splash_shown__ 标记，防止同一 session 重复显示。
 */
// sessionStorage key — 与 Layout.tsx 共享，标记本次 session 已展示过开屏页
export const SPLASH_SHOWN_KEY = '__taproot_splash_shown__';

export function SplashScreen() {
  const navigate = useNavigate();
  const { config } = useConfigContext();
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [resourceReady, setResourceReady] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 开屏页状态栏设为白色，离开时恢复绿色
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') || '#059669';
    meta?.setAttribute('content', '#ffffff');
    return () => { meta?.setAttribute('content', prev); };
  }, []);

  // 检查是否有待激活的更新（iOS PWA 延迟更新策略）
  useEffect(() => {
    const pendingUpdate = sessionStorage.getItem('taproot_sw_pending_update');
    if (pendingUpdate === '1') {
      console.log('[Splash] Detected pending update, checking for new controller...');
      
      // 检查是否有新的 controller（说明更新已激活）
      if (navigator.serviceWorker?.controller) {
        // 清除标记，允许新版本运行
        sessionStorage.removeItem('taproot_sw_pending_update');
        console.log('[Splash] Update activated successfully');
      }
    }
  }, []);

  // 最短展示 2000ms（品牌曝光时间 — 让农户看到 logo）
  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // 预加载首张 banner 图片（如有）
  useEffect(() => {
    const firstBanner = config?.banners?.[0]?.url;
    if (!firstBanner) {
      setResourceReady(true);
      return;
    }

    const img = new Image();
    img.onload = () => setResourceReady(true);
    img.onerror = () => setResourceReady(true); // 加载失败也继续
    img.src = firstBanner;

    // 兜底：最长等 4 秒，无论资源是否 ready
    const maxTimer = setTimeout(() => setResourceReady(true), 4000);
    return () => clearTimeout(maxTimer);
  }, [config?.banners]);

  // 两个条件都满足时触发退场动画
  useEffect(() => {
    if (minTimePassed && resourceReady && !exiting) {
      setExiting(true);
    }
  }, [minTimePassed, resourceReady, exiting]);

  // 退场动画结束后跳转
  const handleAnimationEnd = useCallback(() => {
    if (exiting) {
      // 标记本次 session 已展示过开屏页，防止 Layout 再次重定向
      try { sessionStorage.setItem(SPLASH_SHOWN_KEY, '1'); } catch {}
      navigate("/home", { replace: true });
    }
  }, [exiting, navigate]);

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col items-center justify-center px-[5vw] overflow-hidden"
      style={{
        animation: exiting ? 'splash-exit 200ms ease-in forwards' : undefined,
        willChange: exiting ? 'transform, opacity' : 'auto',
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* 状态栏白色占位 — 开屏页为白色背景，状态栏同步为白色 */}
      <div className="bg-white safe-top fixed top-0 inset-x-0 z-50" />

      {/* Logo */}
      <div 
        className="bg-white rounded-3xl flex items-center justify-center mb-[4vh] shadow-xl overflow-hidden"
        style={{ 
          width: 'clamp(140px, 32vw, 180px)', 
          height: 'clamp(140px, 32vw, 180px)',
          borderRadius: 'clamp(24px, 7vw, 36px)'
        }}
      >
        {config?.appBranding?.logoUrl ? (
          <img 
            src={config.appBranding.logoUrl} 
            alt="Logo"
            className="w-full h-full object-cover"
          />
        ) : (
          <span 
            className="text-emerald-600 font-bold"
            style={{ fontSize: 'clamp(60px, 16vw, 90px)' }}
          >
            🌱
          </span>
        )}
      </div>
      
      {/* Slogan */}
      <h1 
        className="text-gray-900 font-bold text-center mb-[1vh]"
        style={{ fontSize: 'clamp(20px, 6vw, 32px)' }}
      >
        {config?.appBranding?.appName || "TaprootAgro"}
      </h1>
      <p 
        className="text-gray-500 text-center leading-relaxed max-w-[90vw] whitespace-nowrap"
        style={{ fontSize: 'clamp(10px, 2.8vw, 14px)' }}
      >
        {config?.appBranding?.slogan || "To be the taproot of smart agro."}
      </p>

      {/* 加载动画指示器 */}
      <div className="mt-[8vh]">
        <div className="flex gap-[1vw]">
          <div 
            className="bg-emerald-600 rounded-full animate-bounce"
            style={{ 
              width: 'clamp(8px, 2.5vw, 12px)', 
              height: 'clamp(8px, 2.5vw, 12px)',
              animationDelay: '0ms'
            }}
          ></div>
          <div 
            className="bg-emerald-600 rounded-full animate-bounce"
            style={{ 
              width: 'clamp(8px, 2.5vw, 12px)', 
              height: 'clamp(8px, 2.5vw, 12px)',
              animationDelay: '150ms'
            }}
          ></div>
          <div 
            className="bg-emerald-600 rounded-full animate-bounce"
            style={{ 
              width: 'clamp(8px, 2.5vw, 12px)', 
              height: 'clamp(8px, 2.5vw, 12px)',
              animationDelay: '300ms'
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}
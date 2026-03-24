import { Outlet } from 'react-router';
import { useEffect } from 'react';
import { LanguageProvider } from '../hooks/useLanguage';
import { ViewportMeta } from './ViewportMeta';
import { ResponsiveScale } from './ResponsiveScale';
import { PWARegister } from './PWARegister';
import { ErrorBoundary } from './ErrorBoundary';
import { errorMonitor } from '../utils/errorMonitor';
import { installSilentRecovery } from '../utils/silentRecovery';
import { initTaprootDB } from '../utils/db';
import { defaultConfig } from '../hooks/useHomeConfig';
import { ConfigProvider } from '../hooks/ConfigProvider';
import { useDynamicManifest } from '../hooks/useDynamicManifest';
import { isNative } from '../utils/capacitor-bridge';

// Inner shell: PWA head tags + outlet (routes use ConfigProvider above)
function RootInner() {
  useDynamicManifest();

  return (
    <>
      <ViewportMeta />
      <ResponsiveScale />
      <PWARegister />
      <Outlet />
    </>
  );
}

export function Root() {
  // Install error monitor after mount (avoids patching fetch during SSR/preview)
  useEffect(() => {
    errorMonitor.install();
    installSilentRecovery();
    initTaprootDB(); // fire-and-forget — app works with localStorage fallback until ready

    // Capacitor 原生环境标记：给 <html> 加 data-native 属性
    // CSS 通过 html[data-native] 选择器适配安全区，不依赖 display-mode: standalone
    if (isNative()) {
      document.documentElement.setAttribute('data-native', '');
    }
  }, []);

  // defaultConfig 是模块级常量，直接 import 即可，无需调用 useHomeConfig() hook
  // 这样避免在 ConfigProvider 之外创建多余的 state 实例
  return (
    <LanguageProvider>
      <ConfigProvider defaultConfig={defaultConfig}>
        <ErrorBoundary>
          <RootInner />
        </ErrorBoundary>
      </ConfigProvider>
    </LanguageProvider>
  );
}
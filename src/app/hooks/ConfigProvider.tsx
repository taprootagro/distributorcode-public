import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { HomePageConfig } from './useHomeConfig';
import { deepMerge, MERGE_DEEP } from '../utils';
import { storageGetJSON, storageSetJSON } from '../utils/safeStorage';
import { CONFIG_STORAGE_KEY } from '../constants';
import {
  isSupabaseConfigured,
  fetchRemoteConfig,
  pushRemoteConfig,
} from '../services/ConfigSyncService';

/**
 * ConfigProvider - 全局配置单例 Context
 * 
 * 解决 useHomeConfig 多实例问题：
 *   Keep-Alive 模式下 4 个 tab 页面各自调用 useHomeConfig()，
 *   每个实例独立 useState + JSON.parse + 事件监听 = 4 倍内存和事件开销。
 * 
 * 改为 Context Provider 在 Root 层提供单一数据源，
 * 所有子组件通过 useContext 共享同一份配置对象。
 * 
 * v2 更新：使用深度merge工具替代浅层合并，支持嵌套对象完整合并。
 * v3 更新：远程配置拉取（Step 2）+ 双写（Step 3）
 * v4 更新：生产构建（农民端）只从 Supabase 拉取，不向远程写配置。
 *   白牌运营商在 Dashboard / SQL 维护 app_config；本地保存仍写 localStorage。
 *   仅 import.meta.env.DEV 下保留 POST /config（建站调试用，需 Edge 侧密钥或临时 ALLOW_INSECURE）。
 */

// ---- Sync status type ----
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

interface ConfigContextType {
  config: HomePageConfig;
  saveConfig: (newConfig: HomePageConfig) => void;
  resetConfig: () => void;
  exportConfig: () => void;
  importConfig: (file: File) => Promise<void>;
  defaultConfig: HomePageConfig;
  /** Remote sync status */
  syncStatus: SyncStatus;
  /** Remote config version (from Supabase) */
  remoteVersion: number | null;
  /** Last successful sync timestamp (ms) */
  lastSyncTime: number | null;
  /** Last sync error message */
  lastSyncError: string | null;
  /** Whether Supabase credentials look valid */
  isRemoteConfigured: boolean;
  /** Manually trigger a remote sync (pull) */
  pullRemoteConfig: () => Promise<void>;
  /** Force-push current config to remote (ignoring version) */
  forcePushConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

// 默认配置从 useHomeConfig 导出（避免重复定义）
let _defaultConfig: HomePageConfig | null = null;

export function ConfigProvider({ children, defaultConfig }: { children: ReactNode; defaultConfig: HomePageConfig }) {
  _defaultConfig = defaultConfig;
  
  const [config, setConfig] = useState<HomePageConfig>(() => {
    const parsed = storageGetJSON<HomePageConfig>(CONFIG_STORAGE_KEY);
    if (parsed) {
      return deepMerge(defaultConfig, parsed, MERGE_DEEP);
    }
    return defaultConfig;
  });

  // ---- Remote sync state ----
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Track latest config in a ref so async callbacks always see current value
  const configRef = useRef(config);
  configRef.current = config;

  // ---- Helper: extract Supabase creds from config ----
  const getSupabaseCreds = useCallback((cfg: HomePageConfig) => {
    const bp = (cfg as any).backendProxyConfig;
    return {
      url: bp?.supabaseUrl || '',
      key: bp?.supabaseAnonKey || '',
      edgeFunctionName: bp?.edgeFunctionName || 'server',
    };
  }, []);

  const isRemoteConfigured = isSupabaseConfigured(
    (config as any).backendProxyConfig?.supabaseUrl,
    (config as any).backendProxyConfig?.supabaseAnonKey,
  );

  // Key for storing the last-synced remote version in localStorage
  const REMOTE_VERSION_KEY = '__configRemoteVersion';

  // ---- Step 2: Async remote fetch on mount ----
  const pullRemoteConfig = useCallback(async () => {
    const { url, key, edgeFunctionName } = getSupabaseCreds(configRef.current);
    if (!isSupabaseConfigured(url, key)) {
      setSyncStatus('idle');
      return;
    }

    setSyncStatus('syncing');
    try {
      const result = await fetchRemoteConfig(url, key, edgeFunctionName);
      if (!result) {
        // No remote row yet — that's fine, we're the first device
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
        return;
      }

      // ---- Version-based merge strategy ----
      // Compare remote version with the version we last synced from.
      // If remote is newer → remote wins (admin pushed new content).
      // If same version → keep local (no remote change since last sync).
      const lastSyncedVersion = (() => {
        try {
          const v = localStorage.getItem(REMOTE_VERSION_KEY);
          return v ? parseInt(v, 10) : 0;
        } catch { return 0; }
      })();

      let merged: HomePageConfig;
      if (result.version > lastSyncedVersion) {
        // Remote is newer — remote wins over local
        // Merge: defaultConfig → remote (remote is source of truth)
        merged = deepMerge(defaultConfig, result.config as Partial<HomePageConfig>, MERGE_DEEP);
        console.log(`[ConfigProvider] Remote v${result.version} > local v${lastSyncedVersion}, using remote config`);
      } else {
        // Same version — keep local overrides on top of remote
        const localOverrides = storageGetJSON<HomePageConfig>(CONFIG_STORAGE_KEY);
        if (localOverrides) {
          merged = deepMerge(
            deepMerge(defaultConfig, result.config as Partial<HomePageConfig>, MERGE_DEEP),
            localOverrides,
            MERGE_DEEP,
          );
        } else {
          merged = deepMerge(defaultConfig, result.config as Partial<HomePageConfig>, MERGE_DEEP);
        }
        console.log(`[ConfigProvider] Remote v${result.version} == local v${lastSyncedVersion}, keeping local overrides`);
      }

      setConfig(merged);
      storageSetJSON(CONFIG_STORAGE_KEY, merged);
      setRemoteVersion(result.version);
      setSyncStatus('synced');
      setLastSyncTime(Date.now());
      setLastSyncError(null);

      // Persist the synced version number
      try { localStorage.setItem(REMOTE_VERSION_KEY, String(result.version)); } catch {}

      // Notify other components
      window.dispatchEvent(new CustomEvent('configUpdate', { detail: merged }));
    } catch (err: any) {
      console.warn('[ConfigProvider] remote fetch failed:', err);
      setSyncStatus('error');
      setLastSyncError(err.message || String(err));
    }
  }, [defaultConfig, getSupabaseCreds]);

  // Run once on mount
  useEffect(() => {
    pullRemoteConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-pull when app comes back to foreground (user switches back to tab/app)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pullRemoteConfig();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pullRemoteConfig]);

  // 监听配置更新事件（来自其他 tab 或 ConfigManagerPage）
  useEffect(() => {
    const handleConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<HomePageConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONFIG_STORAGE_KEY && e.newValue) {
        try {
          setConfig(JSON.parse(e.newValue));
        } catch { /* ignore */ }
      }
    };

    window.addEventListener('configUpdate', handleConfigUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('configUpdate', handleConfigUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // ---- Step 3: Dual-write saveConfig ----
  const saveConfig = useCallback((newConfig: HomePageConfig) => {
    // 1. Immediate local save (always works, even offline)
    setConfig(newConfig);
    storageSetJSON(CONFIG_STORAGE_KEY, newConfig);
    window.dispatchEvent(new CustomEvent('configUpdate', { detail: newConfig }));

    // 2. Dev-only: persist to local JSON files + download icons via Vite middleware
    if (import.meta.env.DEV) {
      fetch('/__taprootagro/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: newConfig }),
      }).catch(() => { /* non-blocking, only available in Vite dev server */ });
    }

    // 3. Async remote save — production farmer app never pushes (pull-only).
    const { url, key, edgeFunctionName } = getSupabaseCreds(newConfig);
    if (import.meta.env.PROD) {
      return;
    }
    if (isSupabaseConfigured(url, key)) {
      setSyncStatus('syncing');
      pushRemoteConfig(url, key, newConfig as any, remoteVersion, edgeFunctionName)
        .then((result) => {
          if (result.success) {
            setRemoteVersion(result.newVersion);
            setSyncStatus('synced');
            setLastSyncTime(Date.now());
            setLastSyncError(null);
            // Persist the new version so next pull knows the baseline
            try { localStorage.setItem(REMOTE_VERSION_KEY, String(result.newVersion)); } catch {}
          } else if (result.conflict) {
            setSyncStatus('conflict');
            setLastSyncError('Version conflict: remote config was modified by another device');
          } else {
            setSyncStatus('error');
            setLastSyncError(result.errorMessage || 'Remote save failed');
          }
        })
        .catch((err) => {
          setSyncStatus('error');
          setLastSyncError(err.message || String(err));
        });
    }
  }, [getSupabaseCreds, remoteVersion]);

  // ---- Force push (skip version check) ----
  const forcePushConfig = useCallback(async () => {
    if (import.meta.env.PROD) return;
    const { url, key, edgeFunctionName } = getSupabaseCreds(configRef.current);
    if (!isSupabaseConfigured(url, key)) return;

    setSyncStatus('syncing');
    try {
      const result = await pushRemoteConfig(url, key, configRef.current as any, null, edgeFunctionName);
      if (result.success) {
        setRemoteVersion(result.newVersion);
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
        setLastSyncError(null);
      } else {
        setSyncStatus('error');
        setLastSyncError(result.errorMessage || 'Force push failed');
      }
    } catch (err: any) {
      setSyncStatus('error');
      setLastSyncError(err.message || String(err));
    }
  }, [getSupabaseCreds]);

  const resetConfig = useCallback(() => {
    setConfig(defaultConfig);
    storageSetJSON(CONFIG_STORAGE_KEY, defaultConfig);
    window.dispatchEvent(new CustomEvent('configUpdate', { detail: defaultConfig }));
  }, [defaultConfig]);

  const exportConfigFn = useCallback(() => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `home-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [config]);

  const importConfigFn = useCallback((file: File) => {
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
  }, [saveConfig]);

  return (
    <ConfigContext.Provider value={{
      config,
      saveConfig,
      resetConfig,
      exportConfig: exportConfigFn,
      importConfig: importConfigFn,
      defaultConfig,
      syncStatus,
      remoteVersion,
      lastSyncTime,
      lastSyncError,
      isRemoteConfigured,
      pullRemoteConfig,
      forcePushConfig,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

/** 从 Context 获取配置（推荐） */
export function useConfigContext(): ConfigContextType {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error('useConfigContext must be used within ConfigProvider');
  }
  return ctx;
}
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/index.css';

// ============================================================
// 全局 Chunk 加载失败恢复
// 捕获 React 组件树外的动态 import() 失败（如路由懒加载），
// 自动清理 SW 缓存的旧 index.html 并刷新页面。
// ============================================================
const CHUNK_RELOAD_KEY = 'taproot_chunk_reload';
const CHUNK_RELOAD_MAX = 2;

function isChunkError(reason: unknown): boolean {
  if (reason instanceof Error) {
    const msg = reason.message || '';
    const name = reason.name || '';
    return (
      name === 'ChunkLoadError' ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Unable to preload CSS')
    );
  }
  return false;
}

window.addEventListener('unhandledrejection', (event) => {
  if (!isChunkError(event.reason)) return;

  console.warn('[main] Chunk load error caught globally, attempting recovery...');
  event.preventDefault(); // 阻止控制台报错

  const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= CHUNK_RELOAD_MAX) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    console.error('[main] Chunk recovery exhausted, redirecting to /sw-reset');
    window.location.href = '/sw-reset';
    return;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1));

  // 清除缓存的旧 HTML
  if ('caches' in window) {
    caches.keys().then(names => {
      const ops = names
        .filter(n => n.startsWith('taproot-agro'))
        .map(name => caches.open(name).then(c => Promise.all([c.delete('/index.html'), c.delete('/')])));
      Promise.all(ops).finally(() => window.location.reload());
    });
  } else {
    window.location.reload();
  }
});

// 成功加载后清除重试计数器
window.addEventListener('load', () => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
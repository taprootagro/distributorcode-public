import { useState, useEffect } from 'react';
import { isNative } from '../utils/capacitor-bridge';

/**
 * Detect virtual keyboard visibility on mobile devices.
 * 
 * Strategy:
 * - Primary: Uses visualViewport API: when keyboard opens, visualViewport.height
 *   becomes significantly smaller than window.innerHeight.
 * - Capacitor native: Also listens to @capacitor/keyboard plugin events
 *   (keyboardDidShow / keyboardDidHide) as a reliable fallback, because
 *   Android WebView with adjustResize makes innerHeight and visualViewport.height
 *   shrink together, causing the visualViewport diff to stay near 0.
 * - Threshold: 150px difference (keyboards are typically 250-350px tall).
 * - Falls back to false on desktop / unsupported browsers.
 * - Also monitors focus/blur events on input elements for faster detection.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;

    const THRESHOLD = 150; // px — minimum height difference to consider keyboard "open"

    function check() {
      // 键盘弹出时 visualViewport 变矮；部分 Android 上 innerHeight 与 vv 同缩，差值仍可能超过阈值
      const diff = window.innerHeight - (vv?.height ?? window.innerHeight);
      const isVisible = diff > THRESHOLD;
      setVisible(isVisible);

      // 勿在此 window.scrollTo(0,0)：全屏 fixed 壳 + overflow:hidden 时，会干扰聚焦滚动，
      // 导致聊天输入栏被顶到屏幕上方、中间大片空白（Android PWA 常见）。
    }

    if (vv) {
      vv.addEventListener('resize', check);
      // iOS also fires scroll when keyboard pushes viewport
      vv.addEventListener('scroll', check);
    }

    // ── Capacitor 原生模式：通过 Keyboard 插件事件精确检测 ──
    // Android WebView adjustResize 会同时缩小 innerHeight 和 visualViewport.height，
    // 导致差值为 0，visualViewport 方案失效。Keyboard 插件直接监听原生事件，100% 可靠。
    let capCleanup: (() => void) | null = null;

    if (isNative()) {
      try {
        const registry = (window as any).__CAP_PLUGINS__;
        const KeyboardPlugin = registry?.['@capacitor/keyboard']?.Keyboard;
        if (KeyboardPlugin?.addListener) {
          const showHandle = KeyboardPlugin.addListener('keyboardDidShow', () => {
            setVisible(true);
          });
          const hideHandle = KeyboardPlugin.addListener('keyboardDidHide', () => {
            setVisible(false);
          });
          capCleanup = () => {
            showHandle?.remove?.();
            hideHandle?.remove?.();
          };
        }
      } catch {
        // Plugin not available — fall through to visualViewport detection
      }
    }

    // 监听 input/textarea 的 focus/blur 事件，提前预判键盘状态
    // 这比等待 visualViewport resize 更快（能提前 100-300ms）
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const inputType = (target as HTMLInputElement).type;
        // 排除不会弹键盘的 input 类型
        if (inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'range' && inputType !== 'file') {
          // 提前标记键盘即将出现，防止 dock 栏闪烁
          // 延迟一帧确认（避免误判点击 input 但未弹键盘的情况）
          requestAnimationFrame(() => {
            // 再次检查 visualViewport（此时可能已经开始缩小）
            if (vv) {
              const diff = window.innerHeight - vv.height;
              if (diff > THRESHOLD) {
                setVisible(true);
              }
            }
          });
          // 延迟 300ms 再检查一次（覆盖键盘动画时间）
          setTimeout(check, 300);
        }
      }
    };

    const handleFocusOut = () => {
      // blur 后延迟检查，等待键盘收起动画完成
      setTimeout(check, 100);
      setTimeout(check, 300);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Initial check
    check();

    return () => {
      if (vv) {
        vv.removeEventListener('resize', check);
        vv.removeEventListener('scroll', check);
      }
      capCleanup?.();
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, []);

  return visible;
}
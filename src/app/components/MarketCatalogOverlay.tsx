import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { useBackHandler } from "../hooks/useBackHandler";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { MarketProductCatalog } from "./MarketProductCatalog";

interface MarketCatalogOverlayProps {
  onClose: () => void;
}

/**
 * 全屏商品目录（首页 Book 入口）。
 * 壳层与 SecondaryView 一致：顶栏仅标题、底部叉号关闭、系统返回先触发退场动画。
 */
export function MarketCatalogOverlay({ onClose }: MarketCatalogOverlayProps) {
  const { t } = useLanguage();
  const { keyboardHeight, isKeyboardOpen } = useKeyboardHeight();
  const [phase, setPhase] = useState<"entering" | "visible" | "leaving">("entering");

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("visible"));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setPhase("leaving");
  }, []);

  useBackHandler(handleClose, true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const handleTransitionEnd = useCallback(() => {
    if (phase === "leaving") onClose();
  }, [phase, onClose]);

  const off = phase !== "visible";

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t.market.title}
      style={{
        backgroundColor: "var(--app-bg)",
        bottom: isKeyboardOpen ? `${keyboardHeight}px` : "0px",
        transition:
          phase === "leaving"
            ? "transform 160ms ease-in, opacity 120ms ease-in"
            : "transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        transform:
          phase === "entering" ? "scale(0.94) translateY(12px)" : phase === "leaving" ? "scale(0.97)" : "none",
        opacity: off ? 0 : 1,
        willChange: off ? "transform, opacity" : "auto",
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="bg-emerald-600 safe-top flex-shrink-0" />

      <div className="flex-1 min-h-0 overflow-hidden bg-white" style={{ backgroundColor: "var(--app-bg)" }}>
        <MarketProductCatalog />
      </div>

      {!isKeyboardOpen && (
        <nav className="flex-shrink-0 bg-white safe-bottom">
          <div className="relative">
            <div className="flex items-center justify-center px-1 relative">
              <button
                type="button"
                onClick={handleClose}
                className="flex items-center justify-center pt-2 pb-1 active:scale-95 transition-transform touch-manipulation"
                aria-label={t.common.close}
                style={{ minWidth: "48px", minHeight: "48px" }}
              >
                <X className="w-7 h-7 text-red-500" strokeWidth={2} />
              </button>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}

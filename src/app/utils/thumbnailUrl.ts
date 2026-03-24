/**
 * 将配置中的图片地址转为可直接用于 <img src> 的 URL：不做代理、不改尺寸参数。
 * 相对路径（以 / 开头）在浏览器内补全为同源绝对地址。
 */

export type ThumbnailSlot =
  | "bannerCarousel"
  | "bannerDetail"
  | "liveCover"
  | "productGrid"
  | "productSearch"
  | "articleCard"
  | "articleDetail"
  | "adCarousel"
  | "adDetail"
  | "productDetail";

function isSvg(url: string): boolean {
  return /\.svg(\?|#|$)/i.test(url) || url.startsWith("data:image/svg");
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }
  return url;
}

/** @param _slot @param _quality 保留参数以兼容旧调用，已忽略 */
export function getThumbnailUrl(
  url: string,
  _slot?: ThumbnailSlot,
  _quality?: unknown
): string {
  if (!url) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (isSvg(url)) return url;
  return toAbsoluteUrl(url);
}

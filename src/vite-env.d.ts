/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 设为 off / false / 0 时不对任意域名走缩略图代理，仅 Unsplash/placehold 仍按原逻辑优化 */
  readonly VITE_IMAGE_THUMBNAIL_PROXY?: string;
  /**
   * 自建图床代理模板，需包含 {url}（已 encodeURIComponent 的绝对地址）、{w}、{q}
   * 未设置时默认使用 images.weserv.nl
   */
  readonly VITE_IMAGE_PROXY_TEMPLATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'figma:asset/*' {
  const src: string;
  export default src;
}

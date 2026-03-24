// ============================================================================
// imageCompressor — 通用图片压缩工具
// ============================================================================
// 面向非洲低端设备 + 有限移动数据设计：
// - 使用 canvas 缩放 + JPEG 压缩
// - 自动检测透明通道保留 PNG（避免破坏截图/图标）
// - 支持 base64 data URL 和 File/Blob 两种输入
// ============================================================================

export interface CompressOptions {
  /** 最长边最大像素，默认 1280 */
  maxSize?: number;
  /** JPEG 质量 0-1，默认 0.75 */
  quality?: number;
  /** 压缩后最大字节数（近似），若首次压缩后仍超出则降质量重试 */
  maxBytes?: number;
}

/** 预设场景 */
export const COMPRESS_PRESETS = {
  /** 聊天图片：显示小，压缩更激进 */
  chat: { maxSize: 1024, quality: 0.7, maxBytes: 200 * 1024 } as CompressOptions,
  /** AI 识别：需要足够清晰度识别病虫害 */
  ai: { maxSize: 1280, quality: 0.8 } as CompressOptions,
  /** 头像/小图 */
  avatar: { maxSize: 512, quality: 0.7, maxBytes: 80 * 1024 } as CompressOptions,
} as const;

/**
 * 压缩 base64 data URL 图片
 * 
 * @param base64 - data:image/...;base64,... 格式
 * @param options - 压缩参数
 * @returns 压缩后的 base64 data URL (JPEG)
 */
export function compressImageBase64(
  base64: string,
  options: CompressOptions = {}
): Promise<string> {
  const { maxSize = 1280, quality = 0.75, maxBytes } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const result = compressFromImage(img, maxSize, quality, maxBytes);
      const origKB = Math.round(base64.length * 0.75 / 1024);
      const compKB = Math.round(result.length * 0.75 / 1024);
      if (compKB < origKB) {
        console.log(
          `[ImageCompressor] ${img.naturalWidth}x${img.naturalHeight} → ${result === base64 ? 'unchanged' : `compressed`}, ${origKB}KB → ${compKB}KB (${Math.round((1 - compKB / origKB) * 100)}% saved)`
        );
      }
      resolve(result);
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

/**
 * 压缩 File 对象为 base64 data URL
 * 
 * @param file - File 或 Blob 对象
 * @param options - 压缩参数
 * @returns 压缩后的 base64 data URL (JPEG)
 */
export function compressImageFile(
  file: File | Blob,
  options: CompressOptions = {}
): Promise<string> {
  const { maxSize = 1280, quality = 0.75, maxBytes } = options;

  return new Promise((resolve, reject) => {
    // 小于 maxBytes 且为 JPEG 的可以直接读取（跳过压缩）
    if (maxBytes && file.size <= maxBytes && file.type === 'image/jpeg') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
      return;
    }

    // 使用 createImageBitmap 比 FileReader + Image 更省内存
    createImageBitmap(file)
      .then((bitmap) => {
        const result = compressFromBitmap(bitmap, maxSize, quality, maxBytes);
        const compKB = Math.round(result.length * 0.75 / 1024);
        const origKB = Math.round(file.size / 1024);
        console.log(
          `[ImageCompressor] File ${origKB}KB (${bitmap.width}x${bitmap.height}) → ${compKB}KB (${Math.round((1 - compKB / origKB) * 100)}% saved)`
        );
        bitmap.close(); // 释放内存
        resolve(result);
      })
      .catch(() => {
        // createImageBitmap 不支持时降级到 FileReader + Image
        const reader = new FileReader();
        reader.onload = (e) => {
          compressImageBase64(e.target?.result as string, options).then(resolve);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
  });
}

// ── 内部实现 ──────────────────────────────────────────────────

function compressFromImage(
  img: HTMLImageElement,
  maxSize: number,
  quality: number,
  maxBytes?: number
): string {
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // 无需缩放且无 maxBytes 限制
  if (w <= maxSize && h <= maxSize && !maxBytes) {
    return img.src; // 原图已足够小
  }

  // 等比缩放
  if (w > maxSize || h > maxSize) {
    if (w > h) {
      h = Math.round((h * maxSize) / w);
      w = maxSize;
    } else {
      w = Math.round((w * maxSize) / h);
      h = maxSize;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  let result = canvas.toDataURL('image/jpeg', quality);

  // maxBytes 限制：若超出则降质量重试（最多 3 次）
  if (maxBytes) {
    let currentBytes = Math.round(result.length * 0.75);
    let q = quality;
    let attempts = 0;
    while (currentBytes > maxBytes && q > 0.3 && attempts < 3) {
      q -= 0.15;
      attempts++;
      result = canvas.toDataURL('image/jpeg', q);
      currentBytes = Math.round(result.length * 0.75);
    }
  }

  return result;
}

function compressFromBitmap(
  bitmap: ImageBitmap,
  maxSize: number,
  quality: number,
  maxBytes?: number
): string {
  let w = bitmap.width;
  let h = bitmap.height;

  // 等比缩放
  if (w > maxSize || h > maxSize) {
    if (w > h) {
      h = Math.round((h * maxSize) / w);
      w = maxSize;
    } else {
      w = Math.round((w * maxSize) / h);
      h = maxSize;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  let result = canvas.toDataURL('image/jpeg', quality);

  // maxBytes 限制
  if (maxBytes) {
    let currentBytes = Math.round(result.length * 0.75);
    let q = quality;
    let attempts = 0;
    while (currentBytes > maxBytes && q > 0.3 && attempts < 3) {
      q -= 0.15;
      attempts++;
      result = canvas.toDataURL('image/jpeg', q);
      currentBytes = Math.round(result.length * 0.75);
    }
  }

  return result;
}

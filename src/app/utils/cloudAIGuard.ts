// ============================================================================
// CloudAIGuard - Frontend Anti-Abuse Protection Layer
// ============================================================================
// Implements client-side protections to reduce unnecessary cloud AI calls:
//   1. Image compression (resize + quality reduction before upload)
//   2. Cooldown timer (minimum interval between requests)
//   3. Daily usage quota (localStorage-tracked per-day limit)
//   4. Image hash dedup (don't send identical images twice)
//
// NOTE: These are "polite" frontend guards — real security MUST be enforced
// server-side in the Supabase Edge Function. These reduce honest misuse,
// accidental spam, and save bandwidth/costs.
// ============================================================================

import { storageGet, storageSet, storageRemove } from './safeStorage';

const GUARD_STORAGE_KEY = 'agri_cloud_ai_guard';
const CACHE_STORAGE_KEY = 'agri_cloud_ai_cache';

// ---------- Configuration ----------

export interface GuardConfig {
  /** Max image dimension (longest side) before compression, default 1280 */
  maxImageSize: number;
  /** JPEG quality for compressed output (0-1), default 0.8 */
  imageQuality: number;
  /** Cooldown between requests in seconds, default 15 */
  cooldownSeconds: number;
  /** Maximum cloud AI calls per day, default 20 */
  dailyLimit: number;
  /** Enable image hash dedup caching, default true */
  enableDedup: boolean;
  /** Max cached results to keep, default 50 */
  maxCacheEntries: number;
}

const DEFAULT_GUARD_CONFIG: GuardConfig = {
  maxImageSize: 1280,
  imageQuality: 0.8,
  cooldownSeconds: 15,
  dailyLimit: 20,
  enableDedup: true,
  maxCacheEntries: 50,
};

// ---------- Usage Tracking ----------

interface UsageRecord {
  date: string;       // YYYY-MM-DD
  count: number;
  lastCallTimestamp: number;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getUsage(): UsageRecord {
  try {
    const raw = storageGet(GUARD_STORAGE_KEY);
    if (raw) {
      const record: UsageRecord = JSON.parse(raw);
      // Reset if it's a new day
      if (record.date !== getTodayStr()) {
        return { date: getTodayStr(), count: 0, lastCallTimestamp: 0 };
      }
      return record;
    }
  } catch { /* ignore */ }
  return { date: getTodayStr(), count: 0, lastCallTimestamp: 0 };
}

function saveUsage(record: UsageRecord): void {
  try {
    storageSet(GUARD_STORAGE_KEY, JSON.stringify(record));
  } catch { /* ignore */ }
}

// ---------- Image Hash (fast simple hash for dedup) ----------

async function hashImageBase64(base64: string): Promise<string> {
  // Use SubtleCrypto if available, else fallback to simple hash
  const data = base64.slice(base64.indexOf(',') + 1); // strip data:image/...;base64,
  // Sample a subset for speed (first 8KB + last 4KB + length)
  const sample = data.slice(0, 8192) + data.slice(-4096) + data.length.toString();
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(sample));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fallback */ }
  }
  
  // Simple DJB2 hash fallback
  let hash = 5381;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) + hash + sample.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(16);
}

// ---------- Image Dedup Cache ----------

interface CacheEntry {
  hash: string;
  result: string; // JSON stringified DeepAnalysisResult
  timestamp: number;
}

function getCache(): CacheEntry[] {
  try {
    const raw = storageGet(CACHE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveCache(entries: CacheEntry[]): void {
  try {
    storageSet(CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

function findCachedResult(hash: string): string | null {
  const cache = getCache();
  const entry = cache.find(e => e.hash === hash);
  if (entry) {
    // Cache expires after 24 hours
    if (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
      return entry.result;
    }
  }
  return null;
}

function addToCache(hash: string, resultJson: string, maxEntries: number): void {
  let cache = getCache();
  // Remove existing entry for same hash
  cache = cache.filter(e => e.hash !== hash);
  // Add new entry
  cache.unshift({ hash, result: resultJson, timestamp: Date.now() });
  // Trim to max
  if (cache.length > maxEntries) {
    cache = cache.slice(0, maxEntries);
  }
  saveCache(cache);
}

// ---------- Image Compression ----------

export async function compressImage(
  base64: string,
  maxSize: number = 1280,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // Only compress if larger than maxSize
      if (w <= maxSize && h <= maxSize) {
        resolve(base64);
        return;
      }

      // Scale down proportionally
      if (w > h) {
        h = Math.round((h * maxSize) / w);
        w = maxSize;
      } else {
        w = Math.round((w * maxSize) / h);
        h = maxSize;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      // Use JPEG for smaller size (unless original is PNG with transparency needs)
      const compressed = canvas.toDataURL('image/jpeg', quality);
      
      const originalKB = Math.round(base64.length * 0.75 / 1024);
      const compressedKB = Math.round(compressed.length * 0.75 / 1024);
      console.log(`[CloudAIGuard] Image compressed: ${img.naturalWidth}x${img.naturalHeight} → ${w}x${h}, ${originalKB}KB → ${compressedKB}KB (${Math.round((1 - compressedKB / originalKB) * 100)}% reduction)`);
      
      resolve(compressed);
    };
    img.onerror = () => resolve(base64); // fallback: return original
    img.src = base64;
  });
}

// ---------- Main Guard Class ----------

export class CloudAIGuard {
  private config: GuardConfig;

  constructor(config?: Partial<GuardConfig>) {
    this.config = { ...DEFAULT_GUARD_CONFIG, ...config };
  }

  /** Update guard config */
  updateConfig(config: Partial<GuardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get current daily usage count */
  getDailyUsage(): { used: number; limit: number } {
    const usage = getUsage();
    return { used: usage.count, limit: this.config.dailyLimit };
  }

  /** Check if daily limit has been reached */
  isDailyLimitReached(): boolean {
    const usage = getUsage();
    return usage.count >= this.config.dailyLimit;
  }

  /** Get remaining cooldown in seconds (0 = ready) */
  getCooldownRemaining(): number {
    const usage = getUsage();
    if (usage.lastCallTimestamp === 0) return 0;
    const elapsed = (Date.now() - usage.lastCallTimestamp) / 1000;
    const remaining = this.config.cooldownSeconds - elapsed;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  /** Check if still in cooldown period */
  isInCooldown(): boolean {
    return this.getCooldownRemaining() > 0;
  }

  /** Record a successful API call (increment usage, update timestamp) */
  recordCall(): void {
    const usage = getUsage();
    usage.count++;
    usage.lastCallTimestamp = Date.now();
    saveUsage(usage);
  }

  /** Compress image using configured settings */
  async compressImage(base64: string): Promise<string> {
    return compressImage(base64, this.config.maxImageSize, this.config.imageQuality);
  }

  /** Check dedup cache for this image, returns cached result JSON or null */
  async checkDedup(imageBase64: string): Promise<string | null> {
    if (!this.config.enableDedup) return null;
    const hash = await hashImageBase64(imageBase64);
    const cached = findCachedResult(hash);
    if (cached) {
      console.log(`[CloudAIGuard] Dedup hit! Image hash: ${hash.slice(0, 12)}...`);
    }
    return cached;
  }

  /** Cache a result for an image */
  async cacheResult(imageBase64: string, resultJson: string): Promise<void> {
    if (!this.config.enableDedup) return;
    const hash = await hashImageBase64(imageBase64);
    addToCache(hash, resultJson, this.config.maxCacheEntries);
  }

  /** Get image hash for dedup tracking */
  async getImageHash(imageBase64: string): Promise<string> {
    return hashImageBase64(imageBase64);
  }

  /**
   * Pre-flight check: returns an error code if the request should be blocked.
   * Returns null if OK to proceed.
   */
  preflightCheck(): 'DAILY_LIMIT' | 'COOLDOWN' | null {
    if (this.isDailyLimitReached()) return 'DAILY_LIMIT';
    if (this.isInCooldown()) return 'COOLDOWN';
    return null;
  }

  /** Get config (for display in UI) */
  getConfig(): GuardConfig {
    return { ...this.config };
  }

  /** Clear all guard data (usage + cache) */
  clearAll(): void {
    try {
      storageRemove(GUARD_STORAGE_KEY);
      storageRemove(CACHE_STORAGE_KEY);
    } catch { /* ignore */ }
  }
}

// Singleton instance
export const cloudAIGuard = new CloudAIGuard();
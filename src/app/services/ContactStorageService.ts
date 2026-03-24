// ============================================================================
// ContactStorageService — IndexedDB local cache + Supabase cloud sync
// ============================================================================
// Manages dealer's farmer contacts with offline-first architecture:
//   Local:  IndexedDB "dealer_contacts" store (instant reads/writes)
//   Cloud:  Supabase Edge Function /contacts CRUD (sync on login & mutations)
// ============================================================================

import { storageGet } from '../utils/safeStorage';
import { getAccessToken } from '../utils/auth';
import { CONFIG_STORAGE_KEY } from '../constants';

// ---- Data types ----

export interface DealerContact {
  id: string;
  farmerName: string;
  farmerAvatar: string;
  imUserId: string;
  imProvider: string;
  channelId: string;
  phone: string;
  storeId: string;
  pinyin: string;
  isMuted: boolean;
  boundAt: number;
  createdAt: number;
  updatedAt: number;
  // Local-only UI state (not synced)
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
}

// ---- IndexedDB setup ----

const DB_NAME = 'TaprootContactsDB';
const DB_VERSION = 1;
const STORE_NAME = 'contacts';

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('imUserId', 'imUserId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('pinyin', 'pinyin', { unique: false });
      }
    };
    request.onsuccess = () => {
      _db = request.result;
      _db.onclose = () => { _db = null; _dbPromise = null; };
      resolve(_db);
    };
    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

function idbGetAll(): Promise<DealerContact[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(contact: DealerContact): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(contact);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbDelete(id: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbClear(): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// ---- Cloud API helpers ----

function getBackendConfig() {
  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const bpc = parsed.backendProxyConfig;
    if (!bpc?.enabled || !bpc.supabaseUrl || bpc.supabaseUrl.includes('your-')) return null;
    return {
      supabaseUrl: bpc.supabaseUrl as string,
      supabaseAnonKey: bpc.supabaseAnonKey as string,
      edgeFunctionName: (bpc.edgeFunctionName || 'server') as string,
    };
  } catch { return null; }
}

function cloudUrl(path: string): string | null {
  const cfg = getBackendConfig();
  if (!cfg) return null;
  const base = cfg.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/${cfg.edgeFunctionName}${path}`;
}

function cloudHeaders(): Record<string, string> {
  const cfg = getBackendConfig();
  const token = getAccessToken();
  const anonKey = cfg?.supabaseAnonKey || '';
  return {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'Authorization': `Bearer ${token || anonKey}`,
  };
}

function isCloudAvailable(): boolean {
  return !!getBackendConfig() && !!getAccessToken();
}

// ---- Map server row → client DealerContact ----

function serverToLocal(row: Record<string, unknown>): DealerContact {
  return {
    id: String(row.id || ''),
    farmerName: String(row.farmer_name || ''),
    farmerAvatar: String(row.farmer_avatar || ''),
    imUserId: String(row.im_user_id || ''),
    imProvider: String(row.im_provider || 'tencent-im'),
    channelId: String(row.channel_id || ''),
    phone: String(row.phone || ''),
    storeId: String(row.store_id || ''),
    pinyin: String(row.pinyin || ''),
    isMuted: Boolean(row.is_muted),
    boundAt: row.bound_at ? new Date(row.bound_at as string).getTime() : Date.now(),
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).getTime() : Date.now(),
  };
}

// ---- Change listeners ----

type ContactChangeListener = (contacts: DealerContact[]) => void;
const _listeners = new Set<ContactChangeListener>();

function notifyListeners() {
  idbGetAll().then(contacts => {
    _listeners.forEach(fn => fn(contacts));
  }).catch(err => {
    console.warn('[ContactStorage] Notify failed:', err);
  });
}

// ---- Public API ----

export const contactStorage = {
  /**
   * Get all contacts from local IndexedDB.
   */
  async getAll(): Promise<DealerContact[]> {
    try {
      return await idbGetAll();
    } catch (err) {
      console.warn('[ContactStorage] getAll failed:', err);
      return [];
    }
  },

  /**
   * Add or update a contact locally, then push to cloud.
   */
  async upsert(contact: DealerContact): Promise<DealerContact> {
    contact.updatedAt = Date.now();
    await idbPut(contact);
    notifyListeners();

    if (isCloudAvailable()) {
      try {
        const url = cloudUrl('/contacts');
        if (url) {
          const res = await fetch(url, {
            method: 'POST',
            headers: cloudHeaders(),
            body: JSON.stringify({
              farmerName: contact.farmerName,
              farmerAvatar: contact.farmerAvatar,
              imUserId: contact.imUserId,
              imProvider: contact.imProvider,
              channelId: contact.channelId,
              phone: contact.phone,
              storeId: contact.storeId,
              pinyin: contact.pinyin,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.contact) {
              const synced = serverToLocal(data.contact);
              synced.lastMessage = contact.lastMessage;
              synced.lastMessageTime = contact.lastMessageTime;
              synced.unreadCount = contact.unreadCount;
              await idbPut(synced);
              notifyListeners();
              return synced;
            }
          }
        }
      } catch (err) {
        console.warn('[ContactStorage] Cloud upsert failed (local saved):', err);
      }
    }

    return contact;
  },

  /**
   * Remove a contact locally, then delete from cloud.
   */
  async remove(id: string): Promise<void> {
    await idbDelete(id);
    notifyListeners();

    if (isCloudAvailable()) {
      try {
        const url = cloudUrl(`/contacts/${id}`);
        if (url) {
          await fetch(url, { method: 'DELETE', headers: cloudHeaders() });
        }
      } catch (err) {
        console.warn('[ContactStorage] Cloud delete failed:', err);
      }
    }
  },

  /**
   * Update mute status (or other patchable fields) locally + cloud.
   */
  async patch(id: string, updates: Partial<Pick<DealerContact, 'isMuted' | 'farmerName' | 'farmerAvatar' | 'phone' | 'pinyin'>>): Promise<void> {
    const all = await idbGetAll();
    const existing = all.find(c => c.id === id);
    if (!existing) return;

    const patched = { ...existing, ...updates, updatedAt: Date.now() };
    await idbPut(patched);
    notifyListeners();

    if (isCloudAvailable()) {
      try {
        const url = cloudUrl(`/contacts/${id}`);
        if (url) {
          await fetch(url, {
            method: 'PATCH',
            headers: cloudHeaders(),
            body: JSON.stringify(updates),
          });
        }
      } catch (err) {
        console.warn('[ContactStorage] Cloud patch failed:', err);
      }
    }
  },

  /**
   * Pull all contacts from cloud and merge into local IndexedDB.
   * Returns the merged contact list.
   */
  async syncFromCloud(): Promise<DealerContact[]> {
    if (!isCloudAvailable()) {
      console.log('[ContactStorage] Cloud not available, skip sync');
      return idbGetAll();
    }

    try {
      const url = cloudUrl('/contacts');
      if (!url) return idbGetAll();

      const res = await fetch(url, { method: 'GET', headers: cloudHeaders() });
      if (!res.ok) {
        console.warn('[ContactStorage] Cloud sync failed:', res.status);
        return idbGetAll();
      }

      const data = await res.json();
      const cloudContacts: DealerContact[] = (data.contacts || []).map(serverToLocal);

      // Merge: cloud is source of truth for contact metadata,
      // local keeps lastMessage/unreadCount (UI state)
      const localContacts = await idbGetAll();
      const localMap = new Map(localContacts.map(c => [c.imUserId, c]));

      for (const cc of cloudContacts) {
        const local = localMap.get(cc.imUserId);
        if (local) {
          cc.lastMessage = local.lastMessage;
          cc.lastMessageTime = local.lastMessageTime;
          cc.unreadCount = local.unreadCount;
        }
        await idbPut(cc);
      }

      // Remove contacts that no longer exist in cloud
      const cloudIds = new Set(cloudContacts.map(c => c.id));
      for (const local of localContacts) {
        if (local.id && !cloudIds.has(local.id)) {
          await idbDelete(local.id);
        }
      }

      notifyListeners();
      console.log(`[ContactStorage] Synced ${cloudContacts.length} contacts from cloud`);
      return idbGetAll();
    } catch (err) {
      console.warn('[ContactStorage] syncFromCloud error:', err);
      return idbGetAll();
    }
  },

  /**
   * Update local lastMessage/unreadCount for a contact (no cloud sync).
   */
  async updateLocalUI(imUserId: string, updates: { lastMessage?: string; lastMessageTime?: number; unreadCount?: number }): Promise<void> {
    const all = await idbGetAll();
    const existing = all.find(c => c.imUserId === imUserId);
    if (!existing) return;
    await idbPut({ ...existing, ...updates });
    notifyListeners();
  },

  /**
   * Subscribe to contact list changes.
   */
  onChange(listener: ContactChangeListener): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  /**
   * Clear all local contacts (for logout).
   */
  async clearLocal(): Promise<void> {
    await idbClear();
    notifyListeners();
  },
};

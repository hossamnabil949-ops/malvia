// مزامنة سحابية: localStorage يظل النسخة المحلية السريعة (تعمل بدون إنترنت)،
// والتغييرات تُدمج مع السحابة بدمج ثلاثي حسب id، فلا يضيع عمل جهاز بسبب جهاز آخر.

export const SYNC_RESOURCES = ['parts','invoices','customers','suppliers','supplierPayments','supplierPaymentSchedules','treasury','employees','settings',
  'salesReturns','purchaseInvoices','purchaseReturns','expenses','partners','partnerWithdrawals','partnerExitSettlements','partnerSettlementPayments','carModels','reservations','inventoryErrors','auditLog','stockMovements','shifts','warehouses','stockLevels','stockTransfers','loyaltyLedger','cheques','stockBatches','serialUnits','bankAccounts','cardSettlements','bankLedgerEntries','openingBalances'] as const;

// حقول رقمية تُدمج بالفرق (delta) بدل الاستبدال، حتى لا يضيع خصم مخزون جهاز آخر.
export const DELTA_FIELDS: Record<string, string[]> = {
  parts: ['stockQuantity'],
  customers: ['balance', 'loyaltyPoints'],
  suppliers: ['balance'],
  stockLevels: ['quantity'],
  stockBatches: ['quantity'],
};

type Item = Record<string, any>;
export interface BaseEntry { h: string; d?: Record<string, number> }
export type BaseMap = Record<string, BaseEntry>;

export function hashOf(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}

export function buildBase(resource: string, items: Item[]): BaseMap {
  const fields = DELTA_FIELDS[resource] || [];
  const m: BaseMap = {};
  for (const it of items) {
    if (!it || it.id == null) continue;
    const e: BaseEntry = { h: hashOf(it) };
    if (fields.length) {
      e.d = {};
      for (const f of fields) if (typeof it[f] === 'number') e.d[f] = it[f];
    }
    m[String(it.id)] = e;
  }
  return m;
}

export function hasLocalChanges(resource: string, local: unknown, base: BaseMap | undefined): boolean {
  if (!Array.isArray(local)) return hashOf(local) !== (base?.__single?.h ?? '');
  const b = base || {};
  const cur = buildBase(resource, local as Item[]);
  const a = Object.keys(cur), c = Object.keys(b);
  if (a.length !== c.length) return true;
  return a.some(id => !b[id] || b[id].h !== cur[id].h);
}

// دمج ثلاثي: base (آخر نسخة متزامنة)، local (جهازي)، remote (السحابة)
export function mergeArrays(resource: string, local: Item[], remote: Item[], base: BaseMap): Item[] {
  const fields = DELTA_FIELDS[resource] || [];
  const L = new Map(local.map(i => [String(i.id), i]));
  const R = new Map(remote.map(i => [String(i.id), i]));
  const order: string[] = [];
  const seen = new Set<string>();
  for (const i of [...local, ...remote]) { const id = String(i.id); if (!seen.has(id)) { seen.add(id); order.push(id); } }
  const out: Item[] = [];
  for (const id of order) {
    const l = L.get(id), r = R.get(id), b = base[id];
    if (l && r) {
      const lChanged = !b || hashOf(l) !== b.h;
      const rChanged = !b || hashOf(r) !== b.h;
      if (!lChanged) { out.push(r); continue; }
      if (!rChanged) { out.push(l); continue; }
      if (hashOf(l) === hashOf(r)) { out.push(l); continue; }
      const merged: Item = { ...l }; // تعارض حقيقي: جهازي يكسب، مع دمج الفروق الرقمية
      if (b?.d) for (const f of fields) {
        if (typeof l[f] === 'number' && typeof r[f] === 'number' && typeof b.d[f] === 'number') {
          merged[f] = r[f] + (l[f] - b.d[f]);
        }
      }
      out.push(merged);
    } else if (l && !r) {
      // موجود عندي وغير موجود في السحابة: إما أضفته أنا (غير موجود في base) أو حذفه جهاز آخر
      if (!b) out.push(l);
      else if (hashOf(l) !== b.h) out.push(l); // عدّلته أنا بعد حذفه هناك: أبقيه
      // وإلا: حُذف في الآخر ولم أعدّله → يُحذف
    } else if (!l && r) {
      // موجود في السحابة وغير موجود عندي: إما أضافه جهاز آخر أو حذفته أنا
      if (!b) out.push(r);
      else if (hashOf(r) !== b.h) out.push(r); // عدّله الآخر بعد حذفي: أبقيه
      // وإلا: حذفته أنا → يُحذف
    }
  }
  return out;
}

// ------------------------------------------------------------------ الجزء المرتبط بالمتصفح

const lsKey = (tenant: string, res: string) => `malvia_${tenant}_${res}`;
const metaKey = (tenant: string) => `malvia_sync_meta_v1_${tenant}`;
export const SYNC_EVENT = 'malvia-sync-updated';
export const SYNC_STATUS_EVENT = 'malvia-sync-status';

interface Meta { versions: Record<string, number>; base: Record<string, BaseMap> }

function readMeta(tenant: string): Meta {
  try { const r = localStorage.getItem(metaKey(tenant)); if (r) return JSON.parse(r); } catch { /* ignore */ }
  return { versions: {}, base: {} };
}
function writeMeta(tenant: string, m: Meta) {
  try { localStorage.setItem(metaKey(tenant), JSON.stringify(m)); } catch { /* ignore */ }
}
function readLocal(tenant: string, res: string): unknown | undefined {
  try { const r = localStorage.getItem(lsKey(tenant, res)); return r === null ? undefined : JSON.parse(r); } catch { return undefined; }
}
function writeLocal(tenant: string, res: string, data: unknown) {
  try { localStorage.setItem(lsKey(tenant, res), JSON.stringify(data)); }
  catch (e) {
    // كان يُبتلع بصمت: امتلاء مساحة المتصفح يعني ضياع تغييرات. نُظهر الحالة للمستخدم.
    console.error('تعذّر الحفظ المحلي', res, e);
    emitStatus('error', 'مساحة التخزين المحلية ممتلئة: خذ نسخة احتياطية الآن');
  }
}
function baseFor(res: string, data: unknown): BaseMap {
  return Array.isArray(data) ? buildBase(res, data as Item[]) : { __single: { h: hashOf(data) } };
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'synced';
function emitStatus(s: SyncStatus, detail?: string) {
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: { status: s, detail } }));
}

let active: { tenantId: string; licenseKey: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let busy = false;
const dirty = new Set<string>();
let syncListenerCleanup: (() => void) | null = null;
// Durable outbox: pending resources survive app restarts.
const pendingKey = (tenant: string) => `malvia_sync_pending_v1_${tenant}`;
function readPending(tenant: string): string[] {
  try {
    const raw = localStorage.getItem(pendingKey(tenant));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string' && (SYNC_RESOURCES as readonly string[]).includes(r)) : [];
  } catch { return []; }
}
function writePending(tenant: string) {
  try { localStorage.setItem(pendingKey(tenant), JSON.stringify([...dirty])); }
  catch { emitStatus('error', 'تعذّر حفظ قائمة المزامنة المعلقة على الجهاز'); }
}
function queueResource(tenant: string, resource: string) {
  if (!(SYNC_RESOURCES as readonly string[]).includes(resource)) return;
  dirty.add(resource);
  writePending(tenant);
}

async function api(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const headers: Record<string, string> = { ...(init.headers || {}) };
  try {
    const raw = localStorage.getItem('malvia_user_session_v1');
    const session = raw ? JSON.parse(raw) : null;
    const pendingRaw = localStorage.getItem('malvia_pending_server_session_v1');
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    const token = session?.serverSessionToken || pending?.token;
    if (token && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${token}`;
  } catch { /* no server session: protected writes will be rejected */ }
  const r = await fetch(path, { ...init, headers });
  let body: any = null;
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, ok: r.ok, body };
}

async function pushResource(tenantId: string, licenseKey: string, res: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = readLocal(tenantId, res);
    if (local === undefined) return true;
    const meta = readMeta(tenantId);
    if (!hasLocalChanges(res, local, meta.base[res]) && meta.versions[res] !== undefined) return true;
    const r = await api('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-license-key': licenseKey },
      body: JSON.stringify({ resource: res, data: local, baseVersion: meta.versions[res] || 0 }),
    });
    if (r.ok) {
      meta.versions[res] = r.body.version;
      meta.base[res] = baseFor(res, local);
      writeMeta(tenantId, meta);
      return true;
    }
    if (r.status === 409 && r.body?.current) {
      const remote = r.body.current.data;
      const merged = Array.isArray(local) && Array.isArray(remote)
        ? mergeArrays(res, local as Item[], remote as Item[], meta.base[res] || {})
        : local;
      writeLocal(tenantId, res, merged);
      meta.versions[res] = r.body.current.version;
      // base يبقى كما هو؛ سيتغير بعد الدفع الناجح
      meta.base[res] = Array.isArray(remote) ? buildBase(res, remote as Item[]) : baseFor(res, remote);
      writeMeta(tenantId, meta);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
      continue;
    }
    throw new Error(r.body?.error || `HTTP ${r.status}`);
  }
  return false;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  // Older HTTP LAN contexts may not expose WebCrypto. Keep a deterministic
  // 128-bit fallback so a retry after a dropped response retains its key.
  return [0, 1, 2, 3].map(i => hashOf(`${i}:${value}`).split(':')[0]).join('');
}

// Push all dirty documents as one server transaction. A retry of identical
// content gets the same idempotency key, including after a lost HTTP response.
async function pushBatch(tenantId: string, licenseKey: string, resources: string[]): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const meta = readMeta(tenantId);
    const operations = resources.flatMap(resource => {
      const data = readLocal(tenantId, resource);
      if (data === undefined) return [];
      if (!hasLocalChanges(resource, data, meta.base[resource]) && meta.versions[resource] !== undefined) return [];
      return [{ resource, data, baseVersion: meta.versions[resource] || 0 }];
    });
    if (!operations.length) return;
    const serialized = JSON.stringify(operations);
    const idempotencyKey = `sync-${await sha256Hex(serialized)}`;
    const r = await api('/api/sync-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-license-key': licenseKey },
      body: JSON.stringify({ operations, idempotencyKey }),
    });
    if (r.ok) {
      for (const op of operations) {
        meta.versions[op.resource] = Number(r.body?.versions?.[op.resource]);
        meta.base[op.resource] = baseFor(op.resource, op.data);
      }
      writeMeta(tenantId, meta);
      return;
    }
    if (r.status === 409 && r.body?.conflict && r.body?.resource) {
      if (r.body.code === 'DUPLICATE_INVOICE_NUMBER') {
        throw new Error('تعارض رقم فاتورة بين جهازين. احتفظنا بالفاتورة محلياً؛ غيّر رقمها بعد مراجعة الفواتير قبل إعادة المزامنة.');
      }
      const resource = String(r.body.resource);
      const current = r.body.current;
      const local = readLocal(tenantId, resource);
      if (!current || local === undefined) {
        throw new Error(`تعارض إصدار المورد ${resource} ولا توجد نسخة خادمية كافية للدمج الآمن.`);
      }
      const remote = current.data;
      const merged = Array.isArray(local) && Array.isArray(remote)
        ? mergeArrays(resource, local as Item[], remote as Item[], meta.base[resource] || {})
        : local;
      writeLocal(tenantId, resource, merged);
      meta.versions[resource] = Number(current.version);
      meta.base[resource] = baseFor(resource, remote);
      writeMeta(tenantId, meta);
      window.dispatchEvent(new CustomEvent(SYNC_EVENT));
      continue;
    }
    throw new Error(r.body?.error || `فشل إرسال دفعة المزامنة: HTTP ${r.status}`);
  }
  throw new Error('تعذّر إتمام دفعة المزامنة بعد أربع محاولات تعارض؛ البيانات ما زالت محفوظة محلياً.');
}

export async function pullAll(tenantId: string, licenseKey: string, serverToken?: string): Promise<{ changed: boolean; tenant?: any }> {
  const headers: Record<string, string> = { 'x-license-key': licenseKey };
  if (serverToken) headers.Authorization = `Bearer ${serverToken}`;
  const r = await api('/api/sync', { method: 'GET', headers });
  if (!r.ok) throw Object.assign(new Error(r.body?.error || `HTTP ${r.status}`), { status: r.status });
  const docs: Record<string, { data: unknown; version: number }> = r.body.docs || {};
  const meta = readMeta(tenantId);
  let changed = false;
  for (const res of SYNC_RESOURCES) {
    const remote = docs[res];
    if (!remote) continue;
    const knownVersion = meta.versions[res];
    if (knownVersion !== undefined && remote.version <= knownVersion) continue;
    const local = readLocal(tenantId, res);
    const firstContact = knownVersion === undefined;
    if (firstContact || local === undefined || !hasLocalChanges(res, local, meta.base[res])) {
      writeLocal(tenantId, res, remote.data); // جهاز جديد أو لا تغييرات محلية: السحابة تكسب
      meta.base[res] = baseFor(res, remote.data);
    } else if (Array.isArray(local) && Array.isArray(remote.data)) {
      writeLocal(tenantId, res, mergeArrays(res, local as Item[], remote.data as Item[], meta.base[res] || {}));
      queueResource(tenantId, res); // durable pending merge
      meta.base[res] = buildBase(res, remote.data as Item[]);
    } else {
      meta.base[res] = baseFor(res, remote.data);
      writeLocal(tenantId, res, remote.data);
    }
    meta.versions[res] = remote.version;
    changed = true;
  }
  writeMeta(tenantId, meta);
  if (changed) window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  return { changed, tenant: r.body.tenant };
}

async function flush() {
  if (!active || busy) return;
  if (timer) { clearTimeout(timer); timer = null; }
  busy = true;
  const { tenantId, licenseKey } = active;
  try {
    readPending(tenantId).forEach(res => dirty.add(res));
    const meta = readMeta(tenantId);
    // Reconcile every local resource at startup and every sync cycle. This recovers
    // edits that were saved locally just before the app was closed.
    for (const res of SYNC_RESOURCES) {
      const local = readLocal(tenantId, res);
      if (local !== undefined && (meta.versions[res] === undefined || hasLocalChanges(res, local, meta.base[res]))) {
        queueResource(tenantId, res);
      }
    }
    emitStatus('syncing', dirty.size ? `عناصر بانتظار الرفع: ${dirty.size}` : 'فحص التغييرات المحلية');
    const list = [...dirty];
    if (!active || active.tenantId !== tenantId) return;
    await pushBatch(tenantId, licenseKey, list);
    for (const res of list) {
      const latest = readLocal(tenantId, res);
      const latestMeta = readMeta(tenantId);
      if (latest === undefined || !hasLocalChanges(res, latest, latestMeta.base[res])) {
        dirty.delete(res);
        writePending(tenantId);
      } else {
        queueResource(tenantId, res);
      }
    }
    if (dirty.size) {
      emitStatus('syncing', `ما زال هناك ${dirty.size} عنصر بانتظار المزامنة`);
      schedule(1500);
    } else {
      emitStatus('synced', 'تم رفع جميع التغييرات المحلية');
    }
  } catch (e: any) {
    emitStatus(navigator.onLine ? 'error' : 'offline', String(e?.message || e));
    schedule(15000);
  } finally { busy = false; }
}

function schedule(ms = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

/** تُستدعى من saveTenantStoreData بعد كل حفظ محلي. */
export function markDirty(tenantId: string, resources: string[]) {
  if (!active || active.tenantId !== tenantId) return;
  for (const r of resources) queueResource(tenantId, r);
  if (dirty.size) schedule();
}

export async function startSync(tenantId: string, licenseKey: string) {
  stopSync();
  let session: any = null;
  try {
    const raw = localStorage.getItem('malvia_user_session_v1');
    session = raw ? JSON.parse(raw) : null;
  } catch { session = null; }
  if (!session?.serverSessionToken) {
    emitStatus('error', 'المزامنة السحابية متوقفة: سجّل الدخول مجددًا مع اتصال الإنترنت لتوثيق الموظف.');
    return;
  }
  if (session.serverSessionExpiresAt && Date.parse(session.serverSessionExpiresAt) <= Date.now()) {
    emitStatus('error', 'انتهت جلسة الموظف السحابية: سجّل الخروج ثم الدخول مجددًا مع اتصال الإنترنت.');
    return;
  }
  active = { tenantId, licenseKey };
  dirty.clear();
  readPending(tenantId).forEach(res => dirty.add(res));
  let tickRunning = false;
  const tick = async () => {
    if (!active || active.tenantId !== tenantId || document.hidden || tickRunning) return;
    tickRunning = true;
    try {
      await pullAll(tenantId, licenseKey);
      await flush();
    } catch (e: any) {
      emitStatus(navigator.onLine ? 'error' : 'offline', String(e?.message || e));
      schedule(15000);
    } finally { tickRunning = false; }
  };
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  syncListenerCleanup = () => {
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('focus', tick);
  };
  await tick();
  poll = setInterval(tick, 15000);
}

export function stopSync() {
  const previousTenant = active?.tenantId;
  active = null;
  syncListenerCleanup?.();
  syncListenerCleanup = null;
  if (timer) clearTimeout(timer);
  if (poll) clearInterval(poll);
  timer = poll = null;
  if (previousTenant) writePending(previousTenant);
  dirty.clear();
}

/** Bootstrap returns license metadata only. Full tenant data is downloaded only after server employee authentication. */
export async function activateFromCloud(licenseKey: string, username?: string, password?: string): Promise<{ ok: boolean; tenant?: any; error?: string; offline?: boolean }> {
  try {
    const key = licenseKey.trim().toUpperCase();
    const bootstrap = await api('/api/auth/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-license-key': key }, body: JSON.stringify({ licenseKey: key }) });
    if (!bootstrap.ok) return { ok: false, error: bootstrap.body?.error || `HTTP ${bootstrap.status}` };
    const tenant = bootstrap.body.tenant;
    // Employee authentication is performed once by authenticateShopUser after local account
    // validation. Bootstrap must not silently attempt a second login or download tenant data.
    return { ok: true, tenant };
  } catch {
    return { ok: false, offline: true };
  }
}

// ------------------------------------------------------------------ سجل المحلات (لصاحب المنظومة فقط)
const ADMIN_TOKEN_KEY = 'malvia_admin_token_v1';
export const getAdminToken = () => { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } };
export const setAdminToken = (t: string) => { try { localStorage.setItem(ADMIN_TOKEN_KEY, t.trim()); } catch { /* ignore */ } };

export let lastRegistryError = '';
export function clearAdminToken() { try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ } }

export async function fetchRegistry(): Promise<any[] | null> {
  const token = getAdminToken();
  lastRegistryError = '';
  if (!token) { lastRegistryError = 'no-token'; return null; }
  try {
    const r = await api('/api/registry', { method: 'GET', headers: { 'x-admin-token': token } });
    if (r.ok) return r.body.licenses;
    lastRegistryError = r.status === 401 && r.body?.error
      ? 'bad-token'
      : r.status === 404 ? 'الـ API غير موجود (HTTP 404): تأكد أن مجلد api مرفوع'
      : r.status === 401 || r.status === 403 ? 'Vercel يحجب الطلب (HTTP ' + r.status + '): استخدم رابط الإنتاج أو عطّل Deployment Protection'
      : (r.body?.error || 'HTTP ' + r.status);
    return null;
  } catch (e: any) { lastRegistryError = 'لا يوجد اتصال: ' + String(e?.message || e); return null; }
}

export async function pushRegistry(licenses: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const token = getAdminToken();
  if (!token) return { ok: false, error: 'no-token' };
  try {
    const cur = await api('/api/registry', { method: 'GET', headers: { 'x-admin-token': token } });
    if (!cur.ok) return { ok: false, error: cur.body?.error || `HTTP ${cur.status}` };
    const r = await api('/api/registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ licenses, baseVersion: cur.body.version }),
    });
    return r.ok ? { ok: true } : { ok: false, error: r.body?.error || `HTTP ${r.status}` };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

// ------------------------------------------------------------------ النسخ الاحتياطي
export interface BackupFile {
  app: 'MALVIA';
  format: number;
  exportedAt: string;
  company?: string;
  tenantId?: string;
  source: 'server' | 'device';
  docs: Record<string, { data: unknown; version?: number }>;
}

/** نسخة من بيانات المحل: من السيرفر (الأحدث)، وإن تعذر الاتصال من النسخة المحفوظة على هذا الجهاز. */
export async function exportShopBackup(tenantId: string, licenseKey: string, company?: string): Promise<{ ok: boolean; file?: BackupFile; error?: string }> {
  try {
    const r = await api('/api/backup?action=export', { method: 'GET', headers: { 'x-license-key': licenseKey.trim().toUpperCase() } });
    if (r.ok && r.body?.docs) return { ok: true, file: { ...r.body, source: 'server' } };
    if (r.status === 401 || r.status === 403) return { ok: false, error: r.body?.error || 'مفتاح الترخيص غير صالح' };
  } catch { /* offline: fall back to the copy on this device */ }
  const docs: BackupFile['docs'] = {};
  for (const res of SYNC_RESOURCES) {
    const d = readLocal(tenantId, res);
    if (d !== undefined) docs[res] = { data: d };
  }
  if (!Object.keys(docs).length) return { ok: false, error: 'لا توجد بيانات على هذا الجهاز' };
  return { ok: true, file: { app: 'MALVIA', format: 1, exportedAt: new Date().toISOString(), company, tenantId, source: 'device', docs } };
}

export interface BackupMeta { id: number; kind: string; created_at: string; size_bytes: number; resources: number }

async function adminCall(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const token = getAdminToken();
  if (!token) return { ok: false as const, error: 'لا يوجد رمز إدارة (ADMIN_TOKEN)' };
  try {
    const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}), 'x-admin-token': token };
    const r = await api(path, { ...init, headers });
    return r.ok ? { ok: true as const, body: r.body } : { ok: false as const, error: r.body?.error || `HTTP ${r.status}` };
  } catch (e: any) { return { ok: false as const, error: 'لا يوجد اتصال: ' + String(e?.message || e) }; }
}

export async function adminListBackups(tenantId: string): Promise<{ ok: boolean; backups?: BackupMeta[]; error?: string }> {
  const r = await adminCall(`/api/backup?tenant=${encodeURIComponent(tenantId)}`);
  return r.ok ? { ok: true, backups: r.body.backups } : { ok: false, error: r.error };
}
export async function adminCreateBackup(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await adminCall('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', tenant: tenantId }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
export async function adminRestoreBackup(tenantId: string, id: number): Promise<{ ok: boolean; preRestoreId?: number | null; error?: string }> {
  const r = await adminCall('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', tenant: tenantId, id }) });
  return r.ok ? { ok: true, preRestoreId: r.body.preRestoreId } : { ok: false, error: r.error };
}
export async function adminFetchBackup(id: number): Promise<{ ok: boolean; file?: any; error?: string }> {
  const r = await adminCall(`/api/backup?id=${id}`);
  return r.ok ? { ok: true, file: r.body } : { ok: false, error: r.error };
}

export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

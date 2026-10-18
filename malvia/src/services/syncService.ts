// مزامنة سحابية: localStorage يظل النسخة المحلية السريعة (تعمل بدون إنترنت)،
// والتغييرات تُدمج مع السحابة بدمج ثلاثي حسب id، فلا يضيع عمل جهاز بسبب جهاز آخر.

export const SYNC_RESOURCES = ['parts','invoices','customers','suppliers','supplierPayments','treasury','employees','settings',
  'salesReturns','purchaseInvoices','purchaseReturns','expenses','partners','carModels','reservations','inventoryErrors'] as const;

// حقول رقمية تُدمج بالفرق (delta) بدل الاستبدال، حتى لا يضيع خصم مخزون جهاز آخر.
export const DELTA_FIELDS: Record<string, string[]> = {
  parts: ['stockQuantity'],
  customers: ['balance'],
  suppliers: ['balance'],
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
  try { localStorage.setItem(lsKey(tenant, res), JSON.stringify(data)); } catch { /* ignore */ }
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

async function api(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const r = await fetch(path, init);
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

export async function pullAll(tenantId: string, licenseKey: string): Promise<{ changed: boolean; tenant?: any }> {
  const r = await api('/api/sync', { method: 'GET', headers: { 'x-license-key': licenseKey } });
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
      dirty.add(res); // لدينا تغييرات محلية لا تزال تحتاج دفع بعد الدمج
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
  busy = true;
  const { tenantId, licenseKey } = active;
  try {
    emitStatus('syncing');
    // أول اتصال بالسحابة: ارفع كل ما هو محلي وغير موجود في السحابة
    const meta = readMeta(tenantId);
    for (const res of SYNC_RESOURCES) if (meta.versions[res] === undefined && readLocal(tenantId, res) !== undefined) dirty.add(res);
    const list = [...dirty]; dirty.clear();
    for (const res of list) {
      try { await pushResource(tenantId, licenseKey, res); } catch (e) { dirty.add(res); throw e; }
    }
    emitStatus('synced');
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
  for (const r of resources) if ((SYNC_RESOURCES as readonly string[]).includes(r)) dirty.add(r);
  if (dirty.size) schedule();
}

export async function startSync(tenantId: string, licenseKey: string) {
  stopSync();
  active = { tenantId, licenseKey };
  const tick = async () => {
    if (!active || document.hidden) return;
    try { await pullAll(active.tenantId, active.licenseKey); await flush(); }
    catch (e: any) { emitStatus(navigator.onLine ? 'error' : 'offline', String(e?.message || e)); }
  };
  await tick();
  poll = setInterval(tick, 15000);
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
}

export function stopSync() {
  active = null; dirty.clear();
  if (timer) clearTimeout(timer);
  if (poll) clearInterval(poll);
  timer = poll = null;
}

/** عند تسجيل الدخول على جهاز جديد: اجلب بيانات المحل والترخيص من السحابة قبل التحقق المحلي. */
export async function activateFromCloud(licenseKey: string): Promise<{ ok: boolean; tenant?: any; error?: string; offline?: boolean }> {
  try {
    const r = await api('/api/sync', { method: 'GET', headers: { 'x-license-key': licenseKey.trim().toUpperCase() } });
    if (!r.ok) return { ok: false, error: r.body?.error || `HTTP ${r.status}` };
    const tenant = r.body.tenant;
    // اكتب بيانات المحل محلياً حتى يجدها authenticateShopUser
    await pullAll(String(tenant.tenantId), licenseKey.trim().toUpperCase());
    return { ok: true, tenant };
  } catch {
    return { ok: false, offline: true };
  }
}

// ------------------------------------------------------------------ سجل المحلات (لصاحب المنظومة فقط)
const ADMIN_TOKEN_KEY = 'malvia_admin_token_v1';
export const getAdminToken = () => { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } };
export const setAdminToken = (t: string) => { try { localStorage.setItem(ADMIN_TOKEN_KEY, t.trim()); } catch { /* ignore */ } };

export async function fetchRegistry(): Promise<any[] | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const r = await api('/api/registry', { method: 'GET', headers: { 'x-admin-token': token } });
    return r.ok ? r.body.licenses : null;
  } catch { return null; }
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

// طبقة التخزين: Postgres (Neon) عبر Vercel Marketplace. المتغير DATABASE_URL يُضاف تلقائياً عند ربط القاعدة.

export interface Row { data: unknown; version: number }

let ready: Promise<void> | null = null;

let client: any = null;
async function sql() {
  if (client) return client;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error('قاعدة البيانات غير مربوطة: DATABASE_URL غير موجود (اربط Neon من Storage ثم Redeploy)');
  let mod: any;
  try { mod = await import('@neondatabase/serverless'); }
  catch { throw new Error('الحزمة @neondatabase/serverless غير مثبتة: تأكد أن package.json المحدث مرفوع'); }
  client = mod.neon(url);
  return client;
}

export async function init() {
  if (!ready) {
    ready = (async () => {
      const q = await sql();
      await q`create table if not exists malvia_docs (
        tenant text not null,
        resource text not null,
        data jsonb not null,
        version bigint not null default 1,
        updated_at timestamptz not null default now(),
        primary key (tenant, resource)
      )`;
      await q`create table if not exists malvia_backups (
        id bigserial primary key,
        tenant text not null,
        kind text not null default 'auto',
        docs jsonb not null,
        size_bytes bigint not null default 0,
        created_at timestamptz not null default now()
      )`;
      await q`create index if not exists malvia_backups_tenant_idx on malvia_backups (tenant, created_at desc)`;
    })();
  }
  return ready;
}

export async function getAll(tenant: string): Promise<Record<string, Row>> {
  await init();
  const rows = await (await sql())`select resource, data, version from malvia_docs where tenant = ${tenant}`;
  const out: Record<string, Row> = {};
  for (const r of rows as any[]) out[r.resource] = { data: r.data, version: Number(r.version) };
  return out;
}

export async function getOne(tenant: string, resource: string): Promise<Row | null> {
  await init();
  const rows = await (await sql())`select data, version from malvia_docs where tenant = ${tenant} and resource = ${resource}`;
  const r = (rows as any[])[0];
  return r ? { data: r.data, version: Number(r.version) } : null;
}

// كتابة مشروطة بالإصدار (optimistic concurrency). ترجع الإصدار الجديد أو null عند التعارض.
export async function putIfVersion(tenant: string, resource: string, data: unknown, baseVersion: number): Promise<number | null> {
  await init();
  const q = await sql();
  const json = JSON.stringify(data);
  if (baseVersion === 0) {
    const rows = await q`insert into malvia_docs (tenant, resource, data, version) values (${tenant}, ${resource}, ${json}::jsonb, 1)
      on conflict (tenant, resource) do nothing returning version`;
    return (rows as any[])[0] ? Number((rows as any[])[0].version) : null;
  }
  const rows = await q`update malvia_docs set data = ${json}::jsonb, version = version + 1, updated_at = now()
    where tenant = ${tenant} and resource = ${resource} and version = ${baseVersion} returning version`;
  return (rows as any[])[0] ? Number((rows as any[])[0].version) : null;
}

// ---------------------------------------------------------------- النسخ الاحتياطي
// كل نسخة = لقطة كاملة لكل موارد المحل (data + version) في صف واحد.
// الاحتفاظ: آخر 14 نسخة تلقائية، وآخر 10 يدوية، وآخر 5 قبل-الاسترجاع لكل محل (لتوفير مساحة الخطة المجانية).

export interface BackupMeta { id: number; kind: string; created_at: string; size_bytes: number; resources: number }

const KEEP: Record<string, number> = { auto: 14, manual: 10, 'pre-restore': 5 };

/** نسخة تلقائية لكل محل تغيّرت بياناته منذ آخر نسخة (يشمل سجل التراخيص). ترجع عدد النسخ المنشأة. */
export async function backupAllChanged(): Promise<number> {
  await init();
  const q = await sql();
  const rows = await q`
    insert into malvia_backups (tenant, kind, docs, size_bytes)
    select d.tenant, 'auto',
           jsonb_object_agg(d.resource, jsonb_build_object('data', d.data, 'version', d.version)),
           sum(pg_column_size(d.data))
    from malvia_docs d
    group by d.tenant
    having max(d.updated_at) > coalesce((select max(b.created_at) from malvia_backups b where b.tenant = d.tenant), 'epoch'::timestamptz)
    returning id`;
  await pruneBackups();
  return (rows as any[]).length;
}

/** نسخة فورية لمحل واحد (يدوية أو قبل الاسترجاع). ترجع رقم النسخة أو null إن لم توجد بيانات. */
export async function createBackup(tenant: string, kind: 'manual' | 'pre-restore'): Promise<number | null> {
  await init();
  const q = await sql();
  const rows = await q`
    insert into malvia_backups (tenant, kind, docs, size_bytes)
    select d.tenant, ${kind}::text,
           jsonb_object_agg(d.resource, jsonb_build_object('data', d.data, 'version', d.version)),
           sum(pg_column_size(d.data))
    from malvia_docs d
    where d.tenant = ${tenant}
    group by d.tenant
    returning id`;
  const r = (rows as any[])[0];
  if (!r) return null;
  await pruneBackups(tenant);
  return Number(r.id);
}

export async function pruneBackups(tenant?: string) {
  const q = await sql();
  for (const [kind, keep] of Object.entries(KEEP)) {
    await q`delete from malvia_backups b
      where b.kind = ${kind} and (${tenant ?? null}::text is null or b.tenant = ${tenant ?? null})
        and b.id not in (
          select id from (
            select id, row_number() over (partition by tenant order by created_at desc) rn
            from malvia_backups where kind = ${kind}
          ) x where x.rn <= ${keep}
        )`;
  }
}

export async function listBackups(tenant: string): Promise<BackupMeta[]> {
  await init();
  const rows = await (await sql())`
    select id, kind, created_at, size_bytes, (select count(*) from jsonb_object_keys(docs)) as resources
    from malvia_backups where tenant = ${tenant} order by created_at desc limit 60`;
  return (rows as any[]).map(r => ({
    id: Number(r.id), kind: r.kind, created_at: new Date(r.created_at).toISOString(),
    size_bytes: Number(r.size_bytes), resources: Number(r.resources),
  }));
}

export async function getBackup(id: number): Promise<{ tenant: string; kind: string; created_at: string; docs: Record<string, { data: unknown; version: number }> } | null> {
  await init();
  const rows = await (await sql())`select tenant, kind, created_at, docs from malvia_backups where id = ${id}`;
  const r = (rows as any[])[0];
  return r ? { tenant: r.tenant, kind: r.kind, created_at: new Date(r.created_at).toISOString(), docs: r.docs } : null;
}

/**
 * استرجاع محل واحد من نسخة: يأخذ نسخة "قبل-الاسترجاع" أولاً (لإمكانية التراجع)، ثم يستبدل بيانات هذا المحل فقط
 * داخل معاملة واحدة. الإصدارات تزيد حتى تلتقط الأجهزة التغيير في المزامنة التالية.
 */
export async function restoreBackup(id: number, tenant: string): Promise<{ preRestoreId: number | null; resources: number }> {
  const b = await getBackup(id);
  if (!b) throw new Error('النسخة غير موجودة');
  if (b.tenant !== tenant) throw new Error('هذه النسخة تخص محلاً آخر');
  const preRestoreId = await createBackup(tenant, 'pre-restore');
  const q = await sql();
  const names = Object.keys(b.docs);
  const stmts: any[] = names.map(r =>
    q`insert into malvia_docs (tenant, resource, data, version)
      values (${tenant}, ${r}, ${JSON.stringify(b.docs[r].data)}::jsonb, 1)
      on conflict (tenant, resource) do update
      set data = excluded.data, version = malvia_docs.version + 1, updated_at = now()`
  );
  stmts.push(q`delete from malvia_docs where tenant = ${tenant} and not (resource = any(${names}))`);
  await q.transaction(stmts);
  return { preRestoreId, resources: names.length };
}

export async function listTenantsWithData(): Promise<string[]> {
  await init();
  const rows = await (await sql())`select distinct tenant from malvia_docs order by tenant`;
  return (rows as any[]).map(r => String(r.tenant));
}

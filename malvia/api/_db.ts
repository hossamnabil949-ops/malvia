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

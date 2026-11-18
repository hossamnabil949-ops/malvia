import React, { useEffect, useState } from 'react';
import { getAdminToken } from '../services/syncService';

type Plan = {
  id: string; name: string; monthlyPrice: number; annualPrice: number;
  maxEmployees: number; devicesLimit: number; active: boolean;
  allowedFeatures: Record<string, boolean>;
};
type AuditEntry = {
  at: string; action: string; tenantId?: string; companyName?: string;
  actor?: string; fields?: string[]; before?: Record<string, unknown>;
  after?: Record<string, unknown>; featureChanges?: Array<{feature:string;from:unknown;to:unknown}>;
  planCount?: number;
};

const DEFAULT_FEATURES: Record<string, boolean> = {
  canUsePos:true, canUseInventory:true, canUseStockMonitoring:true,
  canUsePurchases:true, canUseSuppliers:true, canUseCustomers:true,
  canUseTreasury:true, canUseReports:true, canUseAdvancedReports:true,
  canUseAI:true, canUseVoiceAI:true, canUseWorkshops:false, canUseHR:false,
};
const FEATURE_LABELS: Record<string,string> = {
  canUsePos:'نقطة البيع', canUseInventory:'إدارة المخزون',
  canUseStockMonitoring:'مراقبة المخزون', canUsePurchases:'المشتريات',
  canUseSuppliers:'الموردون', canUseCustomers:'العملاء', canUseTreasury:'الخزينة والبنوك',
  canUseReports:'التقارير', canUseAdvancedReports:'التحليلات المتقدمة',
  canUseAI:'الذكاء الاصطناعي AI', canUseVoiceAI:'المساعد الصوتي',
  canUseWorkshops:'الورش والصيانة', canUseHR:'الموارد البشرية',
};

export const OwnerCatalogAuditModal: React.FC<{onClose:()=>void}> = ({onClose}) => {
  const [tab,setTab]=useState<'plans'|'audit'>('plans');
  const [plans,setPlans]=useState<Plan[]>([]);
  const [audit,setAudit]=useState<AuditEntry[]>([]);
  const [version,setVersion]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const token=getAdminToken();

  const load=async()=>{
    setLoading(true); setError('');
    try {
      if(!token) throw new Error('رمز الإدارة السحابي غير متاح. أعد تسجيل الدخول إلى لوحة المالك.');
      const [p,a]=await Promise.all([
        fetch('/api/registry?resource=plans',{headers:{'x-admin-token':token}}),
        fetch('/api/registry?resource=owner_audit',{headers:{'x-admin-token':token}}),
      ]);
      if(!p.ok||!a.ok) throw new Error('تعذر تحميل الباقات أو سجل التدقيق من السحابة.');
      const pj=await p.json(), aj=await a.json();
      setPlans(Array.isArray(pj.plans)?pj.plans:[]);
      setVersion(Number(pj.version)||0);
      setAudit(Array.isArray(aj.owner_audit)?aj.owner_audit.slice().reverse():[]);
      setDirty(false);
    } catch(e:any){setError(e?.message||'حدث خطأ أثناء التحميل.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const updatePlan=(id:string,patch:Partial<Plan>)=>{
    setPlans(old=>old.map(p=>p.id===id?{...p,...patch}:p)); setDirty(true);
  };
  const addPlan=()=>{
    const id='plan-'+Date.now().toString(36);
    setPlans(old=>[...old,{id,name:'باقة جديدة',monthlyPrice:0,annualPrice:0,maxEmployees:5,devicesLimit:1,active:true,allowedFeatures:{...DEFAULT_FEATURES}}]);
    setDirty(true);
  };
  const save=async()=>{
    setSaving(true);setError('');
    try{
      const res=await fetch('/api/registry',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify({resource:'plans',plans,baseVersion:version})});
      if(res.status===409) throw new Error('تم تعديل الباقات من جلسة أخرى. أعد تحميل البيانات قبل الحفظ.');
      if(!res.ok) throw new Error('فشل حفظ الباقات على السحابة.');
      const data=await res.json();setVersion(Number(data.version)||version);setDirty(false);await load();setTab('audit');
    }catch(e:any){setError(e?.message||'تعذر حفظ الباقات.');}
    finally{setSaving(false);}
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3" dir="rtl">
    <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-surface-2 text-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-neutral-800 p-4">
        <div><h3 className="font-black">إدارة الباقات وسجل التدقيق</h3><p className="mt-1 text-xs text-neutral-400">إعدادات مركزية محفوظة في سجل MALVIA السحابي</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800" aria-label="إغلاق">✕</button>
      </header>
      <div className="flex gap-2 border-b border-neutral-800 px-4 pt-3">
        <button onClick={()=>setTab('plans')} className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab==='plans'?'bg-amber-500 text-black':'text-neutral-400'}`}>الباقات والأسعار</button>
        <button onClick={()=>setTab('audit')} className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab==='audit'?'bg-amber-500 text-black':'text-neutral-400'}`}>سجل العمليات ({audit.length})</button>
      </div>
      <main className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading?<p className="py-8 text-center text-sm text-neutral-400">جارٍ تحميل البيانات...</p>:tab==='plans'?<>
          <div className="flex items-center justify-between gap-2"><p className="text-xs text-neutral-400">السعر صفر يعني أن السعر لم يُحدد بعد. تعديل كتالوج الباقات لا يغير تلقائياً أسعار اشتراكات العملاء القائمة.</p><button onClick={addPlan} className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black">+ إضافة باقة</button></div>
          {plans.length===0&&<p className="rounded-xl border border-dashed border-neutral-700 p-5 text-center text-sm text-neutral-400">لا توجد باقات محفوظة بعد. أضف الباقات وحدد أسعارها وحدودها.</p>}
          {plans.map(plan=><section key={plan.id} className="space-y-3 rounded-xl border border-neutral-800 bg-surface-1 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="col-span-2 sm:col-span-1 text-xs text-neutral-400">اسم الباقة<input value={plan.name} onChange={e=>updatePlan(plan.id,{name:e.target.value})} className="mt-1 w-full rounded-lg border border-neutral-700 bg-surface-2 p-2 text-sm text-white"/></label>
              <label className="text-xs text-neutral-400">السعر الشهري<input type="number" min="0" value={plan.monthlyPrice} onChange={e=>updatePlan(plan.id,{monthlyPrice:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-neutral-700 bg-surface-2 p-2 text-sm text-white"/></label>
              <label className="text-xs text-neutral-400">السعر السنوي<input type="number" min="0" value={plan.annualPrice} onChange={e=>updatePlan(plan.id,{annualPrice:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-neutral-700 bg-surface-2 p-2 text-sm text-white"/></label>
              <label className="text-xs text-neutral-400">حد المستخدمين<input type="number" min="1" value={plan.maxEmployees} onChange={e=>updatePlan(plan.id,{maxEmployees:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-neutral-700 bg-surface-2 p-2 text-sm text-white"/></label>
              <label className="text-xs text-neutral-400">حد الأجهزة<input type="number" min="1" value={plan.devicesLimit} onChange={e=>updatePlan(plan.id,{devicesLimit:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-neutral-700 bg-surface-2 p-2 text-sm text-white"/></label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-neutral-700 p-2 text-xs"><input type="checkbox" checked={plan.active} onChange={e=>updatePlan(plan.id,{active:e.target.checked})}/>متاحة للاشتراكات الجديدة</label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(FEATURE_LABELS).map(([key,label])=><label key={key} className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={plan.allowedFeatures?.[key]??false} onChange={e=>updatePlan(plan.id,{allowedFeatures:{...plan.allowedFeatures,[key]:e.target.checked}})}/>{label}</label>)}</div>
          </section>)}
        </>:<div className="space-y-2">
          {audit.length===0&&<p className="py-8 text-center text-sm text-neutral-400">لا توجد عمليات مسجلة حتى الآن.</p>}
          {audit.map((entry,i)=><article key={i} className="rounded-xl border border-neutral-800 bg-surface-1 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{entry.companyName||'إدارة الباقات'}</strong><time className="text-[10px] text-neutral-500" dir="ltr">{new Date(entry.at).toLocaleString('ar-EG')}</time></div>
            <p className="mt-1 text-xs text-amber-300">{entry.action==='LICENSE_CREATED'?'إصدار ترخيص':entry.action==='LICENSE_UPDATED'?'تعديل بيانات الترخيص':entry.action==='LICENSE_REMOVED'?'حذف ترخيص':'تحديث كتالوج الباقات'}</p>
            {entry.fields?.length?<p className="mt-1 break-words text-xs text-neutral-400">الحقول المعدلة: {entry.fields.join('، ')}</p>:null}
            {entry.featureChanges?.length?<p className="mt-1 text-xs text-neutral-400">تغييرات الخصائص: {entry.featureChanges.map(x=>FEATURE_LABELS[x.feature]||x.feature).join('، ')}</p>:null}
            {entry.tenantId?<p className="mt-1 font-mono text-[10px] text-neutral-500" dir="ltr">{entry.tenantId}</p>:null}
          </article>)}
        </div>}
        {error&&<p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      </main>
      <footer className="flex items-center justify-between gap-2 border-t border-neutral-800 p-3">
        <button onClick={()=>void load()} className="rounded-lg bg-neutral-800 px-4 py-2 text-xs font-bold">إعادة تحميل</button>
        {tab==='plans'&&<button disabled={!dirty||saving||loading} onClick={()=>void save()} className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-black disabled:opacity-40">{saving?'جارٍ الحفظ...':'حفظ الباقات'}</button>}
      </footer>
    </div>
  </div>;
};

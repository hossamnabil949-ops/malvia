import React, { useMemo, useState } from 'react';
import { Warehouse as WarehouseIcon, ArrowLeftRight, Plus, Trash2, Search, History, Boxes, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AutoPart, StockLevel, StockTransfer, Warehouse } from '../types/autoParts';
import { MAIN_WAREHOUSE_ID, MAIN_WAREHOUSE_NAME, availableIn, normalizeWarehouseId } from '../utils/warehouseLogic';

interface WarehousesViewProps {
  warehouses: Warehouse[];
  parts: AutoPart[];
  stockLevels: StockLevel[];
  transfers: StockTransfer[];
  canManage: boolean;
  onSaveWarehouse: (w: Warehouse) => void;
  onTransfer: (input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    items: { partId: string; quantity: number }[];
    note?: string;
  }) => { ok: boolean; message?: string };
}

type Tab = 'stock' | 'transfer' | 'history' | 'manage';

const inputCls =
  'w-full h-9 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400';

export const WarehousesView: React.FC<WarehousesViewProps> = ({
  warehouses,
  parts,
  stockLevels,
  transfers,
  canManage,
  onSaveWarehouse,
  onTransfer,
}) => {
  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.active), [warehouses]);
  const allOptions = useMemo(
    () => [{ id: MAIN_WAREHOUSE_ID, name: MAIN_WAREHOUSE_NAME }, ...activeWarehouses.map((w) => ({ id: w.id, name: w.name }))],
    [activeWarehouses]
  );
  const nameOf = (id: string): string =>
    normalizeWarehouseId(id) === MAIN_WAREHOUSE_ID ? MAIN_WAREHOUSE_NAME : warehouses.find((w) => w.id === id)?.name || id;

  // ---------- تبويب «المخزون بالمخازن» ----------
  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? parts.filter((p) => p.name.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q) || (p.barcode || '').includes(q))
      : parts;
    return list.slice(0, 200);
  }, [parts, search]);

  // ---------- تبويب «تحويل جديد» ----------
  const [fromId, setFromId] = useState<string>(MAIN_WAREHOUSE_ID);
  const [toId, setToId] = useState<string>('');
  const [pickPartId, setPickPartId] = useState('');
  const [pickQty, setPickQty] = useState('1');
  const [pickSearch, setPickSearch] = useState('');
  const [lines, setLines] = useState<{ partId: string; quantity: number }[]>([]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pickable = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    const list = q ? parts.filter((p) => p.name.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q)) : parts;
    return list.slice(0, 50);
  }, [parts, pickSearch]);

  const addLine = () => {
    const qty = Math.floor(Number(pickQty));
    if (!pickPartId || !Number.isFinite(qty) || qty <= 0) return;
    setLines((prev) => {
      const hit = prev.find((l) => l.partId === pickPartId);
      return hit ? prev.map((l) => (l.partId === pickPartId ? { ...l, quantity: l.quantity + qty } : l)) : [...prev, { partId: pickPartId, quantity: qty }];
    });
    setPickPartId('');
    setPickQty('1');
    setMsg(null);
  };

  const submitTransfer = () => {
    if (!toId) {
      setMsg({ ok: false, text: 'اختر المخزن المحوَّل إليه' });
      return;
    }
    const res = onTransfer({ fromWarehouseId: fromId, toWarehouseId: toId, items: lines, note });
    if (res.ok) {
      setMsg({ ok: true, text: `تم التحويل (${res.message})` });
      setLines([]);
      setNote('');
    } else {
      setMsg({ ok: false, text: res.message || 'تعذّر التحويل' });
    }
  };

  // ---------- تبويب «إدارة المخازن» ----------
  const [newName, setNewName] = useState('');
  const [newBranch, setNewBranch] = useState('');

  const holdsStock = (warehouseId: string) => stockLevels.some((l) => l.warehouseId === warehouseId && l.quantity > 0);

  const addWarehouse = () => {
    const name = newName.trim();
    if (!name || name === MAIN_WAREHOUSE_NAME) return;
    if (warehouses.some((w) => w.name === name)) return;
    onSaveWarehouse({
      id: `wh-${Date.now()}`,
      name,
      branch: newBranch.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString().split('T')[0],
    });
    setNewName('');
    setNewBranch('');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'stock', label: 'المخزون بالمخازن', icon: <Boxes className="w-3.5 h-3.5" /> },
    { id: 'transfer', label: 'تحويل جديد', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
    { id: 'history', label: 'سجل التحويلات', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'manage', label: 'إدارة المخازن', icon: <WarehouseIcon className="w-3.5 h-3.5" /> },
  ];

  if (!canManage) {
    return (
      <div className="p-6 rounded-2xl bg-surface-1 border border-neutral-800 text-sm text-neutral-300">
        إدارة المخازن والتحويلات متاحة للمدير أو لمن لديه صلاحية إدارة المخزون.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center gap-2">
        <WarehouseIcon className="w-5 h-5 text-amber-400" />
        <h2 className="text-base font-black text-white">المخازن والفروع</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 h-8 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors ${
              tab === t.id ? 'bg-amber-500 text-black border-amber-500' : 'bg-surface-1 text-neutral-300 border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-2.5" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم القطعة أو الرقم أو الباركود" className={`${inputCls} pr-9`} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-surface-1 text-neutral-400">
                <tr>
                  <th className="p-2 text-right">القطعة</th>
                  {allOptions.map((w) => (
                    <th key={w.id} className="p-2 text-center whitespace-nowrap">{w.name}</th>
                  ))}
                  <th className="p-2 text-center">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-800">
                    <td className="p-2">
                      <div className="font-bold text-white">{p.name}</div>
                      <div className="font-mono text-[10px] text-amber-400">{p.partNumber}</div>
                    </td>
                    {allOptions.map((w) => {
                      const q = availableIn(p.stockQuantity, stockLevels, p.id, w.id);
                      return (
                        <td key={w.id} className={`p-2 text-center font-mono ${q < 0 ? 'text-rose-400 font-black' : q === 0 ? 'text-neutral-600' : 'text-white'}`}>
                          {q}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-mono font-black text-amber-300">{p.stockQuantity}</td>
                  </tr>
                ))}
                {filteredParts.length === 0 && (
                  <tr>
                    <td colSpan={allOptions.length + 2} className="p-6 text-center text-neutral-500">لا توجد أصناف مطابقة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-neutral-500">
            رصيد «{MAIN_WAREHOUSE_NAME}» = إجمالي الصنف ناقص أرصدة باقي المخازن. التعديلات اليدوية للرصيد والجرد تُطبَّق على المخزن الرئيسي.
          </p>
        </div>
      )}

      {tab === 'transfer' && (
        <div className="space-y-3 p-4 rounded-2xl bg-surface-1 border border-neutral-800">
          {activeWarehouses.length === 0 && (
            <div className="text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> أضف مخزناً أو فرعاً من تبويب «إدارة المخازن» أولاً.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-neutral-400 block mb-1">من مخزن:</label>
              <select value={fromId} onChange={(e) => { setFromId(e.target.value); setMsg(null); }} className={inputCls}>
                {allOptions.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-neutral-400 block mb-1">إلى مخزن:</label>
              <select value={toId} onChange={(e) => { setToId(e.target.value); setMsg(null); }} className={inputCls}>
                <option value="">— اختر —</option>
                {allOptions.filter((w) => w.id !== fromId).map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5">
              <label className="text-[11px] font-bold text-neutral-400 block mb-1">بحث عن قطعة:</label>
              <input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="اسم أو رقم" className={inputCls} />
            </div>
            <div className="col-span-4">
              <select value={pickPartId} onChange={(e) => setPickPartId(e.target.value)} className={inputCls}>
                <option value="">— اختر القطعة —</option>
                {pickable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partNumber} · {p.name} (متاح {availableIn(p.stockQuantity, stockLevels, p.id, fromId)})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <input type="number" min="1" step="1" value={pickQty} onChange={(e) => setPickQty(e.target.value)} className={`${inputCls} text-center font-mono`} />
            </div>
            <button type="button" onClick={addLine} disabled={!pickPartId} className="col-span-1 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black flex items-center justify-center" title="إضافة للتحويل">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {lines.length > 0 && (
            <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800">
              {lines.map((l) => {
                const p = parts.find((x) => x.id === l.partId);
                const avail = p ? availableIn(p.stockQuantity, stockLevels, p.id, fromId) : 0;
                return (
                  <div key={l.partId} className="p-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{p?.name}</div>
                      <div className="font-mono text-[10px] text-neutral-500">{p?.partNumber} · المتاح في المصدر: {avail}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-black ${l.quantity > avail ? 'text-rose-400' : 'text-amber-300'}`}>{l.quantity}</span>
                      <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.partId !== l.partId))} className="text-neutral-500 hover:text-rose-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className={inputCls} />

          {msg && (
            <div className={`text-xs font-bold flex items-center gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {msg.text}
            </div>
          )}

          <button
            type="button"
            onClick={submitTransfer}
            disabled={lines.length === 0}
            className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black"
          >
            تنفيذ التحويل
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {transfers.length === 0 && <div className="p-6 text-center text-xs text-neutral-500">لا توجد تحويلات بعد</div>}
          {transfers.map((t) => (
            <div key={t.id} className="p-3 rounded-2xl bg-surface-1 border border-neutral-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-amber-400">{t.transferNumber}</span>
                <span className="text-neutral-500">{t.date} · {t.time} · {t.createdBy}</span>
              </div>
              <div className="font-bold text-white flex items-center gap-2">
                {nameOf(t.fromWarehouseId)} <ArrowLeftRight className="w-3.5 h-3.5 text-neutral-500" /> {nameOf(t.toWarehouseId)}
              </div>
              <div className="text-neutral-400">
                {t.items.map((i) => `${i.partName || i.partNumber} × ${i.quantity}`).join(' · ')}
              </div>
              {t.note && <div className="text-[11px] text-neutral-500">ملاحظة: {t.note}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'manage' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-surface-1 border border-neutral-800 space-y-2">
            <h3 className="text-xs font-black text-white">إضافة مخزن / فرع جديد</h3>
            <div className="grid grid-cols-2 gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="الاسم * (مثال: فرع مدينة نصر)" className={inputCls} />
              <input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="العنوان / وصف (اختياري)" className={inputCls} />
            </div>
            <button type="button" onClick={addWarehouse} disabled={!newName.trim()} className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-black">
              إضافة
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-800 divide-y divide-neutral-800 text-xs">
            <div className="p-3 flex items-center justify-between bg-surface-1">
              <div>
                <div className="font-bold text-white">{MAIN_WAREHOUSE_NAME}</div>
                <div className="text-[10px] text-neutral-500">أساسي — لا يمكن حذفه أو تعطيله</div>
              </div>
              <span className="text-emerald-400 font-bold">نشط</span>
            </div>
            {warehouses.map((w) => {
              const locked = w.active && holdsStock(w.id);
              return (
                <div key={w.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className={`font-bold ${w.active ? 'text-white' : 'text-neutral-500 line-through'}`}>{w.name}</div>
                    {w.branch && <div className="text-[10px] text-neutral-500">{w.branch}</div>}
                    {locked && <div className="text-[10px] text-amber-400">به رصيد — حوّله أولاً لتعطيله</div>}
                  </div>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onSaveWarehouse({ ...w, active: !w.active })}
                    className="px-3 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold text-neutral-200"
                  >
                    {w.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

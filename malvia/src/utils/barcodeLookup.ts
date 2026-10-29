import { AutoPart } from '../types/autoParts';

// تنظيف الكود الممسوح (مسافات / أحرف تحكم)
export const cleanBarcode = (raw: string): string =>
  String(raw ?? '').replace(/[\u0000-\u001F\u007F\s]+/g, '').trim();

// البحث عن القطعة بالباركود (الأولوية) ثم رقم OEM — مطابقة تامة بدون حساسية لحالة الأحرف
export const findPartByBarcode = (parts: AutoPart[], raw: string): AutoPart | undefined => {
  const code = cleanBarcode(raw).toLowerCase();
  if (!code) return undefined;
  return (
    parts.find((p) => cleanBarcode(p.barcode || '').toLowerCase() === code) ||
    parts.find((p) => cleanBarcode(p.partNumber || '').toLowerCase() === code)
  );
};

// صوت تأكيد قصير (نجاح / فشل) بدون أي ملفات صوت
export const beep = (ok = true) => {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = ok ? 1100 : 280;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    setTimeout(() => ctx.close?.(), 400);
  } catch { /* ignore */ }
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* ignore */ }
};

import React, { useEffect, useRef, useState } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { cleanBarcode } from '../utils/barcodeLookup';
import { BrowserMultiFormatReader } from '@zxing/browser';

// ───────────────────────────────────────────────────────────────
// 1) قارئ الباركود USB/بلوتوث: يكتب الكود بسرعة كبيرة ثم Enter.
//    نلتقطه على مستوى الصفحة (حتى لو مفيش حقل مفتوح) ونفرّق بينه وبين الكتابة اليدوية بسرعة الضغط.
// ───────────────────────────────────────────────────────────────
export function useBarcodeWedge(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  const lastSeenRef = useRef<Record<string, number>>({});
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buf = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      const gap = now - last;
      last = now;

      if (e.key === 'Enter') {
        if (buf.length >= 4) {
          const code = cleanBarcode(buf);
          buf = '';
          if (code) {
            e.preventDefault();
            e.stopPropagation();
            cb.current(code);
          }
        } else {
          buf = '';
        }
        return;
      }
      if (e.key.length !== 1) return;
      // الكتابة اليدوية أبطأ من 50ms بين الحروف → نبدأ من جديد
      if (gap > 50) buf = '';
      buf += e.key;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

// ───────────────────────────────────────────────────────────────
// 2) زر كاميرا: يفتح نافذة مسح مستمر (يفضل مفتوح لمسح عدة قطع ورا بعض)
// ───────────────────────────────────────────────────────────────
interface BarcodeScanButtonProps {
  onScan: (code: string) => void;
  label?: string;
  className?: string;
  /** يظل مفتوحاً بعد كل مسح (للبيع والجرد). false = يقفل بعد أول كود */
  continuous?: boolean;
  /** نص يظهر أسفل الكاميرا (نتيجة آخر مسح مثلاً) */
  status?: string;
}

export const BarcodeScanButton: React.FC<BarcodeScanButtonProps> = ({
  onScan,
  label = 'مسح',
  className = '',
  continuous = true,
  status = '',
}) => {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan);
  const lastSeenRef = useRef<Record<string, number>>({});
  cb.current = onScan;

  const openCamera = () => {
    setMsg('');
    setPendingCode('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader();
    const seen: Record<string, number> = {};
    lastSeenRef.current = seen;
    const startReader = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('افتح النظام من رابط HTTPS أو localhost لتشغيل الكاميرا.'), { name: 'SecurityError' });
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (stopped) return;
        const preferred = devices.find(d => /back|rear|environment|خلف/i.test(d.label)) || devices[devices.length - 1];
        if (!preferred) throw Object.assign(new Error('لم يتم العثور على كاميرا في الجهاز.'), { name: 'NotFoundError' });
        controls = await reader.decodeFromVideoDevice(preferred.deviceId, videoRef.current!, result => {
          if (stopped || !result) return;
          const code = cleanBarcode(result.getText());
          const now = Date.now();
          if (code && now - (seen[code] || 0) > 1800) { seen[code] = now; setPendingCode(code); }
        });
        if (stopped) controls.stop();
      } catch (e: any) {
        if (stopped) return;
        const n = e?.name || '';
        setMsg(n === 'NotAllowedError' || n === 'SecurityError' ? (e?.message || 'اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح.') : n === 'NotFoundError' ? (e?.message || 'لم يتم العثور على كاميرا.') : n === 'NotReadableError' ? 'الكاميرا مستخدمة بواسطة تطبيق آخر. أغلقه ثم حاول مرة أخرى.' : 'تعذر تشغيل الكاميرا. تحقق من إذن الكاميرا ثم أعد المحاولة.');
        setOpen(false);
      }
    };
    startReader();
    return () => {
      stopped = true;
      controls?.stop();
      reader.reset();
      const v = videoRef.current;
      if (v) { (v.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={`h-11 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1.5 text-xs font-bold shrink-0 active:scale-95 ${className}`}
        title="مسح باركود بالكاميرا"
      >
        <ScanBarcode className="w-4 h-4" />
        <span>{label}</span>
      </button>
      {msg && <p className="text-[11px] text-rose-300 w-full">{msg}</p>}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4" dir="rtl">
          <div className="relative w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-950 border border-amber-500/40">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-amber-400/80 pointer-events-none" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 left-3 p-2 rounded-lg bg-black/60 text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent text-center">
              <p className="text-xs text-neutral-200 min-h-[18px]">{pendingCode ? `تمت قراءة: ${pendingCode}` : (status || 'وجّه الكاميرا نحو الباركود')}</p>
            </div>
          </div>
          <div className="mt-4 flex w-full max-w-md gap-3">
            <button
              type="button"
              disabled={!pendingCode}
              onClick={() => {
                if (!pendingCode) return;
                cb.current(pendingCode);
                delete lastSeenRef.current[pendingCode];
                setPendingCode('');
              }}
              className="flex-1 h-12 rounded-xl bg-amber-500 text-neutral-950 text-sm font-black disabled:opacity-40"
            >
              تأكيد وإضافة
            </button>
            <button
              type="button"
              onClick={() => { setPendingCode(''); setOpen(false); }}
              className="flex-1 h-12 rounded-xl bg-neutral-800 border border-neutral-600 text-white text-sm font-bold"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </>
  );
};

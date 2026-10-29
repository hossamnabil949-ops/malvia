import React, { useEffect, useRef, useState } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { cleanBarcode } from '../utils/barcodeLookup';

// ───────────────────────────────────────────────────────────────
// 1) قارئ الباركود USB/بلوتوث: يكتب الكود بسرعة كبيرة ثم Enter.
//    نلتقطه على مستوى الصفحة (حتى لو مفيش حقل مفتوح) ونفرّق بينه وبين الكتابة اليدوية بسرعة الضغط.
// ───────────────────────────────────────────────────────────────
export function useBarcodeWedge(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan);
  cb.current = onScan;

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const openCamera = () => {
    setMsg('');
    if (!supported) {
      setMsg('متصفح الجهاز ده مش بيقرا الباركود بالكاميرا (شغّال على Chrome أندرويد). استخدم قارئ باركود أو اكتب الكود.');
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const lastSeen: Record<string, number> = {};

    const run = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMsg('الكاميرا غير متاحة (الصفحة تحتاج https).');
          setOpen(false);
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'],
        });
        let busy = false;
        const tick = async () => {
          if (stopped) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const found = await detector.detect(video);
              if (found.length > 0 && found[0].rawValue) {
                const code = cleanBarcode(String(found[0].rawValue));
                const now = Date.now();
                // نفس الكود مايتحسبش مرتين خلال ثانيتين (الكاميرا بتشوفه عدة إطارات)
                if (code && now - (lastSeen[code] || 0) > 2000) {
                  lastSeen[code] = now;
                  cb.current(code);
                  if (!continuous) { setOpen(false); return; }
                }
              }
            } catch { /* تجاهل أخطاء الإطار الواحد */ }
            busy = false;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e: any) {
        const n = e?.name || '';
        setMsg(
          n === 'NotAllowedError' || n === 'SecurityError'
            ? 'تم رفض إذن الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة.'
            : n === 'NotFoundError'
            ? 'لم يتم العثور على كاميرا.'
            : 'تعذر تشغيل الكاميرا.'
        );
        setOpen(false);
      }
    };
    run();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) { (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); v.srcObject = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className="relative w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-amber-500/40">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-amber-400/80 pointer-events-none" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 left-3 p-2 rounded-lg bg-black/60 text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent text-center">
              <p className="text-xs text-neutral-200 min-h-[18px]">{status || 'وجّه الكاميرا نحو الباركود'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 px-6 h-11 rounded-xl bg-neutral-800 border border-neutral-600 text-white text-sm font-bold"
          >
            تم / إغلاق
          </button>
        </div>
      )}
    </>
  );
};

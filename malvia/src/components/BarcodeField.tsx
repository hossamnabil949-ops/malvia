import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

interface BarcodeFieldProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

// حقل باركود: يُكتب يدوياً، أو بقارئ باركود USB/بلوتوث (يكتب في الحقل مباشرة)،
// أو بزر الكاميرا لتسجيل الكود فقط (إذن الكاميرا كالميكروفون، بدون أي بحث).
// يعتمد على BarcodeDetector المدمج في متصفح الأندرويد (Chrome) — بلا مكتبات إضافية.
export const BarcodeField: React.FC<BarcodeFieldProps> = ({ value, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const openCamera = () => {
    setMsg('');
    if (!supported) {
      setMsg('متصفح هذا الجهاز لا يقرأ الباركود بالكاميرا (متاح في Chrome على الأندرويد). اكتب الكود أو استخدم قارئ باركود.');
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;

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
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'],
        });
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              if (found.length > 0 && found[0].rawValue) {
                if (navigator.vibrate) navigator.vibrate(80);
                onChange(String(found[0].rawValue).trim());
                setOpen(false);
                return;
              }
            }
          } catch { /* تجاهل أخطاء الإطار الواحد */ }
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
            : 'تعذر تشغيل الكاميرا. اكتب الكود يدوياً.'
        );
        setOpen(false);
      }
    };
    run();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      const v = videoRef.current;
      if (v) { (v.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="اكتب الباركود أو امسحه بالكاميرا"
          className={`flex-grow h-9 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono text-xs ${className}`}
        />
        <button
          type="button"
          onClick={openCamera}
          className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1.5 text-xs font-bold shrink-0 active:scale-95"
          title="تسجيل الباركود بالكاميرا"
        >
          <Camera className="w-4 h-4" />
          <span>كاميرا</span>
        </button>
      </div>

      {msg && <p className="text-[11px] text-rose-300">{msg}</p>}

      {open && (
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-amber-500/40">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-x-6 top-1/2 h-0.5 bg-amber-400/80 pointer-events-none" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="absolute bottom-2 inset-x-0 text-center text-[11px] text-neutral-200">وجّه الكاميرا نحو الباركود</span>
        </div>
      )}
    </div>
  );
};

import React, { useRef } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

// يصغّر الصورة (أقصى 1024px) ويحوّلها JPEG لتقليل الحجم؛
// صور كاميرا الموبايل كبيرة وتملأ مساحة التخزين المحلي فيفشل الحفظ.
export const compressImage = (file: File, maxSize = 1024, quality = 0.75): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });

interface PhotoPickerProps {
  onPick: (dataUrl: string) => void;
  hasImage?: boolean;
  className?: string;
}

// زرّان ظاهران دائماً: «التقاط بالكاميرا» (يفتح الكاميرا الخلفية مباشرة) و«من المعرض».
export const PhotoPicker: React.FC<PhotoPickerProps> = ({ onPick, hasImage, className = '' }) => {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // يسمح باختيار نفس الصورة مرة أخرى
    if (!file) return;
    try {
      onPick(await compressImage(file));
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => onPick(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const btn =
    'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors active:scale-95';

  return (
    <div className={`flex items-center gap-2 w-full ${className}`}>
      <button
        type="button"
        onClick={() => camRef.current?.click()}
        className={`${btn} bg-amber-500 hover:bg-amber-400 text-neutral-950`}
      >
        <Camera className="w-4 h-4" />
        <span>{hasImage ? 'التقاط صورة جديدة' : 'التقاط بالكاميرا'}</span>
      </button>
      <button
        type="button"
        onClick={() => galRef.current?.click()}
        className={`${btn} bg-surface-1 hover:bg-neutral-800 border border-neutral-700 text-neutral-200`}
      >
        <ImageIcon className="w-4 h-4 text-amber-400" />
        <span>من المعرض</span>
      </button>
      {/* مخفيان بطريقة تعمل على iOS/Android (ليس display:none) */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handle}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        onChange={handle}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

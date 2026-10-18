import React, { useState } from 'react';
import { 
  Camera, 
  Upload, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  X, 
  Image as ImageIcon, 
  Sparkles,
  Printer,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { AutoPart } from '../types/autoParts';

interface PhotoSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  onUpdatePartImage?: (partId: string, imageUrl: string) => void;
}

export const PhotoSharingModal: React.FC<PhotoSharingModalProps> = ({
  isOpen,
  onClose,
  parts,
  onUpdatePartImage,
}) => {
  const [selectedPartId, setSelectedPartId] = useState<string>(parts[0]?.id || '');
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState('');

  if (!isOpen) return null;

  const currentPart = parts.find(p => p.id === selectedPartId) || parts[0];
  const activeImage = uploadedImage || currentPart?.imageUrl || 'https://images.unsplash.com/photo-1600790142055-619df03207e6?w=800&q=80';

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setUploadedImage(result);
        if (onUpdatePartImage && currentPart) {
          onUpdatePartImage(currentPart.id, result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleShareWhatsApp = () => {
    const phone = recipientPhone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `مرحباً،\nإليك صورة قطعة الغيار من مركز MALVIA:\n` +
      `الصنف: ${currentPart.name}\n` +
      `كود القطعة: ${currentPart.partNumber}\n` +
      `الماركة: ${currentPart.brand} (${currentPart.compatibleModels})\n` +
      `السعر: ${currentPart.salePrice} ج.م\n` +
      (caption ? `ملاحظات: ${caption}\n` : '') +
      `للتأكيد ومطابقة العينة!`
    );
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handleCopyDetails = () => {
    const text = `صورة وبيانات صنف: ${currentPart.name} (${currentPart.partNumber}) - سعر: ${currentPart.salePrice} ج.م - التوافق: ${currentPart.compatibleModels}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadImage = () => {
    const a = document.createElement('a');
    a.href = activeImage;
    a.download = `MALVIA_Part_${currentPart.partNumber}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-2xl bg-surface-2 rounded-3xl border border-amber-500/40 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-surface-3 to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Camera className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  مساحة مشاركة صور القطع والقطع للعملاء والورش
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  مشاركة فورية
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                التقاط أو رفع صور قطع الغيار والقطع لمعاينتها ومشاركتها مباشرة على واتساب
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Part Selector */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 space-y-1.5 text-xs">
            <label className="font-bold text-neutral-300 block">اختر الصنف المراد مشاركة صورته أو فحص عيّنته:</label>
            <select
              value={selectedPartId}
              onChange={(e) => {
                setSelectedPartId(e.target.value);
                setUploadedImage('');
              }}
              className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
            >
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isScreenOrDisplay ? '🖥️ []' : '⚙️ [قطعة]'} {p.name} ({p.partNumber}) - {p.brand} - {p.salePrice} ج.م
                </option>
              ))}
            </select>
          </div>

          {/* Photo Display Canvas Area */}
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-surface-0 border-2 border-dashed border-neutral-700 flex items-center justify-center group shadow-inner">
            <img
              src={activeImage}
              alt={currentPart.name}
              className="w-full h-full object-contain p-2"
            />

            {/* Overlay Action Buttons */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-xs">
              <label className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs cursor-pointer shadow-lg flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>رفع صورة جديدة</span>
                <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
              </label>

              <button
                onClick={handleDownloadImage}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs shadow-lg flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>تنزيل الصورة</span>
              </button>
            </div>
          </div>

          {/* Part Meta Badge */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-white text-sm block">{currentPart.name}</span>
              <span className="text-[11px] text-neutral-400 font-mono">
                كود OEM: <strong className="text-amber-400">{currentPart.partNumber}</strong> · الرف: {currentPart.shelfLocation} · التوافق: {currentPart.compatibleModels}
              </span>
            </div>
            <div className="text-left rtl:text-right font-mono font-black text-base text-emerald-400">
              {currentPart.salePrice.toLocaleString()} ج.م
            </div>
          </div>

          {/* Caption & WhatsApp Sharing Setup */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-neutral-300 block mb-1">
                رقم هاتف الواتساب للمستلم (ورشة أو عميل - اختياري):
              </label>
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="010XXXXXXXX (أو اتركه فارغاً لفتح قائمة المحادثات)"
                className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-neutral-300 block mb-1">
                ملاحظات مرافقة للصورة (تظهر في الرسالة):
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="مثال: متوفر فيش فابريكا، ضمان تجربة 14 يوم، أصلي وكالة..."
                className="w-full h-10 px-3 rounded-xl bg-surface-1 border border-neutral-700 text-white"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleShareWhatsApp}
                className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-[#ffffff] font-black text-xs shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>إرسال ومشاركة الصورة عبر الواتساب</span>
              </button>

              <button
                onClick={handleCopyDetails}
                className="py-3 px-4 rounded-2xl bg-surface-3 hover:bg-surface-4 text-amber-300 border border-amber-500/30 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'تم النسخ!' : 'نسخ تفاصيل القطعة للحافظة'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-1 border-t border-neutral-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

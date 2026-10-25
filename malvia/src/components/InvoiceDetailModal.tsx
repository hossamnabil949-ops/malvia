import React, { useRef, useState } from 'react';
import { 
  X, 
  Printer, 
  FileDown, 
  Share2, 
  CarFront, 
  Check, 
  Loader2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { paymentLines } from '../utils/paymentLines';
import { Invoice, ShopSettings } from '../types/autoParts';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  settings,
  isOpen,
  onClose,
}) => {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPdfSuccess, setIsPdfSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isGeneratingPdf) return;

    try {
      setIsGeneratingPdf(true);

      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const position = 10;
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);

      pdf.save(`فاتورة_${invoice.invoiceNumber}.pdf`);

      setIsPdfSuccess(true);
      setTimeout(() => setIsPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('حدث خطأ أثناء إنشاء ملف الـ PDF. يرجى المحاولة مجدداً.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `مرحباً ${invoice.customerName}،\nإليك تفاصيل فاتورتك من ${settings.shopName || 'المحل'}:\nرقم الفاتورة: ${invoice.invoiceNumber}\nالتاريخ: ${invoice.date}\nالإجمالي: ${invoice.grandTotal.toFixed(2)} ج.م\n${paymentLines(invoice).length > 1 ? 'السداد:\n' + paymentLines(invoice).map(p => `- ${p.method}: ${p.amount.toFixed(2)} ج.م`).join('\n') : 'طريقة السداد: ' + invoice.paymentMethod}\nشكراً لتعاملكم معنا!`
    );
    const phone = invoice.customerPhone ? invoice.customerPhone.replace(/[^0-9]/g, '') : '';
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="paper w-full max-w-md bg-white text-neutral-900 rounded-3xl p-6 shadow-2xl relative my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200 mb-4 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isPdfSuccess
                  ? 'bg-emerald-600 text-[#ffffff]'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-white active:scale-95'
              }`}
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>جاري إنشاء PDF...</span>
                </>
              ) : isPdfSuccess ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>تم تحميل PDF!</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-amber-400" />
                  <span>تحميل PDF</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs hover:bg-amber-400 transition-colors shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة بون</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-xs hover:bg-emerald-100 transition-colors"
              title="إرسال الفاتورة للعميل عبر واتساب"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>واتساب</span>
            </button>
          </div>

          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={invoiceRef} className="p-2 bg-white">
          <div className="text-center space-y-1.5 border-b border-neutral-200 pb-4">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.shopName}
                className="h-20 w-auto max-w-[220px] object-contain mx-auto"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-2xl font-black flex items-center justify-center mx-auto">
                {(settings.shopName || 'م').trim().charAt(0)}
              </div>
            )}
            <h2 className="text-base font-black text-neutral-950">
              {settings.shopName}
            </h2>
            {settings.address && (
              <p className="text-[10px] text-neutral-600">{settings.address}</p>
            )}
            {settings.phone && (
              <p className="text-[10px] text-neutral-600">
                هاتف: <span className="font-mono" dir="ltr">{settings.phone}</span>
              </p>
            )}
            {(settings.commercialRegister || settings.taxId) && (
              <div className="text-[10px] text-neutral-500 font-mono">
                {settings.commercialRegister}
                {settings.commercialRegister && settings.taxId ? ' · ' : ''}
                {settings.taxId ? `بطاقة ضريبية: ${settings.taxId}` : ''}
              </div>
            )}
            <p className="text-[11px] text-neutral-700 pt-1">
              فاتورة بيع ضريبية مبسطة وإذن صرف بضاعة
            </p>
            {invoice.status && invoice.status !== 'مسددة' && (
              <div className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-300">
                {invoice.status === 'مرتجع كلي' ? 'مرتجع بالكامل' : `مرتجع جزئي (مخصوم: ${invoice.returnedAmount?.toFixed(2)} ج.م)`}
              </div>
            )}
          </div>

          <div className="py-3 text-[11px] space-y-1 border-b border-neutral-200">
            <div className="flex justify-between">
              <span className="text-neutral-500">رقم الفاتورة:</span>
              <span className="font-mono font-bold text-neutral-950">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">التاريخ والوقت:</span>
              <span className="font-mono text-neutral-800">{invoice.date} {invoice.time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">الزبون / الورشة:</span>
              <span className="font-bold text-neutral-900">{invoice.customerName}</span>
            </div>
            {invoice.customerPhone && (
              <div className="flex justify-between">
                <span className="text-neutral-500">رقم الهاتف:</span>
                <span className="font-mono text-neutral-800">{invoice.customerPhone}</span>
              </div>
            )}
            {invoice.carDetails && (
              <div className="flex justify-between">
                <span className="text-neutral-500">بيانات السيارة:</span>
                <span className="text-neutral-800 font-medium">{invoice.carDetails}</span>
              </div>
            )}
            {paymentLines(invoice).length > 1 ? (
              <div className="space-y-1">
                <span className="text-neutral-500 block">طريقة السداد (دفع مقسّم):</span>
                {paymentLines(invoice).map((p, i) => (
                  <div key={i} className="flex justify-between pr-3">
                    <span className="font-bold text-neutral-900">
                      {p.method}
                      {p.isCredit && <span className="mr-1 text-[10px] font-normal text-amber-700">(يُضاف على حساب العميل)</span>}
                    </span>
                    <span className="font-mono font-bold text-neutral-900">{p.amount.toFixed(2)} ج.م</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-neutral-500">طريقة السداد:</span>
                <span className="font-bold text-neutral-900">{invoice.paymentMethod}</span>
              </div>
            )}
          </div>

          <div className="py-3 border-b border-neutral-200">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-200">
                  <th className="pb-1.5">الصنف</th>
                  <th className="pb-1.5 text-center">الكمية</th>
                  <th className="pb-1.5 text-center">سعر الوحدة</th>
                  <th className="pb-1.5 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoice.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5">
                      <span className="font-bold text-neutral-900 block truncate max-w-[150px]">
                        {it.partName}
                      </span>
                      <span className="text-[9px] font-mono text-neutral-500 block">
                        {it.partNumber}
                      </span>
                    </td>
                    <td className="py-1.5 text-center font-mono font-bold">
                      {it.quantity}
                      {(it.returnedQuantity || 0) > 0 && (
                        <span className="block text-[9px] text-rose-600 font-bold">مرتجع: {it.returnedQuantity}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-center font-mono">{it.unitPrice.toFixed(2)} ج.م</td>
                    <td className="py-1.5 font-mono text-left font-bold text-neutral-950">{it.total.toFixed(2)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="py-3 text-xs space-y-1 border-b border-neutral-200">
            <div className="flex justify-between text-neutral-600">
              <span>المجموع قبل الضريبة:</span>
              <span className="font-mono">{invoice.subtotal.toFixed(2)} ج.م</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>الخصم / التخفيض:</span>
                <span className="font-mono">-{invoice.discount.toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-neutral-600">
              <span>ضريبة القيمة المضافة:</span>
              <span className="font-mono">
                {invoice.tax > 0 ? `${invoice.tax.toFixed(2)} ج.م (${settings.vatRate ?? 14}%)` : 'معفى / بدون ضريبة (0.00 ج.م)'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-neutral-950 pt-1.5 border-t border-neutral-200">
              <span>الإجمالي النهائي المستحق:</span>
              <span className="font-mono text-lg text-amber-700">{invoice.grandTotal.toFixed(2)} ج.م</span>
            </div>
            {invoice.status === 'ملغاة' && (
              <div className="mt-2 p-2 text-center border-2 border-rose-600 rounded-lg text-rose-700 font-black text-xs leading-relaxed">
                فاتورة ملغاة{invoice.voidedAt ? ` بتاريخ ${invoice.voidedAt.slice(0, 10)}` : ''}
                {invoice.voidReason ? ` — السبب: ${invoice.voidReason}` : ''}
                {invoice.voidApprovedBy ? ` — بموافقة: ${invoice.voidApprovedBy}` : ''}
              </div>
            )}
            {(invoice.returnedAmount || 0) > 0 && (
              <>
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>{invoice.status === 'مرتجع كلي' ? 'مرتجع مبيعات (بالكامل):' : 'مرتجع مبيعات (جزئي):'}</span>
                  <span className="font-mono">-{(invoice.returnedAmount || 0).toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-sm font-black text-neutral-950 pt-1 border-t border-neutral-200">
                  <span>الصافي بعد المرتجع:</span>
                  <span className="font-mono">{Math.max(0, invoice.grandTotal - (invoice.returnedAmount || 0)).toFixed(2)} ج.م</span>
                </div>
              </>
            )}
          </div>

          <div className="pt-4 text-center space-y-1">
            {settings.invoiceFooterNotes && (
              <p className="text-[10px] text-neutral-600 font-medium">
                {settings.invoiceFooterNotes}
              </p>
            )}
            <p className="text-[9px] text-neutral-500">
              الكاشير: {invoice.cashierName}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-dashed border-neutral-300 text-center space-y-1">
            <img
              src="/logo-invoice.png"
              alt="MALVIA"
              className="h-10 w-auto mx-auto"
              draggable={false}
            />
            <p className="text-[11px] font-bold text-neutral-800">
              أهلاً بكم في MALVIA، نسعد بخدمتكم دائماً
            </p>
            <p className="text-[10px] text-neutral-600">
              للتواصل والدعم:{' '}
              <span className="font-mono font-bold text-neutral-900" dir="ltr">01070087411</span>
            </p>
            <p className="text-[9px] text-neutral-400 pt-1.5 mt-1 border-t border-neutral-200">
              © {new Date().getFullYear()} MALVIA. جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

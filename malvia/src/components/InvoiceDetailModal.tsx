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
import { Invoice } from '../types/autoParts';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
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

      pdf.save(`فاتورة_MALVIA_${invoice.invoiceNumber}.pdf`);

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
      `مرحباً ${invoice.customerName}،\nإليك تفاصيل فاتورتك من نظام MALVIA لقطع غيار السيارات MALVIA:\nرقم الفاتورة: ${invoice.invoiceNumber}\nالتاريخ: ${invoice.date}\nالإجمالي: ${invoice.grandTotal.toFixed(2)} ج.م\nطريقة السداد: ${invoice.paymentMethod}\nشكراً لتعاملكم معنا!`
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
        className="w-full max-w-md bg-white text-neutral-900 rounded-3xl p-6 shadow-2xl relative my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200 mb-4 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isPdfSuccess
                  ? 'bg-emerald-600 text-white'
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
          <div className="text-center space-y-2 border-b border-neutral-200 pb-4">
            <img src="/logo-invoice.png" alt="MALVIA" className="h-20 w-auto mx-auto" />
            <h2 className="text-base font-black text-neutral-950">
              MALVIA لقطع غيار السيارات
            </h2>
            <p className="text-[11px] text-neutral-600">
              فاتورة بيع ضريبية مبسطة وإذن صرف بضاعة
            </p>
            <div className="text-[10px] text-neutral-500 font-mono">
              س.ت: 104928-القاهرة · بطاقة ضريبية: 394-882-105
            </div>
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
            <div className="flex justify-between">
              <span className="text-neutral-500">طريقة السداد:</span>
              <span className="font-bold text-neutral-900">{invoice.paymentMethod}</span>
            </div>
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
                    <td className="py-1.5 text-center font-mono font-bold">{it.quantity}</td>
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
                {invoice.tax > 0 ? `${invoice.tax.toFixed(2)} ج.م (14%)` : 'معفى / بدون ضريبة (0.00 ج.م)'}
              </span>
            </div>
            <div className="flex justify-between text-base font-black text-neutral-950 pt-1.5 border-t border-neutral-200">
              <span>الإجمالي النهائي المستحق:</span>
              <span className="font-mono text-lg text-amber-600">{invoice.grandTotal.toFixed(2)} ج.م</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] text-neutral-600 font-medium">
              شكراً لتعاملكم مع MALVIA · القطع الكهربائية غير قابلة للاسترجاع بعد التركيب
            </p>
            <p className="text-[9px] text-neutral-500 mt-0.5">
              شارع دمشق، روكسي، مصر الجديدة، القاهرة - هاتف: 01009876543
            </p>
            <span className="text-[9px] text-neutral-400 mt-1">
              الكاشير: {invoice.cashierName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

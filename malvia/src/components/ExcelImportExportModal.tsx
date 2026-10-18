import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  FileText, 
  Sparkles,
  ArrowRight,
  Database,
  Boxes,
  Car,
  Receipt
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AutoPart, CarModel, Invoice, Customer, Supplier, CarBrand, PartCategory } from '../types/autoParts';

interface ExcelImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  carModels: CarModel[];
  invoices: Invoice[];
  customers: Customer[];
  suppliers: Supplier[];
  onImportParts: (newParts: AutoPart[]) => void;
  onImportCarModels?: (newModels: CarModel[]) => void;
}

export const ExcelImportExportModal: React.FC<ExcelImportExportModalProps> = ({
  isOpen,
  onClose,
  parts,
  carModels,
  invoices,
  customers,
  suppliers,
  onImportParts,
  onImportCarModels,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    message?: string;
    count?: number;
  } | null>(null);

  if (!isOpen) return null;

  // 1. Download Sample Excel Template for parts
  const handleDownloadSamplePartsTemplate = () => {
    const sampleData = [
      {
        'رقم القطعة OEM': '04465-33470',
        'اسم القطعة': 'طقم تيل فرامل أمامي سيراميك',
        'الماركة': 'تويوتا',
        'السيارات المتوافقة': 'كامري 2018-2024 / راف فور',
        'القسم': 'فرامل ومكابح',
        'المنشأ والجودة': 'أصلي وكالة OEM',
        'مكان الرف': 'رف B-04',
        'سعر الشراء والتكلفة': 480,
        'سعر البيع': 650,
        'الكمية الحالية': 15,
        'حد التنبيه الأدنى': 5,
        'الوحدة': 'طقم'
      },
      {
        'رقم القطعة OEM': '04152-YZZA6',
        'اسم القطعة': 'فلتر زيت محرك أصلي مع ربلات',
        'الماركة': 'تويوتا',
        'السيارات المتوافقة': 'كورولا، كامري، ياريس',
        'القسم': 'فلاتر وزيوت',
        'المنشأ والجودة': 'أصلي وكالة OEM',
        'مكان الرف': 'رف A-01',
        'سعر الشراء والتكلفة': 75,
        'سعر البيع': 120,
        'الكمية الحالية': 50,
        'حد التنبيه الأدنى': 10,
        'الوحدة': 'قطعة'
      },
      {
        'رقم القطعة OEM': 'SCR-AND-10IN',
        'اسم القطعة': 'فلتر زيت أصلي',
        'الماركة': 'هيونداي',
        'السيارات المتوافقة': 'إلنترا CN7 / AD',
        'القسم': 'كهرباء وإلكترونيات',
        'المنشأ والجودة': 'تجاري درجة 1',
        'مكان الرف': 'قسم الكهرباء E-01',
        'سعر الشراء والتكلفة': 2600,
        'سعر البيع': 3700,
        'الكمية الحالية': 6,
        'حد التنبيه الأدنى': 2,
        'الوحدة': 'قطعة'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قالب_أصناف_قطع_الغيار');
    XLSX.writeFile(wb, 'قالب_إكسيل_نموذجي_أصناف_مالفيا.xlsx');
  };

  // 2. Download Sample Excel Template for Car Models
  const handleDownloadSampleCarModelsTemplate = () => {
    const sampleData = [
      {
        'الماركة': 'تويوتا',
        'اسم الموديل': 'كورولا (Corolla)',
        'سنة الصنع من': 2014,
        'سنة الصنع إلى': 2024,
        'مواصفات المحرك': '1.6L / 1.8L Hybrid',
        'الجيل': 'E210 و E170',
        'ملاحظات': 'أكثر سيارة انتشاراً'
      },
      {
        'الماركة': 'هيونداي',
        'اسم الموديل': 'إلنترا (Elantra CN7)',
        'سنة الصنع من': 2021,
        'سنة الصنع إلى': 2025,
        'مواصفات المحرك': '1.6L SmartStream',
        'الجيل': 'CN7 الشكل الحديث',
        'ملاحظات': 'فحمات وقطع غيار'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قالب_موديلات_السيارات');
    XLSX.writeFile(wb, 'قالب_إكسيل_نموذجي_موديلات_السيارات.xlsx');
  };

  // 3. Handle File Upload & Parse for Parts
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          setImportStatus({
            success: false,
            message: 'الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات صالحة.'
          });
          return;
        }

        const newPartsList: AutoPart[] = [];
        const newModelsList: CarModel[] = [];

        data.forEach((row, idx) => {
          // Detect if it's car models file or parts file
          if (row['اسم الموديل'] || row['modelName'] || row['Model']) {
            newModelsList.push({
              id: `cm-import-${Date.now()}-${idx}`,
              brand: (row['الماركة'] || row['brand'] || 'تويوتا') as CarBrand,
              modelName: row['اسم الموديل'] || row['modelName'] || `موديل ${idx + 1}`,
              yearFrom: Number(row['سنة الصنع من'] || row['yearFrom'] || 2015),
              yearTo: Number(row['سنة الصنع إلى'] || row['yearTo'] || 2025),
              engineSpecs: row['مواصفات المحرك'] || row['engineSpecs'] || '',
              generation: row['الجيل'] || row['generation'] || '',
              notes: row['ملاحظات'] || row['notes'] || 'مستورد من شيت إكسيل'
            });
          } else {
            // AutoPart item
            const partNum = row['رقم القطعة OEM'] || row['partNumber'] || row['PartNumber'] || row['الكود'] || `OEM-${Math.floor(10000 + Math.random() * 90000)}`;
            const name = row['اسم القطعة'] || row['name'] || row['Name'] || row['الصنف'] || 'قطعة غيار غير محددة';
            const brand = (row['الماركة'] || row['brand'] || 'شامل') as CarBrand;
            const compatibleModels = row['السيارات المتوافقة'] || row['compatibleModels'] || 'شامل';
            const category = (row['القسم'] || row['category'] || 'فرامل ومكابح') as PartCategory;
            const origin = row['المنشأ والجودة'] || row['origin'] || 'تجاري درجة 1';
            const shelfLocation = row['مكان الرف'] || row['shelfLocation'] || 'رف عام';
            const costPrice = Number(row['سعر الشراء والتكلفة'] || row['costPrice'] || row['التكلفة'] || 100);
            const salePrice = Number(row['سعر البيع'] || row['salePrice'] || row['البيع'] || Math.round(costPrice * 1.35));
            const stockQuantity = Number(row['الكمية الحالية'] || row['stockQuantity'] || row['الكمية'] || 10);
            const minAlertStock = Number(row['حد التنبيه الأدنى'] || row['minAlertStock'] || 3);
            const unit = row['الوحدة'] || row['unit'] || 'قطعة';
            const isScreenOrDisplay = false;

            newPartsList.push({
              id: `part-import-${Date.now()}-${idx}`,
              partNumber: String(partNum).trim(),
              name: String(name).trim(),
              brand,
              compatibleModels: String(compatibleModels).trim(),
              category,
              origin,
              shelfLocation: String(shelfLocation).trim(),
              costPrice,
              salePrice,
              stockQuantity,
              minAlertStock,
              unit,
              isScreenOrDisplay
            });
          }
        });

        if (newPartsList.length > 0) {
          onImportParts(newPartsList);
          setImportStatus({
            success: true,
            message: `تم بنجاح استيراد وإدراج ${newPartsList.length} صنف وقطعة غيار في المستودع والمحل!`,
            count: newPartsList.length
          });
        } else if (newModelsList.length > 0 && onImportCarModels) {
          onImportCarModels(newModelsList);
          setImportStatus({
            success: true,
            message: `تم بنجاح استيراد ${newModelsList.length} موديل سيارة جديد في النظام!`,
            count: newModelsList.length
          });
        }
      } catch (err) {
        console.error('Error parsing excel:', err);
        setImportStatus({
          success: false,
          message: 'حدث خطأ أثناء قراءة ملف الإكسيل. تأكد من أن الملف بصيغة .xlsx أو .csv صحيحة.'
        });
      }
    };

    reader.readAsBinaryString(file);
  };

  // Full Export Functions
  const handleExportFullInventory = () => {
    const data = parts.map((p, idx) => ({
      'م': idx + 1,
      'رقم القطعة OEM': p.partNumber,
      'اسم القطعة': p.name,
      'الماركة': p.brand,
      'السيارات المتوافقة': p.compatibleModels,
      'القسم': p.category,
      'المنشأ / الجودة': p.origin,
      'مكان الرف': p.shelfLocation,
      'سعر الشراء / التكلفة (ج.م)': p.costPrice,
      'سعر البيع قطاعي (ج.م)': p.salePrice,
      'الكمية المتوفرة بالمخزن': p.stockQuantity,
      'حد التنبيه الأدنى': p.minAlertStock,
      'الوحدة': p.unit,
      'إجمالي التكلفة': p.stockQuantity * p.costPrice,
      'إجمالي القيمة البيعية': p.stockQuantity * p.salePrice
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أصناف_المخزون_والمحل');
    XLSX.writeFile(wb, `MALVIA_Full_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCarModels = () => {
    const data = carModels.map((m, idx) => ({
      'م': idx + 1,
      'الماركة': m.brand,
      'اسم الموديل': m.modelName,
      'سنة الصنع من': m.yearFrom,
      'سنة الصنع إلى': m.yearTo,
      'مواصفات المحرك': m.engineSpecs || '—',
      'الجيل / الهيكل': m.generation || '—',
      'ملاحظات التوافق': m.notes || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'موديلات_السيارات');
    XLSX.writeFile(wb, `MALVIA_Car_Models_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#0F1422] rounded-3xl border border-emerald-500/40 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#13231D] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  استيراد وتصدير البيانات من شيت إكسيل (Excel Integration)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  .XLSX & CSV
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                رفع شيتات إكسيل لإدراج الأصناف والموديلات دفعة واحدة وتصدير كشوفات الجرد
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

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-800 bg-[#0C101A] text-xs font-bold">
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all ${
              activeTab === 'import'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>1. استيراد شيت إكسيل إلى السيستم (Import)</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all ${
              activeTab === 'export'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>2. تصدير البيانات إلى شيت إكسيل (Export)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-neutral-200">
          
          {activeTab === 'import' ? (
            <div className="space-y-5">
              {/* Step 1: Download Templates */}
              <div className="p-4 rounded-2xl bg-[#141A28] border border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Sparkles className="w-4 h-4" />
                    <span>الخطوة 1: تنزيل نموذج شيت إكسيل فارغ لتعبئة بياناتك:</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">جاهز للتعبئة</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={handleDownloadSamplePartsTemplate}
                    className="p-3 rounded-xl bg-[#0E121C] hover:bg-[#181F30] border border-neutral-700 hover:border-amber-500 text-right text-xs transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-white block">قالب أصناف قطع الغيار</span>
                      <span className="text-[10px] text-neutral-400">يشمل: كود OEM، الاسم، التكلفة، البيع، والرف</span>
                    </div>
                    <Download className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  </button>

                  <button
                    onClick={handleDownloadSampleCarModelsTemplate}
                    className="p-3 rounded-xl bg-[#0E121C] hover:bg-[#181F30] border border-neutral-700 hover:border-amber-500 text-right text-xs transition-all flex items-center justify-between group"
                  >
                    <div>
                      <span className="font-bold text-white block">قالب موديلات وسنوات السيارات</span>
                      <span className="text-[10px] text-neutral-400">يشمل: الماركة، الموديل، سنة الصنع والمحرك</span>
                    </div>
                    <Download className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  </button>
                </div>
              </div>

              {/* Step 2: Upload File Box */}
              <div className="p-6 rounded-3xl bg-[#0A0E18] border-2 border-dashed border-emerald-500/40 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-md">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">اختر أو اسحب ملف الإكسيل (.XLSX أو .CSV)</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    سيقوم النظام بقراءة الأعمدة وتحديث رصيد المخزن وموديلات السيارات تلقائياً
                  </p>
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-neutral-950 font-black text-xs cursor-pointer shadow-lg active:scale-95 transition-all">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تحديد ملف إكسيل لرفعه الآن</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Status Alert */}
              {importStatus && (
                <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 animate-fade-in ${
                  importStatus.success
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                }`}>
                  {importStatus.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span className="font-bold leading-relaxed">{importStatus.message}</span>
                </div>
              )}
            </div>
          ) : (
            /* Export Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>تصدير كشوفات وسجلات النظام إلى شيتات إكسيل جاهزة:</span>
                </h4>
                <span className="text-[11px] text-neutral-400 font-mono">تصدير بضغطة واحدة</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-[#131828] border border-neutral-800 hover:border-emerald-500/40 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                      <Boxes className="w-4 h-4 text-amber-400" />
                      <span>شيت إكسيل جرد المخزون والقطع بالكامل</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      تصدير كافة قطع الغيار وأرقام OEM وأماكن الرفوف والأسعار
                    </p>
                  </div>
                  <button
                    onClick={handleExportFullInventory}
                    className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-emerald-600 hover:text-white text-xs font-bold text-neutral-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل شيت المخزون ({parts.length} صنف)</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-[#131828] border border-neutral-800 hover:border-emerald-500/40 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                      <Car className="w-4 h-4 text-blue-400" />
                      <span>شيت إكسيل موديلات وسنوات السيارات</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      تصدير قائمة ماركات وموديلات السيارات ومواصفات المحركات المسجلة
                    </p>
                  </div>
                  <button
                    onClick={handleExportCarModels}
                    className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-emerald-600 hover:text-white text-xs font-bold text-neutral-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل شيت الموديلات ({carModels.length} موديل)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0C101A] border-t border-neutral-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

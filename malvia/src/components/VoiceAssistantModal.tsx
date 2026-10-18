import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  MicOff, 
  Sparkles, 
  Send, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertCircle, 
  Boxes, 
  Receipt, 
  DollarSign, 
  Wrench,
  Loader2,
  TrendingDown,
  ArrowRight,
  History,
  RotateCcw
} from 'lucide-react';
import { AutoPart, Customer } from '../types/autoParts';
import { 
  sendVoiceCommandToServer, 
  AICommandResult, 
  speakArabic, 
  stopArabicSpeech 
} from '../services/aiVoiceService';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  customers: Customer[];
  onDirectSale: (part: AutoPart, quantity: number, customerName: string, paymentMethod: string) => void;
  onOpenAudit: (part: AutoPart) => void;
  onRestock: (partId: string, quantity: number) => void;
  onAddExpense: (title: string, amount: number) => void;
  onSettleSupplier?: (supplierName: string, amount: number) => void;
  onCollectCustomer?: (customerName: string, amount: number) => void;
  onAddPurchase?: (supplierName: string, amount: number) => void;
  onOpenNotifications: () => void;
  onNavigateTab: (tab: any) => void;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  parts,
  customers,
  onDirectSale,
  onOpenAudit,
  onRestock,
  onAddExpense,
  onSettleSupplier,
  onCollectCustomer,
  onAddPurchase,
  onOpenNotifications,
  onNavigateTab,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<AICommandResult | null>(null);
  const [history, setHistory] = useState<AICommandResult[]>([]);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSpeechSupported(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopArabicSpeech();
    }
  }, [isOpen]);

  const startListening = () => {
    setMicError(null);
    setTranscript('');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      setMicError('المتصفح لا يدعم ميزة الميكروفون المباشر. يمكنك كتابة الأمر في المربع بالأسفل أو النقر على الأوامر السريعة.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMicError('يرجى السماح بالوصول للميكروفون من إعدادات المتصفح.');
        } else if (event.error !== 'no-speech') {
          setMicError(`تنبيه الميكروفون: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Could not start recognition:', err);
      setIsListening(false);
      setMicError('تعذر تشغيل الميكروفون حالياً، يمكنك استخدام الإدخال الكتابي بالأسفل.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const handleExecuteCommand = async (commandText: string) => {
    const textToExecute = commandText.trim();
    if (!textToExecute) return;

    stopListening();
    setIsProcessing(true);
    setMicError(null);

    try {
      const result = await sendVoiceCommandToServer(textToExecute, parts, customers);
      setLastResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 9)]);

      if (result.action === 'EXECUTE_SALE') {
        const part = parts.find((p) => p.id === result.matchedPartId) || parts[0];
        if (part) {
          const qty = result.quantity || 1;
          const cust = result.customerName || 'عميل نقدي';
          const method = result.paymentMethod || 'نقدي';
          onDirectSale(part, qty, cust, method);
        }
      } else if (result.action === 'INVENTORY_AUDIT') {
        const part = parts.find((p) => p.id === result.matchedPartId);
        if (part) {
          onOpenAudit(part);
        } else {
          onNavigateTab('inventory');
        }
      } else if (result.action === 'RESTOCK_ITEM' && result.matchedPartId) {
        onRestock(result.matchedPartId, result.quantity || 5);
      } else if (result.action === 'ADD_EXPENSE' && result.expenseAmount) {
        onAddExpense(result.expenseTitle || 'مصروف عام', result.expenseAmount);
      } else if (result.action === 'SETTLE_SUPPLIER' && result.supplierPaymentAmount && onSettleSupplier) {
        onSettleSupplier(result.supplierName || 'مؤسسة الأهرام لقطع غيار تويوتا والياباني', result.supplierPaymentAmount);
      } else if (result.action === 'COLLECT_CUSTOMER' && result.customerCollectionAmount && onCollectCustomer) {
        onCollectCustomer(result.customerName || 'ورشة الأمانة لصيانة السيارات', result.customerCollectionAmount);
      } else if (result.action === 'ADD_PURCHASE' && onAddPurchase) {
        onAddPurchase(result.supplierName || 'مؤسسة الأهرام لقطع غيار تويوتا والياباني', result.expenseAmount || 5000);
      } else if (result.action === 'QUERY_LOW_STOCK') {
        onOpenNotifications();
      } else if (result.action === 'NAVIGATE_TAB' && result.targetTab) {
        onNavigateTab(result.targetTab);
      }

      if (speechEnabled && result.spokenFeedback) {
        speakArabic(result.spokenFeedback);
      }
    } catch (err) {
      console.error('Error executing AI command:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const quickVoicePresets = [
    { label: 'بعت 1 تيل فرامل تويوتا نقدي', icon: Receipt },
    { label: 'عايز جرد تيل الفرامل ومكانه بالرف', icon: Boxes },
    { label: 'سدد 5000 للمورد الأهرام من الخزينة', icon: DollarSign },
    { label: 'حصلت 2000 من ورشة الأمانة', icon: CheckCircle2 },
    { label: 'سجل فاتورة مشتريات من المورد بـ 4500', icon: Receipt },
    { label: 'سجل مصروف 150 جنيه شاي وبوفيه', icon: DollarSign },
    { label: 'إيه الأصناف الناقصة في المخزن؟', icon: TrendingDown },
    { label: 'افتح تقارير إكسيل', icon: ArrowRight },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0F1422] border border-amber-500/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-[#191F33] to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl text-amber-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              {isListening && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  المساعد الصوتي الذكي (Voice Auto AI)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  تحدث والذكاء الاصطناعي ينفذ فورا
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                تحدث بحرية باللغة العربية: "بعت تيل"، "عايز جرد فلتر الزيت"، "سدد 5000 للمورد الأهرام"...
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !speechEnabled;
                setSpeechEnabled(next);
                if (!next) stopArabicSpeech();
              }}
              title={speechEnabled ? 'كتم الرد الصوتي' : 'تفعيل الرد الصوتي'}
              className={`p-2.5 rounded-xl border transition-colors ${
                speechEnabled 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button 
              onClick={onClose}
              className="p-2.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-[#141A2B] to-[#0D121F] rounded-3xl border border-neutral-800 relative overflow-hidden text-center">
            {isListening && (
              <>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 rounded-full border border-rose-500/30 animate-ping opacity-30" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 rounded-full bg-rose-500/10 animate-pulse" />
                </div>
              </>
            )}

            <button
              onClick={() => {
                if (isListening) {
                  stopListening();
                  if (transcript) {
                    handleExecuteCommand(transcript);
                  }
                } else {
                  startListening();
                }
              }}
              disabled={isProcessing}
              className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 ${
                isListening
                  ? 'bg-gradient-to-tr from-rose-600 to-red-500 text-white ring-8 ring-rose-500/20 shadow-rose-600/50 scale-105'
                  : 'bg-gradient-to-tr from-amber-500 to-amber-600 text-neutral-950 ring-8 ring-amber-500/10 hover:ring-amber-500/25 hover:scale-105 shadow-amber-500/30'
              }`}
            >
              {isListening ? (
                <Mic className="w-10 h-10 animate-bounce" />
              ) : (
                <Mic className="w-10 h-10" />
              )}
            </button>

            <div className="mt-4 z-10">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                isListening
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : isProcessing
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
              }`}>
                {isListening ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    جاري الاستماع لصوتك الآن... اضغط للتنفيذ
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    جاري تحليل الأمر والتنفيذ بالذكاء الاصطناعي...
                  </>
                ) : (
                  'اضغط على الميكروفون وتحدث بصوتك'
                )}
              </span>
            </div>

            <div className="mt-3 min-h-[44px] flex items-center justify-center max-w-lg z-10">
              {transcript ? (
                <p className="text-base sm:text-lg font-bold text-amber-300 bg-neutral-900/80 px-4 py-2 rounded-2xl border border-neutral-700 font-mono">
                  "{transcript}"
                </p>
              ) : (
                <p className="text-xs text-neutral-400">
                  مثال: <span className="text-neutral-300 font-semibold">"بعت تيل فرامل"</span> أو <span className="text-neutral-300 font-semibold">"عايز جرد فلتر زيت هيونداي"</span>
                </p>
              )}
            </div>

            {micError && (
              <div className="mt-3 p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 max-w-md">
                {micError}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                أوامر صوتية جاهزة بنقرة واحدة (جرب الآن):
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickVoicePresets.map((preset, idx) => {
                const IconComponent = preset.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setTranscript(preset.label);
                      handleExecuteCommand(preset.label);
                    }}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#141A2A] hover:bg-neutral-800 text-neutral-200 hover:text-amber-300 border border-neutral-800 hover:border-amber-500/40 transition-all text-right group"
                  >
                    <IconComponent className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-[#131826] rounded-2xl border border-neutral-800 flex items-center gap-2">
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleExecuteCommand(transcript);
                }
              }}
              placeholder="أو اكتب الأمر هنا مباشرة (مثلاً: بعت تيل / عايز جرد تيل الفرامل)..."
              className="flex-1 bg-transparent border-none text-white placeholder-neutral-500 text-xs sm:text-sm focus:outline-none"
            />
            <button
              onClick={() => handleExecuteCommand(transcript)}
              disabled={!transcript.trim() || isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>تنفيذ</span>
                </>
              )}
            </button>
          </div>

          {lastResult && (
            <div className={`p-4 rounded-2xl border animate-fade-in ${
              lastResult.action === 'EXECUTE_SALE'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                : lastResult.action === 'INVENTORY_AUDIT'
                ? 'bg-sky-950/30 border-sky-500/40 text-sky-200'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-black/40 mt-0.5">
                    {lastResult.action === 'EXECUTE_SALE' ? (
                      <Receipt className="w-5 h-5 text-emerald-400" />
                    ) : lastResult.action === 'INVENTORY_AUDIT' ? (
                      <Boxes className="w-5 h-5 text-sky-400" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/40 border border-white/10 uppercase tracking-wide">
                        {lastResult.action === 'EXECUTE_SALE'
                          ? '✅ تم إنجاز عملية البيع'
                          : lastResult.action === 'INVENTORY_AUDIT'
                          ? '📋 تم إنجاز الجرد المخزني'
                          : lastResult.action === 'RESTOCK_ITEM'
                          ? '📦 تم توريد المخزون'
                          : '⚡ تم تنفيذ الإجراء'}
                      </span>
                      <span className="text-[11px] text-neutral-400">{lastResult.timestamp}</span>
                    </div>
                    <p className="text-sm font-bold text-white mt-1.5 leading-relaxed">
                      {lastResult.spokenFeedback}
                    </p>
                  </div>
                </div>

                {speechEnabled && (
                  <button
                    onClick={() => speakArabic(lastResult.spokenFeedback)}
                    title="إعادة نطق الرد"
                    className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="border-t border-neutral-800/80 pt-4">
              <span className="text-xs font-bold text-neutral-400 flex items-center gap-1.5 mb-2.5">
                <History className="w-3.5 h-3.5 text-neutral-500" />
                سجل الأوامر المنفذة في هذه الجلسة:
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between text-xs text-neutral-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="font-medium text-white">{item.spokenFeedback}</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 font-mono shrink-0 mr-2">{item.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>نظام الذكاء الاصطناعي متصل وجاهز للاستماع في أي وقت</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

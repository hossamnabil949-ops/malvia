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
import { AutoPart, Customer, Invoice, Supplier, UserSession } from '../types/autoParts';
import { executeAgentAction } from '../services/agentExecutionService';
import { 
  sendVoiceCommandToServer, 
  AICommandResult, 
  speakArabic, 
  stopArabicSpeech,
  normalizeArabic,
  buildShopSnapshot,
  detectLang
} from '../services/aiVoiceService';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: AutoPart[];
  customers: Customer[];
  onDirectSale: (part: AutoPart, quantity: number, customerName: string, paymentMethod: string) => boolean;
  onOpenAudit: (part: AutoPart) => void;
  onRestock: (partId: string, quantity: number) => boolean;
  onAddExpense: (title: string, amount: number) => boolean;
  onSettleSupplier?: (supplierName: string, amount: number) => void;
  onCollectCustomer?: (customerName: string, amount: number) => void;
  onAddPurchase?: (supplierName: string, amount: number) => void;
  onOpenNotifications: () => void;
  onNavigateTab: (tab: any) => void;
  currentSession: UserSession;
  invoices?: Invoice[];
  suppliers?: Supplier[];
  shopName?: string;
  allowedActions: { sale: boolean; inventory: boolean; treasury: boolean; purchases: boolean };
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
  currentSession,
  invoices = [],
  suppliers = [],
  shopName,
  allowedActions,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<AICommandResult | null>(null);
  const [history, setHistory] = useState<AICommandResult[]>([]);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ result: AICommandResult; question: string; warning?: string } | null>(null);

  // سجل المحادثة المعروض (مستخدم/مساعد) + لغة الميكروفون
  const [messages, setMessages] = useState<Array<{ id: number; role: 'user' | 'assistant'; text: string; kind?: 'confirm' | 'audit'; partId?: string }>>([]);
  const [voiceLang, setVoiceLang] = useState<'ar-EG' | 'en-US'>('ar-EG');
  const voiceLangRef = useRef<'ar-EG' | 'en-US'>('ar-EG');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  const pushMessage = (role: 'user' | 'assistant', text: string, extra?: { kind?: 'confirm' | 'audit'; partId?: string }) => {
    if (!text) return;
    msgIdRef.current += 1;
    const id = msgIdRef.current;
    setMessages((prev) => [...prev, { id, role, text, ...extra }].slice(-60));
  };

  const recognitionRef = useRef<any>(null);
  const conversationRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const continuousModeRef = useRef(false);
  const restartingRecognitionRef = useRef(false);
  const finalTranscriptRef = useRef('');

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
      conversationRef.current = [];
      setMessages([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lastResult?.spokenFeedback) {
      pushMessage('assistant', lastResult.spokenFeedback, lastResult.action === 'INVENTORY_AUDIT' ? { kind: 'audit', partId: lastResult.matchedPartId } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  useEffect(() => {
    if (pending) pushMessage('assistant', pending.question, { kind: 'confirm' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isProcessing]);

  const startListening = () => {
    setMicError(null);
    finalTranscriptRef.current = '';
    stopArabicSpeech();
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
      recognition.lang = voiceLangRef.current;
      recognition.continuous = continuousModeRef.current;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          const spoken = String(event.results[i]?.[0]?.transcript || '').trim();
          if (!spoken) continue;
          if (event.results[i].isFinal) finalText += `${spoken} `;
          else interim += `${spoken} `;
        }
        if (finalText.trim()) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalText}`.trim();
        }
        setTranscript(`${finalTranscriptRef.current} ${interim}`.trim());
        // In continuous conversation mode, each completed utterance is a turn.
        // Stop recognition while processing/speaking to avoid recording the assistant's own voice.
        if (continuousModeRef.current && finalText.trim() && !restartingRecognitionRef.current) {
          const turn = `${finalTranscriptRef.current}`.trim();
          finalTranscriptRef.current = '';
          restartingRecognitionRef.current = true;
          try { recognition.stop(); } catch { /* ignore */ }
          void handleExecuteCommand(turn);
        }
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
        if (continuousModeRef.current && isOpen) {
          // Restart after the current turn and assistant reply; this is intentionally
          // disabled while a financial action is awaiting explicit confirmation only
          // if the user has stopped continuous mode. Confirmation can be spoken.
          restartingRecognitionRef.current = false;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Could not start recognition:', err);
      setIsListening(false);
      setMicError('تعذر تشغيل الميكروفون حالياً، يمكنك استخدام الإدخال الكتابي بالأسفل.');
    }
  };

  const stopListening = (preserveContinuous = false) => {
    if (!preserveContinuous) {
      continuousModeRef.current = false;
      setContinuousMode(false);
    }
    restartingRecognitionRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const needsConfirmation = (r: AICommandResult): boolean => {
    if (['EXECUTE_SALE', 'RESTOCK_ITEM', 'ADD_EXPENSE', 'SETTLE_SUPPLIER', 'COLLECT_CUSTOMER', 'ADD_PURCHASE'].includes(r.action)) return true;
    return false;
  };

  const describe = (r: AICommandResult): { question: string; done: string; warning?: string } => {
    const en = r.lang === 'en';
    const part = r.matchedPartId ? parts.find((p) => p.id === r.matchedPartId) : undefined;
    const qty = r.quantity && r.quantity > 0 ? r.quantity : 1;
    if (r.action === 'EXECUTE_SALE' && part) {
      const total = part.salePrice * qty;
      const who = r.customerName || (en ? 'cash customer' : 'عميل نقدي');
      const pay = r.paymentMethod || (en ? 'cash' : 'نقدي');
      return {
        question: en
          ? `Sell ${qty} ${part.unit} of "${part.name}" at ${part.salePrice} each, total ${total} EGP — ${who} — ${pay}`
          : `بيع ${qty} ${part.unit} من «${part.name}» بسعر ${part.salePrice} للوحدة، الإجمالي ${total} ج.م — ${who} — ${pay}`,
        done: en ? `Sold ${qty} ${part.unit} of ${part.name}, total ${total} EGP.` : `تم بيع ${qty} ${part.unit} من ${part.name} بإجمالي ${total} جنيه.`,
        warning: qty > part.stockQuantity ? (en ? `Warning: only ${part.stockQuantity} in stock.` : `تنبيه: الرصيد المتاح ${part.stockQuantity} فقط.`) : undefined,
      };
    }
    if (r.action === 'RESTOCK_ITEM' && part) {
      return {
        question: en ? `Add ${qty} ${part.unit} to "${part.name}" (current stock ${part.stockQuantity})` : `توريد ${qty} ${part.unit} إلى «${part.name}» (الرصيد الحالي ${part.stockQuantity})`,
        done: en ? `Added ${qty} ${part.unit} to ${part.name}.` : `تمت إضافة ${qty} ${part.unit} إلى ${part.name}.`,
      };
    }
    if (r.action === 'ADD_EXPENSE') {
      const title = r.expenseTitle || (en ? 'General expense' : 'مصروف عام');
      return {
        question: en ? `Record expense "${title}" of ${r.expenseAmount} EGP` : `تسجيل مصروف «${title}» بمبلغ ${r.expenseAmount} ج.م`,
        done: en ? `Expense of ${r.expenseAmount} EGP recorded: ${title}.` : `تم تسجيل مصروف ${r.expenseAmount} جنيه: ${title}.`,
      };
    }
    if (r.action === 'SETTLE_SUPPLIER') {
      return {
        question: en ? `Pay ${r.supplierPaymentAmount} EGP to supplier "${r.supplierName}"` : `سداد ${r.supplierPaymentAmount} ج.م للمورد «${r.supplierName}»`,
        done: en ? `Paid ${r.supplierPaymentAmount} EGP to ${r.supplierName}.` : `تم سداد ${r.supplierPaymentAmount} جنيه للمورد ${r.supplierName}.`,
      };
    }
    if (r.action === 'COLLECT_CUSTOMER') {
      return {
        question: en ? `Collect ${r.customerCollectionAmount} EGP from "${r.customerName}"` : `تحصيل ${r.customerCollectionAmount} ج.م من «${r.customerName}»`,
        done: en ? `Collected ${r.customerCollectionAmount} EGP from ${r.customerName}.` : `تم تحصيل ${r.customerCollectionAmount} جنيه من ${r.customerName}.`,
      };
    }
    if (r.action === 'ADD_PURCHASE') {
      const name = r.matchedPartName || (en ? 'the selected part' : 'الصنف المحدد');
      return {
        question: en
          ? `Purchase ${r.quantity || 1} of "${name}" from "${r.supplierName}" at unit cost ${r.unitCost}`
          : `توريد ${r.quantity || 1} من «${name}» من المورد «${r.supplierName}» بسعر شراء ${r.unitCost || 'المسجل بالنظام'} للوحدة`,
        done: en ? `Purchase invoice recorded from ${r.supplierName}.` : `تم تسجيل فاتورة مشتريات من ${r.supplierName}.`,
      };
    }
    return { question: r.spokenFeedback, done: r.spokenFeedback };
  };

  // Runs the (already verified and, when needed, confirmed) action.
  const runAction = async (result: AICommandResult) => {
    let feedback = result.spokenFeedback;
    const serverActions = ['EXECUTE_SALE', 'RESTOCK_ITEM', 'ADD_EXPENSE', 'SETTLE_SUPPLIER', 'COLLECT_CUSTOMER', 'ADD_PURCHASE'];
    let serverExecuted = false;
    if (serverActions.includes(result.action)) {
      try {
        const receipt = await executeAgentAction(result, currentSession);
        serverExecuted = true;
        feedback = result.lang === 'en'
          ? `Saved on the server successfully. Operation number: ${receipt.documentNumber}.${receipt.refreshWarning ? ` ${receipt.refreshWarning}` : ''}`
          : `تم حفظ العملية على الخادم بنجاح. رقم العملية: ${receipt.documentNumber}.${receipt.refreshWarning ? ` ${receipt.refreshWarning}` : ''}`;
      } catch (error) {
        feedback = error instanceof Error ? error.message : 'لم يؤكد الخادم حفظ العملية؛ لم يتم إعلان نجاحها.';
        const failed: AICommandResult = { ...result, spokenFeedback: feedback };
        setLastResult(failed);
        if (speechEnabled) speakArabic(feedback, () => { if (continuousModeRef.current && isOpen) startListening(); });
        else if (continuousModeRef.current && isOpen) startListening();
        return;
      }
    }

    if (serverExecuted) {
      // Financial mutations are committed and authorized by /api/agent/execute; never run UI callbacks too.
    } else if (result.action === 'EXECUTE_SALE') {
      const part = parts.find((p) => p.id === result.matchedPartId);
      if (!part) return;
      const accepted = onDirectSale(part, result.quantity || 1, result.customerName || 'عميل نقدي', result.paymentMethod || 'نقدي');
      if (!accepted) {
        feedback = 'لم تُقبل الفاتورة بسبب تحقق من الرصيد أو الوردية أو بيانات البيع. لم يتم تأكيد نجاح العملية.';
        setLastResult({ ...result, spokenFeedback: feedback });
        if (speechEnabled) speakArabic(feedback, () => { if (continuousModeRef.current && isOpen) startListening(); });
        else if (continuousModeRef.current && isOpen) startListening();
        return;
      }
      feedback = `تم قبول فاتورة البيع داخل التطبيق بإجمالي ${part.salePrice * (result.quantity || 1)} جنيه. هذا لا يؤكد وحده اكتمال المزامنة السحابية.`;
    } else if (result.action === 'INVENTORY_AUDIT') {
      // الرد الحواري يحتوي الأرقام؛ كارت الجرد يُفتح من زر داخل المحادثة بدل مقاطعة الحوار
    } else if (result.action === 'RESTOCK_ITEM' && result.matchedPartId) {
      const accepted = onRestock(result.matchedPartId, result.quantity || 1);
      feedback = accepted
        ? 'تم قبول تعديل المخزون داخل التطبيق. تحقق من حالة المزامنة لتأكيد وصوله إلى السحابة.'
        : 'تعذر قبول تعديل المخزون؛ لم يتم تأكيد نجاح العملية.';
      if (!accepted) { setLastResult({ ...result, spokenFeedback: feedback }); if (speechEnabled) speakArabic(feedback); return; }
    } else if (result.action === 'ADD_EXPENSE' && result.expenseAmount) {
      const accepted = onAddExpense(result.expenseTitle || 'مصروف عام', result.expenseAmount);
      feedback = accepted
        ? 'تم قبول تسجيل المصروف داخل التطبيق. تحقق من حالة المزامنة لتأكيد وصوله إلى السحابة.'
        : 'تعذر قبول تسجيل المصروف؛ لم يتم تأكيد نجاح العملية.';
      if (!accepted) { setLastResult({ ...result, spokenFeedback: feedback }); if (speechEnabled) speakArabic(feedback); return; }
    } else if (result.action === 'SETTLE_SUPPLIER') {
      if (onSettleSupplier && result.supplierName && result.supplierPaymentAmount) {
        onSettleSupplier(result.supplierName, result.supplierPaymentAmount);
        feedback = describe(result).done;
      } else {
        feedback = 'لتسجيل سداد المورد افتح صفحة الموردين واختر المورد. لم أنفذ أي شيء.';
        onNavigateTab('suppliers');
      }
    } else if (result.action === 'COLLECT_CUSTOMER') {
      if (onCollectCustomer && result.customerName && result.customerCollectionAmount) {
        onCollectCustomer(result.customerName, result.customerCollectionAmount);
        feedback = describe(result).done;
      } else {
        feedback = 'لتسجيل التحصيل افتح صفحة العملاء والورش واختر العميل. لم أنفذ أي شيء.';
        onNavigateTab('customers');
      }
    } else if (result.action === 'ADD_PURCHASE') {
      if (onAddPurchase && result.supplierName && result.expenseAmount) {
        onAddPurchase(result.supplierName, result.expenseAmount);
        feedback = describe(result).done;
      } else {
        feedback = 'لتسجيل فاتورة مشتريات افتح صفحة فواتير المشتريات. لم أنفذ أي شيء.';
        onNavigateTab('purchases');
      }
    } else if (result.action === 'QUERY_LOW_STOCK') {
      onOpenNotifications();
    } else if (result.action === 'NAVIGATE_TAB' && result.targetTab) {
      onNavigateTab(result.targetTab === 'home' ? 'dashboard' : result.targetTab);
      feedback = feedback || (result.lang === 'en' ? 'Opening it now.' : 'جاري الفتح.');
    }

    const finalResult: AICommandResult = { ...result, spokenFeedback: feedback };
    setLastResult(finalResult);
    if (result.action !== 'GENERAL_ANSWER') {
      setHistory((prev) => [finalResult, ...prev.slice(0, 9)]);
    }
    if (speechEnabled && feedback) {
      speakArabic(feedback, () => { if (continuousModeRef.current && isOpen) startListening(); });
    } else if (continuousModeRef.current && isOpen) {
      startListening();
    }
  };

  const confirmPending = () => {
    if (!pending) return;
    const r = pending.result;
    setPending(null);
    runAction(r);
  };

  const cancelPending = () => {
    setPending(null);
    const msg = pending?.result.lang === 'en' ? 'Cancelled. Nothing was executed.' : 'تم إلغاء الأمر ولم يتم تنفيذ شيء.';
    setLastResult({ action: 'GENERAL_ANSWER', spokenFeedback: msg, timestamp: new Date().toLocaleTimeString('ar-EG') });
    if (speechEnabled) speakArabic(msg, () => { if (continuousModeRef.current && isOpen) startListening(); });
    else if (continuousModeRef.current && isOpen) startListening();
  };

  const handleExecuteCommand = async (commandText: string) => {
    const textToExecute = commandText.trim();
    if (!textToExecute) return;

    stopListening(true);

    // While a command waits for confirmation, "تأكيد" / "إلغاء" answer it.
    if (pending) {
      const n = normalizeArabic(textToExecute);
      if (/^(تاكيد|اكد|نفذ|ايوه|ايوا|اه|موافق|تمام|اكيد|نعم|ok|okay|yes|yeah|sure|confirm|go ahead|do it)$/.test(n)) {
        setTranscript('');
        confirmPending();
        return;
      }
      if (/^(الغاء|الغي|لا|كنسل|وقف|cancel|no|stop|never mind)$/.test(n)) {
        setTranscript('');
        cancelPending();
        return;
      }
      setPending(null);
    }

    // Instant local handling for standalone greetings; do not spend an AI request on small talk.
    const normalizedGreeting = normalizeArabic(textToExecute).replace(/[.!؟?،,]+/g, '').trim();
    const instantGreetings = new Set([
      'صباح الخير', 'صباح النور', 'مساء الخير', 'مساء النور',
      'السلام عليكم', 'وعليكم السلام', 'اهلا', 'اهلا وسهلا',
      'ازيك', 'عامل ايه', 'اخبارك ايه',
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
    ]);
    if (instantGreetings.has(normalizedGreeting)) {
      const lang = detectLang(textToExecute, voiceLangRef.current === 'en-US' ? 'en' : 'ar');
      const reply = lang === 'en'
        ? 'Hello! I’m here and ready to help.'
        : 'صباح النور! أنا معاك، أقدر أساعدك في إيه؟';
      conversationRef.current = [
        ...conversationRef.current,
        { role: 'user' as const, content: textToExecute },
        { role: 'assistant' as const, content: reply },
      ].slice(-12);
      pushMessage('user', textToExecute);
      setTranscript('');
      const instantResult: AICommandResult = {
        action: 'GENERAL_ANSWER',
        lang,
        spokenFeedback: reply,
        timestamp: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US'),
      };
      setLastResult(instantResult);
      if (speechEnabled) speakArabic(reply, () => {
        if (continuousModeRef.current && isOpen) startListening();
      });
      else if (continuousModeRef.current && isOpen) startListening();
      return;
    }

    setIsProcessing(true);
    setMicError(null);

    try {
      conversationRef.current = [...conversationRef.current, { role: 'user' as const, content: textToExecute }].slice(-12);
      pushMessage('user', textToExecute);
      setTranscript('');
      const shop = buildShopSnapshot(parts, invoices, suppliers, currentSession, shopName);
      const result = await sendVoiceCommandToServer(
        textToExecute, parts, customers, conversationRef.current.slice(0, -1), shop,
        voiceLangRef.current === 'en-US' ? 'en' : 'ar'
      );

      const requiredPermission = result.action === 'EXECUTE_SALE' || result.action === 'COLLECT_CUSTOMER'
        ? (result.action === 'COLLECT_CUSTOMER' ? allowedActions.treasury : allowedActions.sale)
        : result.action === 'RESTOCK_ITEM' || result.action === 'INVENTORY_AUDIT'
        ? allowedActions.inventory
        : result.action === 'ADD_EXPENSE'
        ? allowedActions.treasury
        : result.action === 'SETTLE_SUPPLIER'
        ? (allowedActions.treasury || allowedActions.purchases)
        : result.action === 'ADD_PURCHASE'
        ? allowedActions.purchases
        : true;
      if (!requiredPermission) {
        const message = result.lang === 'en' ? 'Sorry, your account does not have permission for this action. Nothing was executed.' : 'عذراً، حسابك لا يملك صلاحية تنفيذ هذا الإجراء. لم يتم تنفيذ أي شيء.';
        const denied: AICommandResult = { action: 'GENERAL_ANSWER', spokenFeedback: message, timestamp: new Date().toLocaleTimeString('ar-EG') };
        setLastResult(denied);
        conversationRef.current = [...conversationRef.current, { role: 'assistant' as const, content: message }].slice(-12);
        if (speechEnabled) speakArabic(message, () => { if (continuousModeRef.current && isOpen) startListening(); });
        else if (continuousModeRef.current && isOpen) startListening();
        return;
      }

      if (needsConfirmation(result)) {
        const d = describe(result);
        setPending({ result, question: d.question, warning: d.warning });
        setLastResult(null);
        if (speechEnabled) speakArabic(result.lang === 'en' ? `Do you mean: ${d.question}? Say confirm or cancel.` : `هل تقصد: ${d.question}؟ قل تأكيد أو إلغاء.`, () => {
          if (continuousModeRef.current && isOpen) startListening();
        });
        else if (continuousModeRef.current && isOpen) startListening();
      } else {
        runAction(result);
      }
      conversationRef.current = [...conversationRef.current, { role: 'assistant' as const, content: result.spokenFeedback }].slice(-12);
    } catch (err) {
      console.error('Error executing AI command:', err);
      const message = err instanceof Error ? err.message : 'تعذر معالجة الأمر. لم يتم تنفيذ أي شيء.';
      setLastResult({ action: 'GENERAL_ANSWER', spokenFeedback: message, timestamp: new Date().toLocaleTimeString('ar-EG') });
      if (speechEnabled) speakArabic(message, () => { if (continuousModeRef.current && isOpen) startListening(); });
      else if (continuousModeRef.current && isOpen) startListening();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const quickVoicePresets = [
    { label: 'إيه أكتر الأصناف مبيعاً الشهر ده؟', icon: TrendingDown },
    { label: 'بعت 1 تيل فرامل تويوتا نقدي', icon: Receipt },
    { label: 'كام فلتر زيت فاضل وفين مكانه؟', icon: Boxes },
    { label: 'What is low on stock right now?', icon: TrendingDown },
    { label: 'Sell 2 oil filters to cash customer', icon: Receipt },
    { label: 'سجل مصروف 150 جنيه شاي وبوفيه', icon: DollarSign },
    { label: 'افتح صفحة المخزون الحرج', icon: ArrowRight },
    { label: 'اشرحلي إزاي أسجل فاتورة مشتريات', icon: CheckCircle2 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-2 border border-amber-500/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-neutral-900 via-surface-3 to-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-amber-500/20 to-amber-500/20 border border-amber-500/30 rounded-2xl text-amber-400">
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
                  المساعد الذكي (Gemini AI)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  يناقشك وينفذ بعد تأكيدك
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                اتكلم أو اكتب بالعربي أو English، واسأله أي سؤال عن المحل والمخزون والمبيعات، أو اطلب منه تنفيذ عملية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = voiceLangRef.current === 'ar-EG' ? 'en-US' : 'ar-EG';
                voiceLangRef.current = next;
                setVoiceLang(next);
              }}
              title="لغة الميكروفون: عربي / English"
              className="px-2.5 py-2 rounded-xl border bg-neutral-800 border-neutral-700 text-neutral-200 hover:text-amber-300 text-[11px] font-black"
            >
              {voiceLang === 'ar-EG' ? 'ع | AR' : 'EN'}
            </button>
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
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-surface-2 to-surface-1 rounded-3xl border border-neutral-800 relative overflow-hidden text-center">
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

            <div className="relative z-10 flex flex-col items-center gap-3">
            <button
              onClick={() => {
                const next = !continuousModeRef.current;
                continuousModeRef.current = next;
                setContinuousMode(next);
                finalTranscriptRef.current = '';
                if (next) {
                  startListening();
                } else {
                  if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* ignore */ } }
                  setIsListening(false);
                }
              }}
              disabled={isProcessing}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${continuousMode ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-amber-500/40'}`}
              title="تشغيل أو إيقاف المحادثة الصوتية المستمرة"
            >
              {continuousMode ? 'إيقاف المحادثة المستمرة' : 'تشغيل المحادثة المستمرة'}
            </button>
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
                  ? 'bg-gradient-to-tr from-rose-600 to-rose-500 text-[#ffffff] ring-8 ring-rose-500/20 shadow-rose-600/50 scale-105'
                  : 'bg-gradient-to-tr from-amber-500 to-amber-600 text-neutral-950 ring-8 ring-amber-500/10 hover:ring-amber-500/25 hover:scale-105 shadow-amber-500/30'
              }`}
            >
              {isListening ? (
                <Mic className="w-10 h-10 animate-bounce" />
              ) : (
                <Mic className="w-10 h-10" />
              )}
            </button>
            </div>

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
                    جاري التفكير...
                  </>
                ) : (
                  continuousMode ? 'المحادثة المستمرة مفعّلة — قل طلبك، ثم استمع للرد' : 'اضغط على الميكروفون وتحدث بصوتك'
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
                  جرّب: <span className="text-neutral-300 font-semibold">"إيه أكتر صنف بيتباع؟"</span> أو <span className="text-neutral-300 font-semibold">"sell 2 oil filters"</span>
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
                جرّب مباشرة (عربي / English):
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-surface-2 hover:bg-neutral-800 text-neutral-200 hover:text-amber-300 border border-neutral-800 hover:border-amber-500/40 transition-all text-right group"
                  >
                    <IconComponent className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-surface-2 rounded-2xl border border-neutral-800 flex items-center gap-2">
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleExecuteCommand(transcript);
                }
              }}
              placeholder="اكتب رسالتك هنا بالعربي أو English..."
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
                  <span>إرسال</span>
                </>
              )}
            </button>
          </div>

          {pending && (
            <div className="p-4 rounded-2xl border border-amber-500/50 bg-amber-950/30 animate-fade-in">
              <div className="text-xs font-bold text-amber-300 mb-1.5">هل هذا ما تقصده؟ لن يُنفَّذ شيء قبل التأكيد</div>
              <p className="text-sm font-bold text-white leading-relaxed">{pending.question}</p>
              {pending.warning && (
                <p className="text-xs font-bold text-rose-400 mt-1.5">{pending.warning}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={confirmPending}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black bg-emerald-500 hover:bg-emerald-400 text-[#052e1a] transition-colors"
                >
                  تأكيد التنفيذ
                </button>
                <button
                  onClick={cancelPending}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    dir="auto"
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-neutral-800 text-white border border-neutral-700'
                        : m.kind === 'confirm'
                        ? 'bg-amber-950/40 text-amber-100 border border-amber-500/40'
                        : 'bg-surface-3 text-neutral-100 border border-amber-500/20'
                    }`}
                  >
                    {m.text}
                    {m.kind === 'audit' && m.partId && (
                      <button
                        onClick={() => { const part = parts.find((p) => p.id === m.partId); if (part) onOpenAudit(part); }}
                        className="mt-2 block text-[11px] font-bold text-amber-300 hover:underline"
                      >
                        فتح كارت الجرد / Open stock card
                      </button>
                    )}
                    {m.role === 'assistant' && speechEnabled && (
                      <button onClick={() => speakArabic(m.text)} title="إعادة نطق الرد" className="mr-2 inline-flex align-middle text-neutral-500 hover:text-amber-300">
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-end">
                  <div className="px-3.5 py-2.5 rounded-2xl bg-surface-3 border border-amber-500/20 text-neutral-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    ...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>متصل بـ Gemini — أي عملية مالية تحتاج تأكيدك قبل التنفيذ</span>
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

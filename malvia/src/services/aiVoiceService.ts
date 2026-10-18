import { AutoPart, Customer } from '../types/autoParts';

export type AIActionType = 
  | 'EXECUTE_SALE' 
  | 'INVENTORY_AUDIT' 
  | 'RESTOCK_ITEM' 
  | 'ADD_PURCHASE'
  | 'SETTLE_SUPPLIER'
  | 'COLLECT_CUSTOMER'
  | 'ADD_EXPENSE' 
  | 'QUERY_LOW_STOCK' 
  | 'NAVIGATE_TAB' 
  | 'GENERAL_ANSWER';

export interface AICommandResult {
  action: AIActionType;
  matchedPartId?: string;
  matchedPartName?: string;
  quantity?: number;
  customerName?: string;
  paymentMethod?: string;
  expenseTitle?: string;
  expenseAmount?: number;
  supplierName?: string;
  supplierPaymentAmount?: number;
  customerCollectionAmount?: number;
  targetTab?: 'home' | 'pos' | 'inventory' | 'invoices' | 'purchases' | 'suppliers' | 'customers' | 'finance' | 'reports' | 'settings';
  spokenFeedback: string;
  timestamp?: string;
}

export async function sendVoiceCommandToServer(
  command: string,
  parts: AutoPart[],
  customers: Customer[]
): Promise<AICommandResult> {
  try {
    const response = await fetch('/api/ai/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command,
        parts: parts.map((p) => ({
          id: p.id,
          partNumber: p.partNumber,
          name: p.name,
          brand: p.brand,
          compatibleModels: p.compatibleModels,
          category: p.category,
          shelfLocation: p.shelfLocation,
          costPrice: p.costPrice,
          salePrice: p.salePrice,
          stockQuantity: p.stockQuantity,
          minAlertStock: p.minAlertStock,
          unit: p.unit,
        })),
        customers: customers.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          balance: c.balance,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data: AICommandResult = await response.json();
    return {
      ...data,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch (error) {
    console.warn('Network call to /api/ai/command failed, applying instant client-side fallback:', error);
    return getClientFallbackResult(command, parts, customers);
  }
}

function getClientFallbackResult(command: string, parts: AutoPart[], customers: Customer[]): AICommandResult {
  const cmd = command.toLowerCase().trim();
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let quantity = 1;
  const numMatches = cmd.match(/\b(\d+)\b/g);
  let mainNumber = numMatches ? parseInt(numMatches[0], 10) : 1;

  if (/حبتين|قطعتين|طقمين|اتنين|2/.test(cmd)) {
    quantity = 2;
  } else if (/ثلاث|3/.test(cmd)) {
    quantity = 3;
  } else if (numMatches) {
    quantity = mainNumber;
  }

  if (/سدد|ادفع|سداد.*مورد|صرف.*مورد/.test(cmd)) {
    const amount = mainNumber > 10 ? mainNumber : 3000;
    const supName = cmd.includes('بوش') || cmd.includes('هندسية')
      ? 'الشركة الهندسية للزيوت والفلاتر الألمانية Bosch'
      : (cmd.includes('خراطة') || cmd.includes('دقة') ? 'ورشة الدقة الحديثة للخراطة وتصنيع الطنابير' : 'مؤسسة الأهرام لقطع غيار تويوتا والياباني');

    return {
      action: 'SETTLE_SUPPLIER',
      supplierName: supName,
      supplierPaymentAmount: amount,
      paymentMethod: 'نقدي',
      spokenFeedback: `تم تسجيل سند صرف وسداد دفعة ${amount} جنيه للمورد ${supName} وخصم المبلغ من الخزينة.`,
      timestamp: time,
    };
  }

  if (/حصلت|استلمت.*ورشة|قبض.*ورشة|دفعة.*ورشة|سداد.*ورشة/.test(cmd)) {
    const amount = mainNumber > 10 ? mainNumber : 2000;
    const cust = customers.find(c => cmd.includes(c.name.toLowerCase())) || customers[0];

    return {
      action: 'COLLECT_CUSTOMER',
      customerName: cust ? cust.name : 'ورشة الأمانة لصيانة السيارات',
      customerCollectionAmount: amount,
      paymentMethod: 'نقدي',
      spokenFeedback: `تم استلام وتحصيل مبلغ ${amount} جنيه من ${cust ? cust.name : 'الورشة'} وإيداعه في الخزينة وتخفيض المديونية.`,
      timestamp: time,
    };
  }

  if (/مشتريات|فاتورة توريد|اشتريت.*من|توريد.*من/.test(cmd)) {
    const amount = mainNumber > 100 ? mainNumber : 5800;
    const supName = 'مؤسسة الأهرام لقطع غيار تويوتا والياباني';
    return {
      action: 'ADD_PURCHASE',
      supplierName: supName,
      expenseAmount: amount,
      spokenFeedback: `تم تسجيل فاتورة مشتريات وتوريد بضاعة بقيمة ${amount} جنيه وتحديث أرصدة المستودع وحساب المورد.`,
      timestamp: time,
    };
  }

  if (/مصروف|كهرباء|إيجار|بوفيه|ضيافة|نقل|شحن/.test(cmd)) {
    const amount = mainNumber > 10 ? mainNumber : 250;
    let title = 'مصروفات ونثريات وضيافة الورش';
    if (/كهرباء/.test(cmd)) title = 'فاتورة كهرباء وإنارة المحل';
    if (/إيجار/.test(cmd)) title = 'إيجار المحل والمستودع';
    if (/شحن|نقل/.test(cmd)) title = 'أجور شحن ونقل بضائع';

    return {
      action: 'ADD_EXPENSE',
      expenseTitle: title,
      expenseAmount: amount,
      spokenFeedback: `تم قيد المصروف بقيمة ${amount} جنيه في الخزينة: ${title}.`,
      timestamp: time,
    };
  }

  let matched = parts.find((p) => {
    if (/تيل|فحمات|أقمشة|فرامل/.test(cmd) && (p.category === 'فرامل ومكابح' || p.name.includes('فرامل') || p.name.includes('فحمات'))) return true;
    if (/|/.test(cmd) && (p.isScreenOrDisplay || p.category === 'كهرباء وإلكترونيات')) return true;
    if (/بوجيه|بواجي/.test(cmd) && (p.name.includes('بواجي') || p.category === 'محرك وكهرباء')) return true;
    if (/فلتر زيت/.test(cmd) && p.name.includes('فلتر زيت')) return true;
    if (/فلتر هواء/.test(cmd) && p.name.includes('فلتر هواء')) return true;
    if (/مساعد/.test(cmd) && p.name.includes('مساعد')) return true;
    return false;
  }) || parts[0];

  if (/بعت|بيع|اصرف|خرجت/.test(cmd)) {
    return {
      action: 'EXECUTE_SALE',
      matchedPartId: matched.id,
      matchedPartName: matched.name,
      quantity,
      customerName: cmd.includes('ورشة') ? 'ورشة الأمانة لصيانة السيارات' : 'عميل نقدي تجزئة',
      paymentMethod: 'نقدي',
      spokenFeedback: `تم تنفيذ عملية بيع ${quantity} ${matched.unit} من ${matched.name} وإصدار الفاتورة وتحديث المخزون بنجاح.`,
      timestamp: time,
    };
  }

  if (/جرد|شوفلي|مكان|مخزون|رصيد|كم باقي/.test(cmd)) {
    return {
      action: 'INVENTORY_AUDIT',
      matchedPartId: matched.id,
      matchedPartName: matched.name,
      spokenFeedback: `جرد ${matched.name}: الرصيد المتوفر بالمستودع ${matched.stockQuantity} ${matched.unit} على ${matched.shelfLocation}، سعر البيع ${matched.salePrice} جنيه.`,
      timestamp: time,
    };
  }

  if (/موردين|حسابات الموردين/.test(cmd)) {
    return {
      action: 'NAVIGATE_TAB',
      targetTab: 'suppliers',
      spokenFeedback: 'جاري فتح  الموردين وسداد الدفعات.',
      timestamp: time,
    };
  }
  if (/مشتريات|فاتورة شراء/.test(cmd)) {
    return {
      action: 'NAVIGATE_TAB',
      targetTab: 'purchases',
      spokenFeedback: 'جاري فتح  فواتير المشتريات.',
      timestamp: time,
    };
  }
  if (/تقارير|إكسيل|اكسل/.test(cmd)) {
    return {
      action: 'NAVIGATE_TAB',
      targetTab: 'reports',
      spokenFeedback: 'جاري الانتقال لمركز تقارير وتصدير إكسيل.',
      timestamp: time,
    };
  }
  if (/إعدادات|موظفين|شعار/.test(cmd)) {
    return {
      action: 'NAVIGATE_TAB',
      targetTab: 'settings',
      spokenFeedback: 'جاري فتح  الإعدادات وتسجيل الموظفين.',
      timestamp: time,
    };
  }

  return {
    action: 'GENERAL_ANSWER',
    spokenFeedback: 'أهلاً بك في MALVIA. يمكنك القول: "بعت تيل تويوتا"، "جرد فلتر الزيت"، "سدد 5000 للمورد الأهرام"، أو "سجل مصروف 200 كهرباء".',
    timestamp: time,
  };
}

export function speakArabic(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find((v) => v.lang.startsWith('ar') || v.name.includes('Arabic') || v.name.includes('Tarek') || v.name.includes('Laila'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    if (onEnd) onEnd();
  }
}

export function stopArabicSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

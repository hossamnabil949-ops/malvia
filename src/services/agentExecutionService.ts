import type { AICommandResult } from './aiVoiceService';
import type { UserSession } from '../types/autoParts';
import { pullAll } from './syncService';

export interface AgentExecutionReceipt {
  success: true;
  action: string;
  operationId: string;
  documentNumber: string;
  amount?: number;
  quantity?: number;
  message: string;
  idempotentReplay?: boolean;
  refreshWarning?: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `ai:${crypto.randomUUID()}`;
  return `ai:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}

export async function executeAgentAction(result: AICommandResult, session: UserSession): Promise<AgentExecutionReceipt> {
  if (!session.serverSessionToken || (session.serverSessionExpiresAt && Date.parse(session.serverSessionExpiresAt) <= Date.now())) {
    throw new Error('لا توجد جلسة موظف موثقة على الخادم أو انتهت صلاحيتها. سجّل الخروج ثم الدخول مجددًا مع اتصال الإنترنت. لم تُنفّذ العملية.');
  }

  const payload: Record<string, unknown> = { paymentMethod: result.paymentMethod || (result.action === 'ADD_PURCHASE' ? 'آجل' : 'نقدي') };
  switch (result.action) {
    case 'EXECUTE_SALE':
      if (!result.matchedPartId || !Number.isInteger(result.quantity || 1) || (result.quantity || 1) <= 0) throw new Error('حدد الصنف والكمية الصحيحة قبل التنفيذ.');
      Object.assign(payload, { partId: result.matchedPartId, quantity: result.quantity || 1, customerName: result.customerName || 'عميل نقدي' });
      break;
    case 'RESTOCK_ITEM':
      if (!result.matchedPartId || !Number.isInteger(result.quantity || 1) || (result.quantity || 1) <= 0) throw new Error('حدد الصنف والكمية الصحيحة قبل التوريد للمخزون.');
      Object.assign(payload, { partId: result.matchedPartId, quantity: result.quantity || 1 });
      break;
    case 'ADD_EXPENSE':
      if (!Number.isFinite(result.expenseAmount) || (result.expenseAmount || 0) <= 0) throw new Error('مبلغ المصروف غير صالح.');
      Object.assign(payload, { title: result.expenseTitle || 'مصروف عام', amount: result.expenseAmount });
      break;
    case 'SETTLE_SUPPLIER':
      if (!result.supplierName || !Number.isFinite(result.supplierPaymentAmount) || (result.supplierPaymentAmount || 0) <= 0) throw new Error('حدد المورد ومبلغ السداد الصحيح.');
      Object.assign(payload, { supplierName: result.supplierName, amount: result.supplierPaymentAmount, treasurySource: 'الخزينة الرئيسية' });
      break;
    case 'COLLECT_CUSTOMER':
      if (!result.customerName || !Number.isFinite(result.customerCollectionAmount) || (result.customerCollectionAmount || 0) <= 0) throw new Error('حدد العميل ومبلغ التحصيل الصحيح.');
      Object.assign(payload, { customerName: result.customerName, amount: result.customerCollectionAmount });
      break;
    case 'ADD_PURCHASE':
      if (!result.matchedPartId || !result.supplierName || !Number.isInteger(result.quantity || 1) || (result.quantity || 1) <= 0 || !Number.isFinite(result.unitCost) || (result.unitCost || 0) <= 0) {
        throw new Error('فاتورة التوريد تحتاج اسم المورد والصنف والكمية وسعر الشراء للوحدة. لم يتم حفظ أي شيء.');
      }
      Object.assign(payload, { partId: result.matchedPartId, supplierName: result.supplierName, quantity: result.quantity || 1, unitCost: result.unitCost });
      break;
    default:
      throw new Error('هذا الإجراء لا يُنفّذ عبر واجهة العمليات المالية الآمنة.');
  }

  const response = await fetch('/api/agent/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-license-key': session.licenseKey,
      Authorization: `Bearer ${session.serverSessionToken}`,
      'Idempotency-Key': newIdempotencyKey(),
    },
    body: JSON.stringify({ action: result.action, payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success !== true || !body?.operationId || !body?.documentNumber) {
    throw new Error(String(body?.error || 'لم يؤكد الخادم حفظ العملية. لا تعتبر العملية ناجحة.'));
  }

  // Pull the authoritative cloud documents after the DB transaction commits.
  let refreshWarning: string | undefined;
  try { await pullAll(session.tenantId, session.licenseKey, session.serverSessionToken); }
  catch (error) { refreshWarning = 'تم تأكيد الحفظ على الخادم، لكن تعذر تحديث بيانات الشاشة تلقائيًا. أعد المزامنة قبل تنفيذ عملية أخرى.'; console.warn('Agent operation saved; cloud refresh failed', error); }
  window.dispatchEvent(new CustomEvent('malvia-sync-updated'));
  return { ...(body as AgentExecutionReceipt), ...(refreshWarning ? { refreshWarning } : {}) };
}

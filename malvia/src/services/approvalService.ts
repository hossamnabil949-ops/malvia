// موافقة المدير على العمليات الحساسة (مثل إلغاء فاتورة): يعمل Offline على قائمة الموظفين المحلية.
import { Employee } from '../types/autoParts';
import { isHashed, verifyPassword } from './passwordService';

/** يتحقق من بيانات مدير عام نشط. يرجع الموظف عند النجاح أو null. */
export async function verifyManagerApproval(
  employees: Employee[],
  usernameOrPhone: string,
  password: string
): Promise<Employee | null> {
  const key = usernameOrPhone.trim().toLowerCase();
  const pass = password.trim();
  if (!key || !pass) return null;

  const manager = employees.find(e =>
    e.role === 'مدير عام' && e.status === 'نشط' &&
    ((e.username && e.username.toLowerCase() === key) || e.phone === key || e.name.toLowerCase() === key)
  );
  if (!manager) return null;

  if (manager.passwordHash && isHashed(manager.passwordHash)) {
    return (await verifyPassword(pass, manager.passwordHash)) ? manager : null;
  }
  // حساب قديم لم يُرحَّل بعد (نص) — يُرحَّل عند أول دخول
  const legacy = manager.password || '123456';
  return pass === legacy ? manager : null;
}

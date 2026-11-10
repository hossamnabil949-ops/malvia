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

/** يتحقق من باسورد المالك فقط (أي حساب مدير عام نشط). يرجع المدير عند النجاح أو null. */
export async function verifyOwnerPassword(employees: Employee[], password: string): Promise<Employee | null> {
  const pass = password.trim();
  if (!pass) return null;
  const managers = employees.filter(e => e.role === 'مدير عام' && e.status === 'نشط');
  for (const m of managers) {
    if (m.passwordHash && isHashed(m.passwordHash)) {
      if (await verifyPassword(pass, m.passwordHash)) return m;
    } else if (pass === (m.password || '123456')) {
      return m;
    }
  }
  return null;
}


/** Online owner re-authentication. Password verification is performed only by the server. */
export async function verifyOwnerPasswordOnline(licenseKey: string, password: string): Promise<boolean> {
  if (!licenseKey || !password || password.length > 200) return false;
  let token = '';
  try {
    const raw = localStorage.getItem('malvia_user_session_v1');
    const session = raw ? JSON.parse(raw) : null;
    token = String(session?.serverSessionToken || '');
  } catch { return false; }
  if (!token) return false;
  try {
    const response = await fetch('/api/owner-password-approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-license-key': licenseKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => null);
    return response.ok && result?.approved === true;
  } catch {
    return false;
  }
}

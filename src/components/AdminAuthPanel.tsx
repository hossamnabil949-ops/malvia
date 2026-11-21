import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

type Props = { onAuthenticated: () => void };

export const AdminAuthPanel: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap' | 'setup'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/auth', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data) { setMode('login'); return; }
        if (data.authenticated) { onAuthenticated(); return; }
        setMode(data.bootstrapAvailable ? 'bootstrap' : 'login');
      })
      .catch(() => { setError('تعذر الاتصال بخدمة دخول مسؤولي MALVIA.'); setMode('login'); });
  }, []);

  const post = async (body: Record<string, string>, endpoint = '/api/admin/auth') => {
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = [data?.error || 'تعذر إتمام العملية.', data?.code ? 'Code: ' + data.code : '', data?.traceId ? 'Trace: ' + data.traceId : ''].filter(Boolean).join(' — ');
      throw new Error(details);
    }
    return data;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'bootstrap') {
        const data = await post({ action: 'bootstrap', bootstrapToken, username, password });
        setSetupSecret(String(data.totpSecret || ''));
        setUsername(String(data.username || username));
        setBootstrapToken(''); setPassword(''); setMode('setup');
      } else if (mode === 'setup') {
        await post({ action: 'confirm-setup', username, code: setupCode });
        setSetupSecret(''); onAuthenticated();
      } else {
        await post({ action: 'login', username, password, code: totpCode });
        setPassword(''); setTotpCode(''); onAuthenticated();
      }
    } catch (e: any) { setError(String(e?.message || 'تعذر إتمام العملية.')); }
    finally { setBusy(false); }
  };

  if (mode === 'loading') return <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">جارٍ التحقق من جلسة الإدارة...</div>;

  return (
    <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-4 flex-1">
      <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
        {mode === 'setup' ? <ShieldCheck className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
      </div>
      <div className="max-w-md space-y-1.5">
        <h3 className="text-lg font-black text-white">دخول مسؤولي MALVIA</h3>
        <p className="text-xs text-neutral-400">حساب إداري مستقل مع كلمة مرور ورمز تحقق متغير من تطبيق المصادقة.</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 pt-2">
        {mode === 'bootstrap' && (
          <>
            <p className="text-xs text-amber-300">تهيئة أول مسؤول فقط. يلزم رمز تهيئة مضبوط في إعدادات Preview على Vercel.</p>
            <input value={bootstrapToken} onChange={e => setBootstrapToken(e.target.value)} type="password" autoComplete="off" placeholder="رمز التهيئة المؤقت" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-white" />
          </>
        )}
        {mode !== 'setup' && (
          <>
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="اسم المستخدم الإداري" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-white" />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'} placeholder={mode === 'bootstrap' ? 'كلمة مرور قوية (14 حرفاً على الأقل)' : 'كلمة المرور'} className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-neutral-700 text-white" />
          </>
        )}
        {mode === 'setup' && (
          <>
            <p className="text-xs text-emerald-300">أضف المفتاح التالي إلى تطبيق Authenticator ثم أدخل الرمز الظاهر فيه لتفعيل الحساب.</p>
            <div className="rounded-xl bg-neutral-900 border border-neutral-700 p-3 text-amber-300 font-mono text-sm break-all select-all">{setupSecret}</div>
            <input value={setupCode} onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="رمز التحقق المكوّن من 6 أرقام" className="w-full h-12 text-center tracking-[0.35em] font-mono rounded-xl bg-surface-2 border border-neutral-700 text-white" />
          </>
        )}
        {mode === 'login' && (
          <input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="رمز التحقق من التطبيق" className="w-full h-11 px-3 text-center tracking-[0.35em] font-mono rounded-xl bg-surface-2 border border-neutral-700 text-white" />
        )}
        <button disabled={busy || (mode === 'bootstrap' && (!bootstrapToken || username.length < 3 || password.length < 14)) || (mode === 'login' && (!username || !password || totpCode.length !== 6)) || (mode === 'setup' && setupCode.length !== 6)} className="w-full py-3 rounded-xl bg-amber-500 text-neutral-950 font-black text-xs disabled:opacity-50">
          {busy ? 'جارٍ التحقق...' : mode === 'bootstrap' ? 'إنشاء حساب المسؤول الأول' : mode === 'setup' ? 'تفعيل المصادقة الثنائية' : 'تسجيل الدخول الآمن'}
        </button>
      </form>
      {error && <p className="text-xs text-rose-400 max-w-sm">{error}</p>}
      <span className="text-[11px] text-neutral-500 font-mono">MALVIA Secure Administration</span>
    </div>
  );
};

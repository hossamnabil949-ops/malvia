// معرفات حركات مالية قصيرة وعالية التفرّد، تعمل دون اتصال ولا تعتمد على نطاق 9,000 رقم.
export const uniqueTransactionNumber = (prefix = 'TX', date = new Date()): string => {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
  return `${prefix}-${day}-${token}`;
};
